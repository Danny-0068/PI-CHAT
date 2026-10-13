import argparse
import asyncio
import sys
import app.models
from app.core.database import engine, Base, async_session_maker
from app.seed.initial_users import seed_initial_demo_users
from app.seed.seed_teams import seed_teams
from app.seed.seed_conversations import seed_conversations


async def run_seed(reset: bool = False) -> None:
    print(f"[*] Running database seed (reset={reset})...")
    async with engine.begin() as conn:
        if reset:
            print("[*] Wiping database tables...")
            await conn.run_sync(Base.metadata.drop_all)
        print("[*] Ensuring database tables exist...")
        await conn.run_sync(Base.metadata.create_all)

    async with async_session_maker() as session:
        print("[*] Seeding teams...")
        await seed_teams(session)
        print("[*] Seeding demo users...")
        await seed_initial_demo_users(session)
        print("[*] Seeding conversations and messages...")
        await seed_conversations(session)

    print("[+] Database seed completed successfully!")


def main():
    parser = argparse.ArgumentParser(description="Seed Relay demo database")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Reset database by dropping and recreating all tables before seeding",
    )
    args = parser.parse_args()
    asyncio.run(run_seed(reset=args.reset))


if __name__ == "__main__":
    main()
