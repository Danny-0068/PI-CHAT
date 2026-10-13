"""create message reactions table

Revision ID: 2026_10_13_0004
Revises: 2026_10_13_0003
Create Date: 2026-10-13 10:45:00.000000+00:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '2026_10_13_0004'
down_revision: Union[str, None] = '2026_10_13_0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'message_reactions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('message_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('messages.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('emoji', sa.String(length=32), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('message_id', 'user_id', 'emoji', name='uq_message_user_emoji'),
    )
    op.create_index(op.f('ix_message_reactions_message_id'), 'message_reactions', ['message_id'], unique=False)
    op.create_index(op.f('ix_message_reactions_user_id'), 'message_reactions', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_message_reactions_user_id'), table_name='message_reactions')
    op.drop_index(op.f('ix_message_reactions_message_id'), table_name='message_reactions')
    op.drop_table('message_reactions')
