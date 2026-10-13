import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class TeamMemberSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    email: str
    display_name: str
    role: str
    status: str
    is_lead: bool
    joined_at: datetime


class TeamResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    display_name: str
    color: str
    file_size_limit_bytes: int
    is_custom_limit: bool
    member_count: int
    lead_names: List[str]
    created_at: datetime
    updated_at: datetime


class TeamDetailResponse(TeamResponse):
    members: List[TeamMemberSummary]


class TeamCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=50, pattern=r"^[a-z0-9_]+$")
    display_name: str = Field(..., min_length=2, max_length=100)
    color: str = Field(default="#6366F1", pattern=r"^#[0-9a-fA-F]{6}$")
    file_size_limit_bytes: Optional[int] = Field(default=None, ge=1024 * 1024)


class TeamUpdateRequest(BaseModel):
    display_name: Optional[str] = Field(default=None, min_length=2, max_length=100)
    color: Optional[str] = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    file_size_limit_bytes: Optional[int] = Field(default=None, ge=1024 * 1024)


class TeamFileLimitUpdateRequest(BaseModel):
    file_size_limit_bytes: int = Field(..., ge=1024 * 1024)
