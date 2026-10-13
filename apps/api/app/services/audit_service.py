import uuid
import logging
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit_log import AuditLog

logger = logging.getLogger("relay.audit")


async def record_audit_log(
    db: AsyncSession,
    actor_id: uuid.UUID | None,
    actor_email: str,
    action: str,
    target_type: str,
    target_id: uuid.UUID | None = None,
    details: dict | None = None,
) -> AuditLog:
    """Record an immutable structured audit log entry."""
    entry = AuditLog(
        actor_id=actor_id,
        actor_email=actor_email,
        action=action,
        target_type=target_type,
        target_id=target_id,
        details=details or {},
    )
    db.add(entry)
    await db.commit()
    logger.info(
        f"Audit: {actor_email} performed {action} on {target_type} ({target_id or 'none'})",
        extra={"actor_email": actor_email, "action": action},
    )
    return entry


async def get_audit_logs(
    db: AsyncSession,
    limit: int = 50,
    offset: int = 0,
    action_filter: str | None = None,
) -> list[AuditLog]:
    """Retrieve audit logs in reverse chronological order."""
    query = select(AuditLog).order_by(desc(AuditLog.created_at))
    if action_filter:
        query = query.where(AuditLog.action == action_filter)
    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())
