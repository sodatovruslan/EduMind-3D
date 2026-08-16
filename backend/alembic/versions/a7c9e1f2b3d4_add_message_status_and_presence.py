"""add message status and presence (T6)

Revision ID: a7c9e1f2b3d4
Revises: f1a2b3c4d5e6
Create Date: 2026-08-14 09:00:00.000000

Chained from f1a2b3c4d5e6 (this session's own last committed head, and the
real dev DB's current revision per `alembic current`), NOT from the
concurrent performance session's `0f12aa5fce35` — that migration is still
uncommitted in the shared working tree, never applied anywhere, and per
this stage's own explicit instruction it must not be touched or merged
against while still uncommitted. This intentionally re-creates a two-heads
situation once that session commits its migration; whoever integrates both
branches will need one `alembic merge heads` step then — expected, already
flagged in HANDOFF.md's T5 entry, not an error here.
"""
from alembic import op
import sqlalchemy as sa


revision = "a7c9e1f2b3d4"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("delivered_at", sa.DateTime(), nullable=True))
    op.add_column("messages", sa.Column("read_at", sa.DateTime(), nullable=True))
    # Accelerates messaging_service.get_unread_counts's grouped
    # (conversation_id, read_at IS NULL) scan and mark_read's/
    # mark_delivered_via_history's own WHERE conversation_id=... AND
    # {read_at,delivered_at} IS NULL lookups — both run on every
    # conversation-list load and every history fetch/mark-read action, and
    # previously had only (conversation_id, created_at) to fall back on.
    op.create_index("ix_messages_conversation_read", "messages", ["conversation_id", "read_at"])
    op.create_index("ix_messages_conversation_delivered", "messages", ["conversation_id", "delivered_at"])

    op.add_column("users", sa.Column("last_seen_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "last_seen_at")
    op.drop_index("ix_messages_conversation_delivered", table_name="messages")
    op.drop_index("ix_messages_conversation_read", table_name="messages")
    op.drop_column("messages", "read_at")
    op.drop_column("messages", "delivered_at")
