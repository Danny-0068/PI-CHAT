import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import select, update, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from app.core.config import get_settings
from app.models.team import Team
from app.models.team_membership import TeamMembership
from app.models.user import User, UserRole
from app.services import audit_service

settings = get_settings()


async def get_all_teams_with_stats(db: AsyncSession) -> List[Dict[str, Any]]:
    """Retrieve all teams with active member count and active leads."""
    teams_query = select(Team).order_by(Team.name)
    teams_res = await db.execute(teams_query)
    teams = teams_res.scalars().all()

    results = []
    for team in teams:
        # Query active memberships
        members_query = (
            select(TeamMembership, User)
            .join(User, TeamMembership.user_id == User.id)
            .where(TeamMembership.team_id == team.id)
            .where(TeamMembership.left_at.is_(None))
            .where(User.is_active == True)
        )
        members_res = await db.execute(members_query)
        active_members = members_res.all()

        leads = [user.display_name for tm, user in active_members if tm.is_lead]

        effective_limit = team.file_size_limit_bytes or settings.GLOBAL_FILE_SIZE_LIMIT_BYTES

        results.append({
            "id": team.id,
            "name": team.name,
            "display_name": team.display_name,
            "color": team.color,
            "file_size_limit_bytes": effective_limit,
            "is_custom_limit": team.file_size_limit_bytes is not None,
            "member_count": len(active_members),
            "lead_names": leads,
            "created_at": team.created_at,
            "updated_at": team.updated_at,
        })
    return results


async def get_team_detail(db: AsyncSession, team_id: uuid.UUID) -> Dict[str, Any]:
    """Retrieve team details including active member roster."""
    team_query = select(Team).where(Team.id == team_id)
    team_res = await db.execute(team_query)
    team = team_res.scalar_one_or_none()

    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    members_query = (
        select(TeamMembership, User)
        .join(User, TeamMembership.user_id == User.id)
        .where(TeamMembership.team_id == team.id)
        .where(TeamMembership.left_at.is_(None))
        .where(User.is_active == True)
    )
    members_res = await db.execute(members_query)
    active_rows = members_res.all()

    members_list = [
        {
            "user_id": user.id,
            "email": user.email,
            "display_name": user.display_name,
            "role": user.role.value,
            "status": user.status.value,
            "is_lead": tm.is_lead,
            "joined_at": tm.joined_at,
        }
        for tm, user in active_rows
    ]

    effective_limit = team.file_size_limit_bytes or settings.GLOBAL_FILE_SIZE_LIMIT_BYTES

    return {
        "id": team.id,
        "name": team.name,
        "display_name": team.display_name,
        "color": team.color,
        "file_size_limit_bytes": effective_limit,
        "is_custom_limit": team.file_size_limit_bytes is not None,
        "members": members_list,
        "member_count": len(members_list),
        "created_at": team.created_at,
        "updated_at": team.updated_at,
    }


async def assign_user_team(
    db: AsyncSession,
    user: User,
    team_id: Optional[uuid.UUID],
    is_lead: bool,
    actor: User,
) -> Optional[TeamMembership]:
    """
    Assign user to a team (or unassign). Closes any existing active membership period
    with left_at = now() and opens a new one if team_id is provided.
    """
    now = datetime.now(timezone.utc)

    # Find existing active membership
    active_query = (
        select(TeamMembership)
        .where(TeamMembership.user_id == user.id)
        .where(TeamMembership.left_at.is_(None))
    )
    active_res = await db.execute(active_query)
    current_membership = active_res.scalar_one_or_none()

    # If unassigning
    if team_id is None:
        if current_membership:
            current_membership.left_at = now
            await audit_service.record_audit_log(
                db=db,
                actor_id=actor.id,
                actor_email=actor.email,
                action="TEAM_REMOVED",
                target_type="USER",
                target_id=user.id,
                details={
                    "previous_team_id": str(current_membership.team_id),
                    "user_email": user.email,
                },
            )
            await db.commit()
        return None

    # Verify target team exists
    target_team = await db.get(Team, team_id)
    if not target_team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target team does not exist",
        )

    # If already in the same team with same lead flag -> no-op
    if (
        current_membership
        and current_membership.team_id == team_id
        and current_membership.is_lead == is_lead
    ):
        return current_membership

    # If only toggling lead on the same team -> update flag directly
    if current_membership and current_membership.team_id == team_id:
        current_membership.is_lead = is_lead
        await audit_service.record_audit_log(
            db=db,
            actor_id=actor.id,
            actor_email=actor.email,
            action="LEAD_TOGGLED",
            target_type="USER",
            target_id=user.id,
            details={
                "team_id": str(team_id),
                "is_lead": is_lead,
                "user_email": user.email,
            },
        )
        await db.commit()
        return current_membership

    # Otherwise, close previous team membership interval
    if current_membership:
        current_membership.left_at = now

    # Open new membership interval
    new_membership = TeamMembership(
        user_id=user.id,
        team_id=team_id,
        is_lead=is_lead,
        joined_at=now,
        left_at=None,
    )
    db.add(new_membership)

    await audit_service.record_audit_log(
        db=db,
        actor_id=actor.id,
        actor_email=actor.email,
        action="TEAM_ASSIGNED",
        target_type="USER",
        target_id=user.id,
        details={
            "team_id": str(team_id),
            "team_name": target_team.name,
            "is_lead": is_lead,
            "user_email": user.email,
        },
    )

    await db.commit()
    await db.refresh(new_membership)
    return new_membership


async def update_team_file_limit(
    db: AsyncSession,
    team_id: uuid.UUID,
    new_limit_bytes: int,
    actor: User,
) -> Team:
    """
    Update team file-size limit.
    - Main-Admin: can override to any value.
    - Team Lead: can raise own team's limit up to LEAD_MAX_FILE_SIZE_LIMIT_BYTES.
    - Other users: Forbidden.
    """
    team = await db.get(Team, team_id)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    is_admin = actor.role == UserRole.MAIN_ADMIN

    # Check lead status on this team
    lead_query = (
        select(TeamMembership)
        .where(TeamMembership.user_id == actor.id)
        .where(TeamMembership.team_id == team_id)
        .where(TeamMembership.left_at.is_(None))
        .where(TeamMembership.is_lead == True)
    )
    lead_res = await db.execute(lead_query)
    is_team_lead = lead_res.scalar_one_or_none() is not None

    if not is_admin and not is_team_lead:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Main-Admin or an active Team Lead of this team can adjust the file limit",
        )

    # Enforce safe demo cap for team leads
    if not is_admin and is_team_lead:
        if new_limit_bytes > settings.LEAD_MAX_FILE_SIZE_LIMIT_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Team Leads cannot raise file limit beyond demo cap of {settings.LEAD_MAX_FILE_SIZE_LIMIT_BYTES // (1024 * 1024)} MB. Contact Main-Admin for larger overrides.",
            )

    old_limit = team.file_size_limit_bytes
    team.file_size_limit_bytes = new_limit_bytes
    await db.commit()

    await audit_service.record_audit_log(
        db=db,
        actor_id=actor.id,
        actor_email=actor.email,
        action="TEAM_LIMIT_UPDATED",
        target_type="TEAM",
        target_id=team.id,
        details={
            "team_name": team.name,
            "old_limit_bytes": old_limit,
            "new_limit_bytes": new_limit_bytes,
            "actor_role": actor.role.value,
        },
    )
    await db.refresh(team)
    return team


async def check_membership_at_time(
    db: AsyncSession,
    user_id: uuid.UUID,
    team_id: uuid.UUID,
    message_time: datetime,
) -> bool:
    """
    WhatsApp-style history scoping check: Returns True if message_time
    falls within any of user's [joined_at, left_at] membership intervals.
    """
    query = (
        select(TeamMembership)
        .where(TeamMembership.user_id == user_id)
        .where(TeamMembership.team_id == team_id)
        .where(TeamMembership.joined_at <= message_time)
        .where(
            (TeamMembership.left_at.is_(None))
            | (TeamMembership.left_at >= message_time)
        )
    )
    result = await db.execute(query)
    return result.scalar_one_or_none() is not None
