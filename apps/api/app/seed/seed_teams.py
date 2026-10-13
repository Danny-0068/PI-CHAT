import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.team import Team

logger = logging.getLogger("relay.seed")

SEED_TEAMS = [
    {
        "name": "team_ai",
        "display_name": "AI Research",
        "color": "#6366F1",  # Subtle Indigo
        "file_size_limit_bytes": None,  # Defaults to 5 MB
    },
    {
        "name": "team_legal",
        "display_name": "Legal & Compliance",
        "color": "#10B981",  # Subtle Emerald
        "file_size_limit_bytes": None,
    },
    {
        "name": "hr_admin",
        "display_name": "HR & People",
        "color": "#8B5CF6",  # Subtle Purple
        "file_size_limit_bytes": None,
    },
    {
        "name": "seo",
        "display_name": "SEO & Growth",
        "color": "#F59E0B",  # Subtle Amber
        "file_size_limit_bytes": None,
    },
    {
        "name": "coordination",
        "display_name": "Operations & Coordination",
        "color": "#06B6D4",  # Subtle Cyan
        "file_size_limit_bytes": None,
    },
]


async def seed_teams(db: AsyncSession) -> None:
    """Idempotently seed the 5 Acme Labs teams."""
    for team_data in SEED_TEAMS:
        query = select(Team).where(Team.name == team_data["name"])
        result = await db.execute(query)
        existing = result.scalar_one_or_none()

        if not existing:
            team = Team(
                name=team_data["name"],
                display_name=team_data["display_name"],
                color=team_data["color"],
                file_size_limit_bytes=team_data["file_size_limit_bytes"],
            )
            db.add(team)
            logger.info(f"Seeded team tag: {team_data['name']} ({team_data['display_name']})")

    await db.commit()
