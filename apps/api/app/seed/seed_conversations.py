import logging
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.conversation import Conversation, ConversationType
from app.models.message import Message
from app.models.team import Team
from app.models.user import User, UserRole
from app.services import chat_service

logger = logging.getLogger("relay.seed")


async def seed_conversations(db: AsyncSession) -> None:
    """
    Seed initial conversations:
    1. #updates channel (company-wide)
    2. Team group channels for each seeded team
    3. Direct message conversation between Alex Morgan and Sam Rivera
    4. Welcome and sample messages
    """
    # 1. Ensure #updates exists
    updates_conv = await chat_service.get_or_create_updates_channel(db)

    # Find demo users
    admin_res = await db.execute(select(User).where(User.email == "admin@acme.demo"))
    admin_user = admin_res.scalar_one_or_none()

    employee_res = await db.execute(select(User).where(User.email == "employee@acme.demo"))
    employee_user = employee_res.scalar_one_or_none()

    if not admin_user or not employee_user:
        logger.warning("Demo users not found; skipping conversation message seeds.")
        return

    # Seed welcome message in #updates if empty
    updates_msg_check = await db.execute(
        select(Message).where(Message.conversation_id == updates_conv.id).limit(1)
    )
    if not updates_msg_check.scalar_one_or_none():
        msg_updates = Message(
            conversation_id=updates_conv.id,
            sender_id=admin_user.id,
            client_id="seed-updates-welcome-1",
            content="Welcome to Relay! This is the company-wide announcement channel for Acme Labs.",
        )
        db.add(msg_updates)
        logger.info("Seeded initial welcome message in #updates")

    # 2. Seed Team group channels
    teams_res = await db.execute(select(Team))
    teams = teams_res.scalars().all()
    for team in teams:
        team_conv = await chat_service.get_or_create_team_conversation(db, team.id)
        # Seed a welcome message in the team chat if empty
        team_msg_check = await db.execute(
            select(Message).where(Message.conversation_id == team_conv.id).limit(1)
        )
        if not team_msg_check.scalar_one_or_none():
            msg_team = Message(
                conversation_id=team_conv.id,
                sender_id=admin_user.id,
                client_id=f"seed-team-{team.name}-1",
                content=f"Welcome to the #{team.display_name} channel! Use this space for team coordination and discussions.",
            )
            db.add(msg_team)
            logger.info(f"Seeded channel and initial message for team #{team.display_name}")

    # 3. Seed 1:1 DM between Admin and Employee
    dm_conv = await chat_service.get_or_create_dm_conversation(
        db, admin_user.id, employee_user.id
    )
    dm_msg_check = await db.execute(
        select(Message).where(Message.conversation_id == dm_conv.id).limit(1)
    )
    if not dm_msg_check.scalar_one_or_none():
        msg_dm_1 = Message(
            conversation_id=dm_conv.id,
            sender_id=admin_user.id,
            client_id="seed-dm-admin-1",
            content="Hey Sam, welcome to Acme Labs! Let me know if you need any help setting up.",
        )
        msg_dm_2 = Message(
            conversation_id=dm_conv.id,
            sender_id=employee_user.id,
            client_id="seed-dm-employee-2",
            content="Thanks Alex! Everything is looking smooth. Excited to test the real-time chat features.",
        )
        db.add_all([msg_dm_1, msg_dm_2])
        logger.info("Seeded initial 1:1 DM messages between Alex and Sam")

    await db.commit()
