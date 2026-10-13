from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.config import get_settings
from app.core import security
from app.core.dependencies import get_current_user, require_admin
from app.core.rate_limit import limiter
from app.models.user import User, UserRole
from app.schemas.auth import (
    LoginRequest,
    DemoLoginRequest,
    TokenResponse,
    UserSummary,
    SudoRequest,
    SudoResponse,
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["Authentication"])
settings = get_settings()

COOKIE_KEY = "refresh_token"
COOKIE_MAX_AGE = settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60


def set_refresh_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(
        key=COOKIE_KEY,
        value=raw_token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        secure=settings.effective_cookie_secure,
        samesite=settings.effective_cookie_samesite,
        path=settings.COOKIE_PATH,
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=COOKIE_KEY,
        path=settings.COOKIE_PATH,
        httponly=True,
        secure=settings.effective_cookie_secure,
        samesite=settings.effective_cookie_samesite,
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(
    request: Request,
    payload: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate user with email & password, issuing JWT access token and rotating refresh cookie."""
    user = await auth_service.authenticate_user(db, payload.email, payload.password)

    # Issue access token
    access_token = security.create_access_token(
        user_id=str(user.id),
        role=user.role.value,
        email=user.email,
    )

    # Issue rotating refresh token
    raw_refresh_token = await auth_service.create_refresh_session(db, user.id)
    set_refresh_cookie(response, raw_refresh_token)

    return TokenResponse(
        access_token=access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserSummary.model_validate(user),
    )


@router.post("/demo-login", response_model=TokenResponse)
@limiter.limit("20/minute")
async def demo_login(
    request: Request,
    payload: DemoLoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """One-click instant login shortcut for demo accounts (Alex Morgan or Sam Rivera)."""
    target_email = "admin@acme.demo" if payload.target == "admin" else "employee@acme.demo"
    query = select(User).where(User.email == target_email)
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Demo account '{target_email}' not found. Please run seed script.",
        )

    access_token = security.create_access_token(
        user_id=str(user.id),
        role=user.role.value,
        email=user.email,
    )

    raw_refresh_token = await auth_service.create_refresh_session(db, user.id)
    set_refresh_cookie(response, raw_refresh_token)

    return TokenResponse(
        access_token=access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserSummary.model_validate(user),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=COOKIE_KEY),
    db: AsyncSession = Depends(get_db),
):
    """Rotate refresh token from httpOnly cookie and return a new access token."""
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token cookie missing",
        )

    try:
        new_access_token, new_raw_token, user = await auth_service.rotate_refresh_token(
            db, refresh_token
        )
    except HTTPException:
        clear_refresh_cookie(response)
        raise

    set_refresh_cookie(response, new_raw_token)

    return TokenResponse(
        access_token=new_access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserSummary.model_validate(user),
    )


@router.post("/logout")
async def logout(
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=COOKIE_KEY),
    db: AsyncSession = Depends(get_db),
):
    """Revoke active refresh token session and clear client cookie."""
    if refresh_token:
        await auth_service.revoke_refresh_token(db, refresh_token)
    clear_refresh_cookie(response)
    return {"status": "logged_out", "message": "Successfully logged out"}


@router.post("/sudo", response_model=SudoResponse)
@limiter.limit("5/minute")
async def sudo_step_up(
    request: Request,
    payload: SudoRequest,
    current_admin: User = Depends(require_admin),
):
    """Verify admin password to issue short-lived (5 min) sudo-mode token for sensitive actions."""
    if not security.verify_password(payload.password, current_admin.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password for sudo verification",
        )

    sudo_token = security.create_sudo_token(str(current_admin.id))
    return SudoResponse(sudo_token=sudo_token, expires_in=300)
