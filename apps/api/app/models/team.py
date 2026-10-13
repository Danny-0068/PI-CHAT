import uuid
from sqlalchemy import String, BigInteger
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.base import TimestampMixin


class Team(Base, TimestampMixin):
    __tablename__ = "teams"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    name: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        index=True,
        nullable=False,
    )
    display_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    color: Mapped[str] = mapped_column(
        String(20),
        default="#6366F1",
        nullable=False,
    )
    file_size_limit_bytes: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True,
    )

    memberships = relationship(
        "TeamMembership",
        back_populates="team",
        cascade="all, delete-orphan",
    )
