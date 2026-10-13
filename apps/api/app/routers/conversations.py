import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.conversation import Conversation, ConversationType, ConversationParticipant
from app.models.message import Message
from app.models.team import Team
from app.models.team_membership import TeamMembership
from app.models.user import User, UserRole
from app.schemas.chat import (
    ConversationSummaryResponse,
    CreateDMRequest,
    MarkReadResponse,
    MessageCreateRequest,
    MessageEditRequest,
    MessageResponse,
    MessageSenderInfo,
    ReactionSummary,
    ReactionToggleRequest,
    ReactionToggleResponse,
    ReplySnippet,
)
from app.services import chat_service
from app.realtime.socket_manager import sio, serialize_message

router = APIRouter(prefix="/conversations", tags=["Conversations & Chat"])


def format_reactions_summary(reactions) -> List[ReactionSummary]:
    if not reactions:
        return []
    grouped: dict[str, dict] = {}
    for r in reactions:
        if r.emoji not in grouped:
            grouped[r.emoji] = {"count": 0, "user_ids": [], "user_names": []}
        grouped[r.emoji]["count"] += 1
        grouped[r.emoji]["user_ids"].append(r.user_id)
        user_name = r.user.display_name if r.user else "User"
        grouped[r.emoji]["user_names"].append(user_name)
    return [
        ReactionSummary(
            emoji=emoji,
            count=data["count"],
            user_ids=data["user_ids"],
            user_names=data["user_names"],
        )
        for emoji, data in grouped.items()
    ]


def format_message_response(msg: Message) -> MessageResponse:
    reply_snippet = None
    if msg.reply_to:
        reply_snippet = ReplySnippet(
            id=msg.reply_to.id,
            sender_name=msg.reply_to.sender.display_name if msg.reply_to.sender else "User",
            content=msg.reply_to.content[:100],
        )

    reactions = format_reactions_summary(getattr(msg, "reactions", []))

    return MessageResponse(
        id=msg.id,
        client_id=msg.client_id,
        conversation_id=msg.conversation_id,
        sender=MessageSenderInfo(
            id=msg.sender.id if msg.sender else msg.sender_id,
            display_name=msg.sender.display_name if msg.sender else "User",
            email=msg.sender.email if msg.sender else "",
            role=msg.sender.role.value if msg.sender else "EMPLOYEE",
            status=msg.sender.status.value if msg.sender and hasattr(msg.sender, "status") and msg.sender.status else "AVAILABLE",
            status_text=msg.sender.status_text if msg.sender else None,
        ),
        content=msg.content,
        is_edited=msg.is_edited,
        is_deleted=msg.is_deleted,
        reply_to=reply_snippet,
        reactions=reactions,
        created_at=msg.created_at,
        updated_at=msg.updated_at,
    )


@router.get("", response_model=List[ConversationSummaryResponse])
async def list_conversations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieve all conversations accessible to the current user:
    - #updates (company-wide)
    - Team channels (own team groups, or all team groups if Main-Admin)
    - 1:1 Direct Messages
    """
    # 1. Ensure #updates exists
    updates_conv = await chat_service.get_or_create_updates_channel(db)

    # 2. Query team conversations
    if current_user.role == UserRole.MAIN_ADMIN:
        teams_query = select(Team)
    else:
        teams_query = (
            select(Team)
            .join(TeamMembership, TeamMembership.team_id == Team.id)
            .where(
                TeamMembership.user_id == current_user.id,
                TeamMembership.left_at.is_(None),
            )
        )
    teams_res = await db.execute(teams_query)
    user_teams = teams_res.scalars().all()

    team_conv_map = {}
    for team in user_teams:
        t_conv = await chat_service.get_or_create_team_conversation(db, team.id)
        team_conv_map[t_conv.id] = team

    # 3. Query user DMs
    dm_query = (
        select(Conversation)
        .join(ConversationParticipant, ConversationParticipant.conversation_id == Conversation.id)
        .where(
            Conversation.type == ConversationType.DM,
            ConversationParticipant.user_id == current_user.id,
        )
    )
    dm_res = await db.execute(dm_query)
    dms = dm_res.scalars().all()

    all_convs = [updates_conv] + list(team_conv_map.keys()) + list(dms)

    summaries = []
    for conv_id_or_obj in all_convs:
        conv = conv_id_or_obj if isinstance(conv_id_or_obj, Conversation) else await db.get(Conversation, conv_id_or_obj)
        if not conv:
            continue

        # Fetch last message
        last_msg_query = (
            select(Message)
            .where(Message.conversation_id == conv.id)
            .order_by(desc(Message.created_at))
            .limit(1)
        )
        last_msg_res = await db.execute(last_msg_query)
        last_msg = last_msg_res.scalar_one_or_none()
        # Fetch participant records for last_read_at
        my_part_res = await db.execute(
            select(ConversationParticipant).where(
                ConversationParticipant.conversation_id == conv.id,
                ConversationParticipant.user_id == current_user.id,
            )
        )
        my_participant = my_part_res.scalar_one_or_none()
        my_last_read_at = my_participant.last_read_at if my_participant else None

        unread_count = await chat_service.get_conversation_unread_count(
            db, conv.id, current_user, my_last_read_at
        )

        title = "Conversation"
        slug = None
        color = None
        team_id = None
        other_user = None
        other_user_last_read_at = None

        if conv.type == ConversationType.UPDATES:
            title = "#updates"
            slug = "updates"
        elif conv.type == ConversationType.TEAM_GROUP:
            team = conv.team or (await db.get(Team, conv.team_id) if conv.team_id else None)
            if team:
                title = f"#{team.display_name}"
                slug = team.name
                color = team.color
                team_id = team.id
        elif conv.type == ConversationType.DM:
            # Find the other participant
            other_part_res = await db.execute(
                select(ConversationParticipant).where(
                    ConversationParticipant.conversation_id == conv.id,
                    ConversationParticipant.user_id != current_user.id,
                )
            )
            other_participant = other_part_res.scalar_one_or_none()
            if other_participant:
                other_user_last_read_at = other_participant.last_read_at
                other = await db.get(User, other_participant.user_id)
                if other:
                    title = other.display_name
                    other_user = MessageSenderInfo(
                        id=other.id,
                        display_name=other.display_name,
                        email=other.email,
                        role=other.role.value,
                        status=other.status.value if hasattr(other, "status") and other.status else "AVAILABLE",
                        status_text=other.status_text,
                    )
            if not other_user:
                title = "Direct Message"

        summaries.append(
            ConversationSummaryResponse(
                id=conv.id,
                type=conv.type,
                title=title,
                slug=slug,
                color=color,
                team_id=team_id,
                other_user=other_user,
                last_message=format_message_response(last_msg) if last_msg else None,
                unread_count=unread_count,
                updated_at=last_msg.created_at if last_msg else conv.created_at,
                my_last_read_at=my_last_read_at,
                other_user_last_read_at=other_user_last_read_at,
            )
        )

    # Sort conversations: Updates on top, then by most recent message/update
    summaries.sort(key=lambda c: (c.type != ConversationType.UPDATES, -c.updated_at.timestamp()))
    return summaries


@router.post("/dm", response_model=ConversationSummaryResponse)
async def create_or_get_dm(
    payload: CreateDMRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Start or retrieve a 1:1 direct message conversation."""
    target_user = await db.get(User, payload.target_user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target user not found",
        )

    conv = await chat_service.get_or_create_dm_conversation(
        db, current_user.id, target_user.id
    )

    return ConversationSummaryResponse(
        id=conv.id,
        type=conv.type,
        title=target_user.display_name,
        slug=None,
        color=None,
        team_id=None,
        other_user=MessageSenderInfo(
            id=target_user.id,
            display_name=target_user.display_name,
            email=target_user.email,
            role=target_user.role.value,
            status=target_user.status.value if hasattr(target_user, "status") and target_user.status else "AVAILABLE",
            status_text=target_user.status_text,
        ),
        last_message=None,
        unread_count=0,
        updated_at=conv.updated_at,
        my_last_read_at=None,
        other_user_last_read_at=None,
    )


@router.get("/{conversation_id}/messages", response_model=List[MessageResponse])
async def get_messages(
    conversation_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=100),
    before: Optional[datetime] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieve message history for a conversation.
    Enforces WhatsApp-style historical window scoping for team groups (§3.1).
    """
    messages = await chat_service.get_conversation_messages(
        db=db,
        conversation_id=conversation_id,
        user=current_user,
        limit=limit,
        before=before,
    )
    return [format_message_response(m) for m in messages]


@router.post("/{conversation_id}/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def send_message_rest(
    conversation_id: uuid.UUID,
    payload: MessageCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """REST endpoint for sending messages with deduplication and broadcast."""
    msg = await chat_service.create_message(
        db=db,
        conversation_id=conversation_id,
        sender=current_user,
        client_id=payload.client_id,
        content=payload.content,
        reply_to_id=payload.reply_to_id,
    )

    formatted = format_message_response(msg)
    # Broadcast to Socket.IO room
    await sio.emit("message_received", serialize_message(msg), room=f"conv_{conversation_id}")
    return formatted


@router.patch("/messages/{message_id}", response_model=MessageResponse)
async def edit_message_rest(
    message_id: uuid.UUID,
    payload: MessageEditRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Edit own message."""
    msg = await chat_service.edit_message(db, message_id, current_user, payload.content)
    formatted = format_message_response(msg)
    await sio.emit("message_updated", serialize_message(msg), room=f"conv_{msg.conversation_id}")
    return formatted


@router.delete("/messages/{message_id}", response_model=MessageResponse)
async def delete_message_rest(
    message_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete message (tombstone)."""
    msg = await chat_service.delete_message(db, message_id, current_user)
    formatted = format_message_response(msg)
    await sio.emit("message_deleted", serialize_message(msg), room=f"conv_{msg.conversation_id}")
    return formatted


@router.post("/{conversation_id}/read", response_model=MarkReadResponse)
async def mark_conversation_as_read(
    conversation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark all messages in a conversation as read by the current user."""
    conv = await db.get(Conversation, conversation_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
    has_access, _ = await chat_service.check_user_access(db, current_user, conv)
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a participant in this conversation",
        )

    last_read_at = await chat_service.mark_conversation_read(db, conversation_id, current_user.id)
    payload = {
        "conversation_id": str(conversation_id),
        "user_id": str(current_user.id),
        "last_read_at": last_read_at.isoformat(),
    }
    await sio.emit("conversation_read", payload, room=f"conv_{conversation_id}")
    return MarkReadResponse(
        conversation_id=conversation_id,
        user_id=current_user.id,
        last_read_at=last_read_at,
    )


@router.post("/messages/{message_id}/reactions", response_model=ReactionToggleResponse)
async def toggle_reaction_rest(
    message_id: uuid.UUID,
    payload: ReactionToggleRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle an emoji reaction on a message (Slack/Discord style)."""
    action, msg, reactions = await chat_service.toggle_message_reaction(
        db=db,
        message_id=message_id,
        user=current_user,
        emoji=payload.emoji,
    )

    socket_payload = {
        "message_id": str(message_id),
        "conversation_id": str(msg.conversation_id),
        "user_id": str(current_user.id),
        "user_name": current_user.display_name,
        "emoji": payload.emoji,
        "action": action,
        "reactions": [
            {
                "emoji": r.emoji,
                "count": r.count,
                "user_ids": [str(uid) for uid in r.user_ids],
                "user_names": r.user_names,
            }
            for r in reactions
        ],
    }
    await sio.emit("message_reaction_toggled", socket_payload, room=f"conv_{msg.conversation_id}")

    return ReactionToggleResponse(
        message_id=message_id,
        conversation_id=msg.conversation_id,
        emoji=payload.emoji,
        action=action,
        reactions=reactions,
    )

