import uuid
from datetime import datetime, timedelta, timezone
from typing import Tuple
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from app.models.user import User
from app.models.refresh_token import RefreshToken
from app.core import security
from app.core.config import get_settings

settings = get_settings()


async def authenticate_user(
    db: AsyncSession,
    email: str,
    password: str,
) -> User:
    query = select(User).where(User.email == email.lower().strip())
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not security.verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    return user


async def create_refresh_session(
    db: AsyncSession,
    user_id: uuid.UUID,
    family_id: uuid.UUID | None = None,
) -> str:
    raw_token = security.generate_refresh_token()
    token_hash = security.hash_token(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    if family_id is None:
        family_id = uuid.uuid4()

    db_token = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        family_id=family_id,
        is_revoked=False,
        expires_at=expires_at,
    )
    db.add(db_token)
    await db.commit()
    return raw_token


async def rotate_refresh_token(
    db: AsyncSession,
    raw_token: str,
) -> Tuple[str, str, User]:
    token_hash = security.hash_token(raw_token)
    query = select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    result = await db.execute(query)
    db_token = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)

    if not db_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    expires_at = db_token.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired",
        )

    # REUSE DETECTION: If an already revoked token is used, revoke the entire family
    if db_token.is_revoked:
        revoke_query = (
            update(RefreshToken)
            .where(RefreshToken.family_id == db_token.family_id)
            .values(is_revoked=True)
        )
        await db.execute(revoke_query)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token reuse detected. All sessions in family revoked.",
        )

    # Mark current token revoked
    db_token.is_revoked = True

    # Issue new token in same family
    new_raw_token = security.generate_refresh_token()
    new_token_hash = security.hash_token(new_raw_token)
    new_expires_at = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    new_db_token = RefreshToken(
        user_id=db_token.user_id,
        token_hash=new_token_hash,
        family_id=db_token.family_id,
        is_revoked=False,
        expires_at=new_expires_at,
    )
    db.add(new_db_token)

    # Fetch user
    user_query = select(User).where(User.id == db_token.user_id)
    user_res = await db.execute(user_query)
    user = user_res.scalar_one_or_none()

    if not user or not user.is_active:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User inactive or not found",
        )

    await db.commit()

    new_access_token = security.create_access_token(
        user_id=str(user.id),
        role=user.role.value,
        email=user.email,
    )

    return new_access_token, new_raw_token, user


async def revoke_refresh_token(
    db: AsyncSession,
    raw_token: str,
) -> None:
    token_hash = security.hash_token(raw_token)
    query = (
        update(RefreshToken)
        .where(RefreshToken.token_hash == token_hash)
        .values(is_revoked=True)
    )
    await db.execute(query)
    await db.commit()


async def revoke_all_user_tokens(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> None:
    query = (
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id)
        .values(is_revoked=True)
    )
    await db.execute(query)
    await db.commit()
