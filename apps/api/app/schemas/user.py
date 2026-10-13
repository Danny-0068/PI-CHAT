import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from app.models.user import UserRole, UserStatus


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str
    role: UserRole
    status: UserStatus
    status_text: str | None = None
    is_active: bool
    is_demo: bool
    force_password_change: bool
    created_at: datetime
    updated_at: datetime


class UserCreateRequest(BaseModel):
    email: EmailStr
    display_name: str = Field(..., min_length=2, max_length=100)
    role: UserRole = UserRole.EMPLOYEE
    password: str = Field(..., min_length=8)
    force_password_change: bool = False


class UserResetPasswordResponse(BaseModel):
    user_id: uuid.UUID
    email: str
    new_password: str
    message: str


class UserStatusUpdateRequest(BaseModel):
    status: UserStatus
    status_text: str | None = Field(default=None, max_length=140)
