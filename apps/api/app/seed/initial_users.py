import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core import security
from app.models.user import User, UserRole, UserStatus

logger = logging.getLogger("relay.seed")

DEMO_PASSWORD = "Password123!"

DEMO_ACCOUNTS = [
    {
        "email": "admin@acme.demo",
        "display_name": "Alex Morgan",
        "role": UserRole.MAIN_ADMIN,
        "status": UserStatus.AVAILABLE,
        "status_text": "Managing Acme Labs demo",
    },
    {
        "email": "employee@acme.demo",
        "display_name": "Sam Rivera",
        "role": UserRole.EMPLOYEE,
        "status": UserStatus.AVAILABLE,
        "status_text": "Building team chat features",
    },
]


async def seed_initial_demo_users(db: AsyncSession) -> None:
    """Idempotently seed the initial demo accounts if they do not already exist."""
    for account in DEMO_ACCOUNTS:
        query = select(User).where(User.email == account["email"])
        result = await db.execute(query)
        existing = result.scalar_one_or_none()

        if not existing:
            hashed_pwd = security.hash_password(DEMO_PASSWORD)
            user = User(
                email=account["email"],
                password_hash=hashed_pwd,
                display_name=account["display_name"],
                role=account["role"],
                status=account["status"],
                status_text=account["status_text"],
                is_active=True,
                is_demo=True,
                force_password_change=False,
            )
            db.add(user)
            logger.info(f"Seeded demo account: {account['email']} ({account['role'].value})")

    await db.commit()
