import uuid
from typing import Literal
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from app.models.user import UserRole, UserStatus


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class DemoLoginRequest(BaseModel):
    target: Literal["admin", "employee"]


class UserSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str
    role: UserRole
    status: UserStatus
    status_text: str | None = None
    is_active: bool
    is_demo: bool


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # in seconds
    user: UserSummary


class SudoRequest(BaseModel):
    password: str = Field(..., min_length=1)


class SudoResponse(BaseModel):
    sudo_token: str
    expires_in: int = 300  # 5 minutes
