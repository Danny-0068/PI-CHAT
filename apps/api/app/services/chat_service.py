import uuid
from datetime import datetime, timezone
from typing import List, Optional, Tuple
from fastapi import HTTPException, status
from sqlalchemy import select, and_, or_, desc, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession


from app.models.conversation import Conversation, ConversationType, ConversationParticipant
from app.models.message import Message
from app.models.reaction import MessageReaction
from app.models.team import Team
from app.models.team_membership import TeamMembership
from app.models.user import User, UserRole
from app.schemas.chat import ReactionSummary


async def get_or_create_updates_channel(db: AsyncSession) -> Conversation:
    """Ensure the company-wide #updates channel exists."""
    query = select(Conversation).where(Conversation.type == ConversationType.UPDATES)
    res = await db.execute(query)
    conv = res.scalar_one_or_none()
    if not conv:
        conv = Conversation(type=ConversationType.UPDATES)
        db.add(conv)
        await db.commit()
        await db.refresh(conv)
    return conv


async def get_or_create_team_conversation(db: AsyncSession, team_id: uuid.UUID) -> Conversation:
    """Ensure a team group conversation exists for the given team."""
    query = select(Conversation).where(
        Conversation.type == ConversationType.TEAM_GROUP,
        Conversation.team_id == team_id,
    )
    res = await db.execute(query)
    conv = res.scalar_one_or_none()
    if not conv:
        conv = Conversation(type=ConversationType.TEAM_GROUP, team_id=team_id)
        db.add(conv)
        await db.commit()
        await db.refresh(conv)
    return conv


async def get_or_create_dm_conversation(
    db: AsyncSession,
    user_a_id: uuid.UUID,
    user_b_id: uuid.UUID,
) -> Conversation:
    """Retrieve existing 1:1 DM between two users, or create a new one."""
    if user_a_id == user_b_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot start a direct message conversation with yourself",
        )

    # Find conversation that has both users as participants
    subquery_a = select(ConversationParticipant.conversation_id).where(
        ConversationParticipant.user_id == user_a_id
    )
    subquery_b = select(ConversationParticipant.conversation_id).where(
        ConversationParticipant.user_id == user_b_id
    )

    query = (
        select(Conversation)
        .where(Conversation.type == ConversationType.DM)
        .where(Conversation.id.in_(subquery_a))
        .where(Conversation.id.in_(subquery_b))
    )
    res = await db.execute(query)
    conv = res.scalar_one_or_none()

    if conv:
        return conv

    # Create new DM conversation
    new_conv = Conversation(type=ConversationType.DM)
    db.add(new_conv)
    await db.flush()

    p_a = ConversationParticipant(conversation_id=new_conv.id, user_id=user_a_id)
    p_b = ConversationParticipant(conversation_id=new_conv.id, user_id=user_b_id)
    db.add_all([p_a, p_b])
    await db.commit()
    await db.refresh(new_conv)
    return new_conv


async def check_user_access(
    db: AsyncSession,
    user: User,
    conversation: Conversation,
) -> Tuple[bool, Optional[TeamMembership]]:
    """
    Check if user is permitted to view/participate in conversation.
    Returns (has_access, team_membership).
    """
    if conversation.type == ConversationType.UPDATES:
        return True, None

    if conversation.type == ConversationType.DM:
        for p in conversation.participants:
            if p.user_id == user.id:
                return True, None
        return False, None

    if conversation.type == ConversationType.TEAM_GROUP:
        if user.role == UserRole.MAIN_ADMIN:
            # Main-Admin can read every team group chat (§2)
            return True, None

        # Employee must have membership history
        mem_query = (
            select(TeamMembership)
            .where(
                TeamMembership.user_id == user.id,
                TeamMembership.team_id == conversation.team_id,
            )
            .order_by(desc(TeamMembership.joined_at))
        )
        mem_res = await db.execute(mem_query)
        membership = mem_res.scalars().first()
        if membership:
            return True, membership
        return False, None

    return False, None


async def get_conversation_messages(
    db: AsyncSession,
    conversation_id: uuid.UUID,
    user: User,
    limit: int = 50,
    before: Optional[datetime] = None,
) -> List[Message]:
    """
    Fetch paginated messages applying WhatsApp-style historical window scoping.
    """
    conv = await db.get(Conversation, conversation_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    has_access, membership = await check_user_access(db, user, conv)
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view messages in this conversation",
        )

    query = (
        select(Message)
        .options(
            selectinload(Message.sender),
            selectinload(Message.reply_to).selectinload(Message.sender),
            selectinload(Message.reactions).selectinload(MessageReaction.user),
        )
        .where(Message.conversation_id == conversation_id)
    )

    # Scoping rule for team groups (§3.1)
    if conv.type == ConversationType.TEAM_GROUP and user.role != UserRole.MAIN_ADMIN and membership:
        query = query.where(Message.created_at >= membership.joined_at)
        if membership.left_at is not None:
            query = query.where(Message.created_at <= membership.left_at)

    if before:
        query = query.where(Message.created_at < before)

    query = query.order_by(desc(Message.created_at)).limit(limit)
    res = await db.execute(query)
    messages = list(res.scalars().all())
    messages.reverse()  # Return in chronological order (oldest to newest)
    return messages


async def create_message(
    db: AsyncSession,
    conversation_id: uuid.UUID,
    sender: User,
    client_id: str,
    content: str,
    reply_to_id: Optional[uuid.UUID] = None,
) -> Message:
    """Create message with client_id deduplication."""
    # Deduplication check
    existing = await db.execute(
        select(Message)
        .options(
            selectinload(Message.sender),
            selectinload(Message.reply_to).selectinload(Message.sender),
            selectinload(Message.reactions).selectinload(MessageReaction.user),
        )
        .where(Message.client_id == client_id)
    )
    found = existing.scalar_one_or_none()
    if found:
        return found

    conv = await db.get(Conversation, conversation_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    has_access, membership = await check_user_access(db, sender, conv)
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a participant of this conversation",
        )

    # If employee left team, cannot send new messages
    if conv.type == ConversationType.TEAM_GROUP and sender.role != UserRole.MAIN_ADMIN:
        if membership and membership.left_at is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You have left this team and cannot send messages",
            )

    msg = Message(
        client_id=client_id,
        conversation_id=conversation_id,
        sender_id=sender.id,
        content=content.strip(),
        reply_to_id=reply_to_id,
    )
    db.add(msg)
    await db.commit()

    loaded = await db.execute(
        select(Message)
        .options(
            selectinload(Message.sender),
            selectinload(Message.reply_to).selectinload(Message.sender),
            selectinload(Message.reactions).selectinload(MessageReaction.user),
        )
        .where(Message.id == msg.id)
    )
    return loaded.scalar_one()


async def edit_message(
    db: AsyncSession,
    message_id: uuid.UUID,
    user: User,
    new_content: str,
) -> Message:
    """Edit own message."""
    msg = await db.get(Message, message_id)
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    if msg.sender_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot edit someone else's message")

    if msg.is_deleted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot edit a deleted message")

    msg.content = new_content.strip()
    msg.is_edited = True
    await db.commit()

    loaded = await db.execute(
        select(Message)
        .options(
            selectinload(Message.sender),
            selectinload(Message.reply_to).selectinload(Message.sender),
            selectinload(Message.reactions).selectinload(MessageReaction.user),
        )
        .where(Message.id == message_id)
    )
    return loaded.scalar_one()


async def delete_message(
    db: AsyncSession,
    message_id: uuid.UUID,
    user: User,
) -> Message:
    """Delete message with Slack/WhatsApp tombstone."""
    msg = await db.get(Message, message_id)
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    if msg.sender_id != user.id and user.role != UserRole.MAIN_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot delete this message")

    msg.is_deleted = True
    msg.content = "This message was deleted"
    await db.commit()

    loaded = await db.execute(
        select(Message)
        .options(
            selectinload(Message.sender),
            selectinload(Message.reply_to).selectinload(Message.sender),
            selectinload(Message.reactions).selectinload(MessageReaction.user),
        )
        .where(Message.id == message_id)
    )
    return loaded.scalar_one()


async def mark_conversation_read(
    db: AsyncSession,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
) -> datetime:
    """Update participant's last_read_at timestamp to now."""
    now = datetime.now(timezone.utc)
    query = select(ConversationParticipant).where(
        ConversationParticipant.conversation_id == conversation_id,
        ConversationParticipant.user_id == user_id,
    )
    res = await db.execute(query)
    participant = res.scalar_one_or_none()
    if participant:
        participant.last_read_at = now
    else:
        participant = ConversationParticipant(
            conversation_id=conversation_id,
            user_id=user_id,
            last_read_at=now,
        )
        db.add(participant)
    await db.commit()
    return now


async def get_conversation_unread_count(
    db: AsyncSession,
    conversation_id: uuid.UUID,
    user: User,
    last_read_at: Optional[datetime],
) -> int:
    """Count unread messages sent by others after user's last_read_at."""
    conditions = [
        Message.conversation_id == conversation_id,
        Message.sender_id != user.id,
        Message.is_deleted.is_(False),
    ]
    if last_read_at:
        conditions.append(Message.created_at > last_read_at)

    query = select(func.count(Message.id)).where(and_(*conditions))
    res = await db.execute(query)
    return res.scalar() or 0


async def get_message_reactions_summary(
    db: AsyncSession,
    message_id: uuid.UUID,
) -> List[ReactionSummary]:
    """Retrieve aggregated reaction statistics for a message."""
    query = (
        select(MessageReaction)
        .where(MessageReaction.message_id == message_id)
        .order_by(MessageReaction.created_at)
    )
    res = await db.execute(query)
    reactions = res.scalars().all()

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


async def toggle_message_reaction(
    db: AsyncSession,
    message_id: uuid.UUID,
    user: User,
    emoji: str,
) -> Tuple[str, Message, List[ReactionSummary]]:
    """
    Toggle emoji reaction on a message.
    If the reaction already exists for this user, it is removed; otherwise, it is added.
    Returns (action, message, updated_reactions_summary).
    """
    msg = await db.get(Message, message_id)
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    if msg.is_deleted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot react to a deleted message")

    conv = await db.get(Conversation, msg.conversation_id)
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    has_access, _ = await check_user_access(db, user, conv)
    if not has_access:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to conversation")

    clean_emoji = emoji.strip()
    if not clean_emoji:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Emoji cannot be empty")

    query = select(MessageReaction).where(
        MessageReaction.message_id == message_id,
        MessageReaction.user_id == user.id,
        MessageReaction.emoji == clean_emoji,
    )
    existing_res = await db.execute(query)
    existing_reaction = existing_res.scalar_one_or_none()

    if existing_reaction:
        await db.delete(existing_reaction)
        action = "removed"
    else:
        new_reaction = MessageReaction(
            message_id=message_id,
            user_id=user.id,
            emoji=clean_emoji,
        )
        db.add(new_reaction)
        action = "added"

    await db.commit()
    summary = await get_message_reactions_summary(db, message_id)
    return action, msg, summary

