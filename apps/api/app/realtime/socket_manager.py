import uuid
from typing import Any, Dict, Optional
import socketio
from sqlalchemy import select
from app.core import security
from app.core.database import async_session_maker
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.user import User
from app.services import chat_service

# Initialize Socket.IO server with ASGI mode
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,
    engineio_logger=False,
    ping_timeout=25,
    ping_interval=10,
)

# In-memory tracking of active sockets per user
# user_id -> set of sids
connected_users: Dict[str, set] = {}


def serialize_message(msg: Message) -> Dict[str, Any]:
    """Format message for Socket.IO JSON emission."""
    reply_snippet = None
    if msg.reply_to:
        reply_snippet = {
            "id": str(msg.reply_to.id),
            "sender_name": msg.reply_to.sender.display_name if msg.reply_to.sender else "User",
            "content": msg.reply_to.content[:100],
        }

    return {
        "id": str(msg.id),
        "client_id": msg.client_id,
        "conversation_id": str(msg.conversation_id),
        "sender": {
            "id": str(msg.sender.id) if msg.sender else str(msg.sender_id),
            "display_name": msg.sender.display_name if msg.sender else "User",
            "email": msg.sender.email if msg.sender else "",
            "role": msg.sender.role.value if msg.sender else "EMPLOYEE",
        },
        "content": msg.content,
        "is_edited": msg.is_edited,
        "is_deleted": msg.is_deleted,
        "reply_to": reply_snippet,
        "created_at": msg.created_at.isoformat(),
        "updated_at": msg.updated_at.isoformat(),
    }


@sio.event
async def connect(sid: str, environ: Dict[str, Any], auth: Optional[Dict[str, Any]] = None):
    token = None
    if auth and isinstance(auth, dict):
        token = auth.get("token")

    if not token:
        # Check query string
        qs = environ.get("QUERY_STRING", "")
        for param in qs.split("&"):
            if param.startswith("token="):
                token = param.split("=", 1)[1]
                break

    if not token:
        return False

    try:
        payload = security.decode_access_token(token)
        user_id_str = payload.get("sub")
        if not user_id_str:
            return False
        user_id = uuid.UUID(user_id_str)
    except Exception:
        return False

    async with async_session_maker() as session:
        user = await session.get(User, user_id)
        if not user or not user.is_active:
            return False

        await sio.save_session(
            sid,
            {
                "user_id": str(user.id),
                "email": user.email,
                "display_name": user.display_name,
                "role": user.role.value,
            },
        )

        user_key = str(user.id)
        if user_key not in connected_users:
            connected_users[user_key] = set()
            # Broadcast presence online
            await sio.emit("user_presence", {"user_id": user_key, "status": "online"})
        connected_users[user_key].add(sid)

        # Join individual user room for direct pings
        await sio.enter_room(sid, f"user_{user_key}")
    return True


@sio.event
async def disconnect(sid: str):
    session = await sio.get_session(sid)
    if session and "user_id" in session:
        user_key = session["user_id"]
        if user_key in connected_users:
            connected_users[user_key].discard(sid)
            if not connected_users[user_key]:
                del connected_users[user_key]
                # Broadcast presence offline
                await sio.emit("user_presence", {"user_id": user_key, "status": "offline"})


@sio.event
async def join_conversation(sid: str, data: Dict[str, Any]):
    session = await sio.get_session(sid)
    if not session:
        return {"status": "error", "message": "Unauthorized"}

    conv_id_str = data.get("conversation_id")
    if not conv_id_str:
        return {"status": "error", "message": "Missing conversation_id"}

    try:
        conv_id = uuid.UUID(conv_id_str)
        user_id = uuid.UUID(session["user_id"])
    except ValueError:
        return {"status": "error", "message": "Invalid UUID format"}

    async with async_session_maker() as db:
        user = await db.get(User, user_id)
        conv = await db.get(Conversation, conv_id)
        if not user or not conv:
            return {"status": "error", "message": "Conversation or user not found"}

        has_access, _ = await chat_service.check_user_access(db, user, conv)
        if not has_access:
            return {"status": "error", "message": "Access denied to conversation"}

        await sio.enter_room(sid, f"conv_{conv_id}")
        return {"status": "ok", "conversation_id": str(conv_id)}


@sio.event
async def leave_conversation(sid: str, data: Dict[str, Any]):
    conv_id_str = data.get("conversation_id")
    if conv_id_str:
        await sio.leave_room(sid, f"conv_{conv_id_str}")
    return {"status": "ok"}


@sio.event
async def send_message(sid: str, data: Dict[str, Any]):
    session = await sio.get_session(sid)
    if not session:
        return {"status": "error", "message": "Unauthorized"}

    conv_id_str = data.get("conversation_id")
    client_id = data.get("client_id")
    content = data.get("content", "").strip()
    reply_to_id_str = data.get("reply_to_id")

    if not conv_id_str or not client_id or not content:
        return {"status": "error", "message": "Missing required fields"}

    try:
        conv_id = uuid.UUID(conv_id_str)
        user_id = uuid.UUID(session["user_id"])
        reply_to_id = uuid.UUID(reply_to_id_str) if reply_to_id_str else None
    except ValueError:
        return {"status": "error", "message": "Invalid UUID format"}

    async with async_session_maker() as db:
        user = await db.get(User, user_id)
        if not user:
            return {"status": "error", "message": "User not found"}

        try:
            msg = await chat_service.create_message(
                db=db,
                conversation_id=conv_id,
                sender=user,
                client_id=client_id,
                content=content,
                reply_to_id=reply_to_id,
            )
            # Re-fetch with relationships loaded
            msg_full = await db.execute(
                select(Message).where(Message.id == msg.id)
            )
            loaded_msg = msg_full.scalar_one()

            payload = serialize_message(loaded_msg)
            # Broadcast to everyone in conversation room
            await sio.emit("message_received", payload, room=f"conv_{conv_id}")
            return {"status": "ok", "message": payload}
        except Exception as e:
            return {"status": "error", "message": str(e)}


@sio.event
async def edit_message(sid: str, data: Dict[str, Any]):
    session = await sio.get_session(sid)
    if not session:
        return {"status": "error", "message": "Unauthorized"}

    msg_id_str = data.get("message_id")
    content = data.get("content", "").strip()
    if not msg_id_str or not content:
        return {"status": "error", "message": "Missing fields"}

    try:
        msg_id = uuid.UUID(msg_id_str)
        user_id = uuid.UUID(session["user_id"])
    except ValueError:
        return {"status": "error", "message": "Invalid UUID format"}

    async with async_session_maker() as db:
        user = await db.get(User, user_id)
        if not user:
            return {"status": "error", "message": "User not found"}

        try:
            msg = await chat_service.edit_message(db, msg_id, user, content)
            payload = serialize_message(msg)
            await sio.emit("message_updated", payload, room=f"conv_{msg.conversation_id}")
            return {"status": "ok", "message": payload}
        except Exception as e:
            return {"status": "error", "message": str(e)}


@sio.event
async def delete_message(sid: str, data: Dict[str, Any]):
    session = await sio.get_session(sid)
    if not session:
        return {"status": "error", "message": "Unauthorized"}

    msg_id_str = data.get("message_id")
    if not msg_id_str:
        return {"status": "error", "message": "Missing message_id"}

    try:
        msg_id = uuid.UUID(msg_id_str)
        user_id = uuid.UUID(session["user_id"])
    except ValueError:
        return {"status": "error", "message": "Invalid UUID format"}

    async with async_session_maker() as db:
        user = await db.get(User, user_id)
        if not user:
            return {"status": "error", "message": "User not found"}

        try:
            msg = await chat_service.delete_message(db, msg_id, user)
            payload = serialize_message(msg)
            await sio.emit("message_deleted", payload, room=f"conv_{msg.conversation_id}")
            return {"status": "ok", "message": payload}
        except Exception as e:
            return {"status": "error", "message": str(e)}


@sio.event
async def typing_start(sid: str, data: Dict[str, Any]):
    session = await sio.get_session(sid)
    if not session:
        return
    conv_id = data.get("conversation_id")
    if conv_id:
        await sio.emit(
            "user_typing",
            {
                "conversation_id": conv_id,
                "user_id": session["user_id"],
                "display_name": session["display_name"],
            },
            room=f"conv_{conv_id}",
            skip_sid=sid,
        )


@sio.event
async def typing_stop(sid: str, data: Dict[str, Any]):
    session = await sio.get_session(sid)
    if not session:
        return
    conv_id = data.get("conversation_id")
    if conv_id:
        await sio.emit(
            "user_stop_typing",
            {
                "conversation_id": conv_id,
                "user_id": session["user_id"],
            },
            room=f"conv_{conv_id}",
            skip_sid=sid,
        )


@sio.event
async def mark_read(sid: str, data: Dict[str, Any]):
    session = await sio.get_session(sid)
    if not session:
        return {"status": "error", "message": "Unauthorized"}
    conv_id_str = data.get("conversation_id")
    if not conv_id_str:
        return {"status": "error", "message": "Missing conversation_id"}
    try:
        conv_id = uuid.UUID(conv_id_str)
        user_id = uuid.UUID(session["user_id"])
    except ValueError:
        return {"status": "error", "message": "Invalid UUID format"}

    async with async_session_maker() as db:
        user = await db.get(User, user_id)
        conv = await db.get(Conversation, conv_id)
        if not user or not conv:
            return {"status": "error", "message": "Not found"}
        has_access, _ = await chat_service.check_user_access(db, user, conv)
        if not has_access:
            return {"status": "error", "message": "Access denied"}
        last_read_at = await chat_service.mark_conversation_read(db, conv_id, user.id)
        payload = {
            "conversation_id": str(conv_id),
            "user_id": str(user.id),
            "last_read_at": last_read_at.isoformat(),
        }
        await sio.emit("conversation_read", payload, room=f"conv_{conv_id}")
        return {"status": "ok", "last_read_at": last_read_at.isoformat()}


@sio.event
async def status_update(sid: str, data: Dict[str, Any]):
    session = await sio.get_session(sid)
    if not session:
        return {"status": "error", "message": "Unauthorized"}
    user_id_str = session.get("user_id")
    new_status = data.get("status")
    new_status_text = data.get("status_text")
    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        return {"status": "error", "message": "Invalid UUID format"}

    async with async_session_maker() as db:
        user = await db.get(User, user_id)
        if not user:
            return {"status": "error", "message": "User not found"}
        if new_status:
            from app.models.user import UserStatus
            try:
                user.status = UserStatus(new_status)
            except ValueError:
                pass
        if "status_text" in data:
            user.status_text = new_status_text
        await db.commit()
        payload = {
            "user_id": str(user.id),
            "status": user.status.value,
            "status_text": user.status_text,
        }
        await sio.emit("user_status_changed", payload)
        return {"status": "ok", **payload}
