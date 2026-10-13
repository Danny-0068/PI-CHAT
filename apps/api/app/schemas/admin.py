import uuid
from datetime import datetime
from typing import Any, Dict, Optional
from pydantic import BaseModel, ConfigDict, Field
from app.models.user import UserRole, UserStatus


class TeamTagInfo(BaseModel):
    id: uuid.UUID
    name: str
    display_name: str
    color: str
    is_lead: bool


class AdminUserDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str
    role: UserRole
    status: UserStatus
    status_text: Optional[str] = None
    is_active: bool
    is_demo: bool
    force_password_change: bool
    team: Optional[TeamTagInfo] = None
    created_at: datetime
    updated_at: datetime


class AdminUserUpdateRequest(BaseModel):
    display_name: Optional[str] = Field(default=None, min_length=2, max_length=100)
    team_id: Optional[uuid.UUID] = None
    is_lead: Optional[bool] = None
    is_active: Optional[bool] = None


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    actor_id: Optional[uuid.UUID] = None
    actor_email: str
    action: str
    target_type: str
    target_id: Optional[uuid.UUID] = None
    details: Dict[str, Any]
    created_at: datetime
