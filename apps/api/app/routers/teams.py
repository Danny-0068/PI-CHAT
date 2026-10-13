import uuid
from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.team import (
    TeamResponse,
    TeamDetailResponse,
    TeamFileLimitUpdateRequest,
)
from app.services import team_service

router = APIRouter(prefix="/teams", tags=["Teams"])


@router.get("", response_model=List[TeamResponse])
async def list_teams(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve all teams with active member count and lead names."""
    return await team_service.get_all_teams_with_stats(db)


@router.get("/{team_id}", response_model=TeamDetailResponse)
async def get_team_details(
    team_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve detailed team information with active member list."""
    return await team_service.get_team_detail(db, team_id)


@router.patch("/{team_id}/limit", response_model=TeamResponse)
async def update_team_file_limit(
    team_id: uuid.UUID,
    payload: TeamFileLimitUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Adjust team file-size limit.
    - Active Team Lead: allowed up to demo cap (25 MB).
    - Main-Admin: allowed uncapped override.
    """
    await team_service.update_team_file_limit(
        db=db,
        team_id=team_id,
        new_limit_bytes=payload.file_size_limit_bytes,
        actor=current_user,
    )
    # Return updated team response
    teams = await team_service.get_all_teams_with_stats(db)
    for t in teams:
        if t["id"] == team_id:
            return t
    return teams[0]
