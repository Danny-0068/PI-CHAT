import secrets
import string
import uuid
from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core import security
from app.core.dependencies import get_current_user, require_admin, verify_sudo_step_up
from app.models.user import User, UserRole
from app.schemas.user import (
    UserResponse,
    UserCreateRequest,
    UserResetPasswordResponse,
    UserStatusUpdateRequest,
)
from app.services import auth_service

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("", response_model=list[UserResponse])
async def list_users(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all active users for member directory and DM lookups."""
    query = select(User).where(User.is_active.is_(True)).order_by(User.display_name)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/me", response_model=UserResponse)
async def get_my_profile(
    current_user: User = Depends(get_current_user),
):
    """Retrieve authenticated user's profile."""
    return current_user


from app.realtime.socket_manager import sio

@router.patch("/me/status", response_model=UserResponse)
async def update_my_status(
    payload: UserStatusUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update current user's availability mode and custom status text."""
    current_user.status = payload.status
    current_user.status_text = payload.status_text
    await db.commit()
    await db.refresh(current_user)

    await sio.emit(
        "user_status_changed",
        {
            "user_id": str(current_user.id),
            "status": current_user.status.value,
            "status_text": current_user.status_text,
        },
    )
    return current_user


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreateRequest,
    current_admin: User = Depends(require_admin),
    x_sudo_token: str | None = Header(default=None, alias="X-Sudo-Token"),
    db: AsyncSession = Depends(get_db),
):
    """
    Main-Admin creates a new user.
    Creating another Main-Admin requires sudo step-up (X-Sudo-Token).
    """
    # Check sudo requirement if creating another Main-Admin
    if payload.role == UserRole.MAIN_ADMIN:
        if not x_sudo_token:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Sudo-mode step-up required to create another Main-Admin. Provide X-Sudo-Token header.",
            )
        try:
            sudo_payload = security.decode_sudo_token(x_sudo_token)
            if sudo_payload.get("sub") != str(current_admin.id):
                raise ValueError()
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid or expired sudo token.",
            )

    # Check for existing email
    query = select(User).where(User.email == payload.email.lower().strip())
    existing = await db.execute(query)
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists.",
        )

    # Hash password with Argon2
    password_hash = security.hash_password(payload.password)

    new_user = User(
        email=payload.email.lower().strip(),
        password_hash=password_hash,
        display_name=payload.display_name.strip(),
        role=payload.role,
        force_password_change=payload.force_password_change,
        is_active=True,
        is_demo=False,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user


@router.post("/{user_id}/reset-password", response_model=UserResetPasswordResponse)
async def reset_user_password(
    user_id: uuid.UUID,
    current_admin: User = Depends(require_admin),
    x_sudo_token: str | None = Header(default=None, alias="X-Sudo-Token"),
    db: AsyncSession = Depends(get_db),
):
    """
    Main-Admin generates a brand-new random password for a user.
    If the target user is another Main-Admin, sudo step-up is required.
    All existing sessions for that user are revoked.
    """
    query = select(User).where(User.id == user_id)
    result = await db.execute(query)
    target_user = result.scalar_one_or_none()

    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Step-up check if target user is Main-Admin
    if target_user.role == UserRole.MAIN_ADMIN:
        if not x_sudo_token:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Sudo-mode step-up required to reset a Main-Admin's password. Provide X-Sudo-Token header.",
            )
        try:
            sudo_payload = security.decode_sudo_token(x_sudo_token)
            if sudo_payload.get("sub") != str(current_admin.id):
                raise ValueError()
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid or expired sudo token.",
            )

    # Generate cryptographically secure random temporary password (12 chars)
    chars = string.ascii_letters + string.digits + "!@#$%^&*"
    new_password = "".join(secrets.choice(chars) for _ in range(12))

    target_user.password_hash = security.hash_password(new_password)
    target_user.force_password_change = True

    # Revoke all existing sessions for target user
    await auth_service.revoke_all_user_tokens(db, target_user.id)
    await db.commit()

    return UserResetPasswordResponse(
        user_id=target_user.id,
        email=target_user.email,
        new_password=new_password,
        message="Password reset successfully. The original password is not retrievable.",
    )
