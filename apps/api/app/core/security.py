import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError
from app.core.config import get_settings

settings = get_settings()
ph = PasswordHasher(
    time_cost=2,
    memory_cost=65536,  # 64 MB
    parallelism=2,
    hash_len=32,
    salt_len=16,
)


def hash_password(password: str) -> str:
    """Hash password using Argon2id."""
    return ph.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against Argon2id hash."""
    try:
        return ph.verify(hashed_password, plain_password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def create_access_token(user_id: str, role: str, email: str) -> str:
    """Create short-lived JWT access token (15 mins)."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload: Dict[str, Any] = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "type": "access",
        "iat": now,
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def decode_access_token(token: str) -> Dict[str, Any]:
    """Decode and validate access token."""
    return jwt.decode(
        token,
        settings.SECRET_KEY,
        algorithms=["HS256"],
    )


def create_sudo_token(user_id: str) -> str:
    """Create short-lived sudo token for step-up actions (5 mins)."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=5)
    payload: Dict[str, Any] = {
        "sub": str(user_id),
        "type": "sudo",
        "iat": now,
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def decode_sudo_token(token: str) -> Dict[str, Any]:
    """Decode and validate sudo token."""
    payload = jwt.decode(
        token,
        settings.SECRET_KEY,
        algorithms=["HS256"],
    )
    if payload.get("type") != "sudo":
        raise ValueError("Invalid token type for sudo action")
    return payload


def generate_refresh_token() -> str:
    """Generate cryptographically secure random token string."""
    return secrets.token_urlsafe(48)


def hash_token(raw_token: str) -> str:
    """Hash token using SHA-256 for secure database storage."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
