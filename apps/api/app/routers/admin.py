import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import require_admin
from app.models.user import User
from app.models.team import Team
from app.models.team_membership import TeamMembership
from app.schemas.admin import (
    AdminUserDetailResponse,
    AdminUserUpdateRequest,
    AuditLogResponse,
    TeamTagInfo,
)
from app.schemas.team import (
    TeamResponse,
    TeamCreateRequest,
    TeamUpdateRequest,
)
from app.services import team_service, audit_service, auth_service

router = APIRouter(prefix="/admin", tags=["Admin Panel"])


@router.get("/users", response_model=List[AdminUserDetailResponse])
async def list_admin_users(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve full roster of users with team assignments and lead status."""
    users_query = select(User).order_by(User.created_at)
    users_res = await db.execute(users_query)
    users = users_res.scalars().all()

    results = []
    for user in users:
        # Find active membership
        mem_query = (
            select(TeamMembership, Team)
            .join(Team, TeamMembership.team_id == Team.id)
            .where(TeamMembership.user_id == user.id)
            .where(TeamMembership.left_at.is_(None))
        )
        mem_res = await db.execute(mem_query)
        membership_row = mem_res.first()

        team_info = None
        if membership_row:
            tm, team = membership_row
            team_info = TeamTagInfo(
                id=team.id,
                name=team.name,
                display_name=team.display_name,
                color=team.color,
                is_lead=tm.is_lead,
            )

        results.append(
            AdminUserDetailResponse(
                id=user.id,
                email=user.email,
                display_name=user.display_name,
                role=user.role,
                status=user.status,
                status_text=user.status_text,
                is_active=user.is_active,
                is_demo=user.is_demo,
                force_password_change=user.force_password_change,
                team=team_info,
                created_at=user.created_at,
                updated_at=user.updated_at,
            )
        )
    return results


@router.patch("/users/{user_id}", response_model=AdminUserDetailResponse)
async def update_admin_user(
    user_id: uuid.UUID,
    payload: AdminUserUpdateRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Edit user display name, team assignment, lead status, or active flag."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Update basic fields
    if payload.display_name is not None:
        user.display_name = payload.display_name.strip()

    if payload.is_active is not None:
        user.is_active = payload.is_active
        await audit_service.record_audit_log(
            db=db,
            actor_id=current_admin.id,
            actor_email=current_admin.email,
            action="USER_DEACTIVATED" if not payload.is_active else "USER_REACTIVATED",
            target_type="USER",
            target_id=user.id,
            details={"email": user.email, "is_active": payload.is_active},
        )

    # Update team assignment / lead flag if specified
    if payload.team_id is not None or payload.is_lead is not None:
        # Determine target team: either explicit team_id or keep current team
        target_team_id = payload.team_id
        is_lead_val = payload.is_lead if payload.is_lead is not None else False

        # If team_id wasn't passed in update, check current team
        if target_team_id is None and payload.is_lead is not None:
            active_tm = await db.execute(
                select(TeamMembership)
                .where(TeamMembership.user_id == user.id)
                .where(TeamMembership.left_at.is_(None))
            )
            current_tm = active_tm.scalar_one_or_none()
            if current_tm:
                target_team_id = current_tm.team_id

        await team_service.assign_user_team(
            db=db,
            user=user,
            team_id=target_team_id,
            is_lead=is_lead_val,
            actor=current_admin,
        )

    await db.commit()
    await db.refresh(user)

    # Fetch updated team info
    active_tm_query = (
        select(TeamMembership, Team)
        .join(Team, TeamMembership.team_id == Team.id)
        .where(TeamMembership.user_id == user.id)
        .where(TeamMembership.left_at.is_(None))
    )
    active_tm_res = await db.execute(active_tm_query)
    membership_row = active_tm_res.first()

    team_info = None
    if membership_row:
        tm, team = membership_row
        team_info = TeamTagInfo(
            id=team.id,
            name=team.name,
            display_name=team.display_name,
            color=team.color,
            is_lead=tm.is_lead,
        )

    return AdminUserDetailResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        status=user.status,
        status_text=user.status_text,
        is_active=user.is_active,
        is_demo=user.is_demo,
        force_password_change=user.force_password_change,
        team=team_info,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@router.post("/users/{user_id}/force-logout")
async def force_logout_user(
    user_id: uuid.UUID,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Force revoke all active refresh tokens for a user (§3.5)."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    await auth_service.revoke_all_user_tokens(db, user_id)
    await audit_service.record_audit_log(
        db=db,
        actor_id=current_admin.id,
        actor_email=current_admin.email,
        action="FORCE_LOGOUT_ALL_SESSIONS",
        target_type="USER",
        target_id=user.id,
        details={"user_email": user.email},
    )
    return {"status": "success", "message": f"All sessions revoked for {user.email}"}


@router.post("/teams", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
async def create_team(
    payload: TeamCreateRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new team tag."""
    existing = await db.execute(select(Team).where(Team.name == payload.name))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Team '{payload.name}' already exists",
        )

    new_team = Team(
        name=payload.name,
        display_name=payload.display_name,
        color=payload.color,
        file_size_limit_bytes=payload.file_size_limit_bytes,
    )
    db.add(new_team)
    await db.commit()

    await audit_service.record_audit_log(
        db=db,
        actor_id=current_admin.id,
        actor_email=current_admin.email,
        action="TEAM_CREATED",
        target_type="TEAM",
        target_id=new_team.id,
        details={"name": new_team.name, "display_name": new_team.display_name},
    )

    teams = await team_service.get_all_teams_with_stats(db)
    for t in teams:
        if t["id"] == new_team.id:
            return t
    return teams[0]


@router.patch("/teams/{team_id}", response_model=TeamResponse)
async def update_team(
    team_id: uuid.UUID,
    payload: TeamUpdateRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Rename team, set color, or adjust file-size limit."""
    team = await db.get(Team, team_id)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    before = {
        "display_name": team.display_name,
        "color": team.color,
        "file_size_limit_bytes": team.file_size_limit_bytes,
    }

    if payload.display_name is not None:
        team.display_name = payload.display_name
    if payload.color is not None:
        team.color = payload.color
    if payload.file_size_limit_bytes is not None:
        team.file_size_limit_bytes = payload.file_size_limit_bytes

    await db.commit()

    await audit_service.record_audit_log(
        db=db,
        actor_id=current_admin.id,
        actor_email=current_admin.email,
        action="TEAM_UPDATED",
        target_type="TEAM",
        target_id=team.id,
        details={"before": before, "after": payload.model_dump(exclude_unset=True)},
    )

    teams = await team_service.get_all_teams_with_stats(db)
    for t in teams:
        if t["id"] == team.id:
            return t
    return teams[0]


@router.get("/audit-logs", response_model=List[AuditLogResponse])
async def list_audit_logs(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    action: Optional[str] = Query(default=None),
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """View chronological audit log of all administrative actions."""
    return await audit_service.get_audit_logs(
        db=db,
        limit=limit,
        offset=offset,
        action_filter=action,
    )
