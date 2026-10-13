import uuid
import enum
from sqlalchemy import String, Boolean, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.base import TimestampMixin


class UserRole(str, enum.Enum):
    MAIN_ADMIN = "MAIN_ADMIN"
    EMPLOYEE = "EMPLOYEE"


class UserStatus(str, enum.Enum):
    AVAILABLE = "AVAILABLE"
    AWAY = "AWAY"
    DND = "DND"


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False,
    )
    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    display_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", native_enum=False),
        default=UserRole.EMPLOYEE,
        nullable=False,
    )
    status: Mapped[UserStatus] = mapped_column(
        Enum(UserStatus, name="user_status", native_enum=False),
        default=UserStatus.AVAILABLE,
        nullable=False,
    )
    status_text: Mapped[str | None] = mapped_column(
        String(140),
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    is_demo: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    force_password_change: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    refresh_tokens = relationship(
        "RefreshToken",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    team_memberships = relationship(
        "TeamMembership",
        back_populates="user",
        cascade="all, delete-orphan",
    )
