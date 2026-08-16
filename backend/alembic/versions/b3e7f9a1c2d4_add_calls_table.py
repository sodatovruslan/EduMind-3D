"""add calls table (T7 call signaling foundation)

Revision ID: b3e7f9a1c2d4
Revises: a7c9e1f2b3d4
Create Date: 2026-08-15 10:00:00.000000

Chained from a7c9e1f2b3d4 (this session's own last committed head, and
the real dev DB's current revision per `alembic current`), NOT from the
concurrent performance session's `0f12aa5fce35` — that migration is still
uncommitted in the shared working tree (confirmed again before writing
this migration), never applied anywhere, and per this stage's own
explicit instruction it must not be touched or merged against while still
uncommitted. This intentionally continues the two-heads situation already
flagged in T5/T6's own HANDOFF.md entries; whoever integrates both
branches will need one `alembic merge heads` step then.
"""
from alembic import op
import sqlalchemy as sa


revision = "b3e7f9a1c2d4"
down_revision = "a7c9e1f2b3d4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "calls",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("conversation_id", sa.String(length=36), nullable=False),
        sa.Column("caller_id", sa.String(length=36), nullable=False),
        sa.Column("callee_id", sa.String(length=36), nullable=False),
        sa.Column("call_type", sa.Enum("AUDIO", "VIDEO", name="calltype"), nullable=False),
        sa.Column(
            "status",
            sa.Enum("RINGING", "ACCEPTED", "DECLINED", "CANCELLED", "MISSED", "ENDED", name="callstatus"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("answered_at", sa.DateTime(), nullable=True),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        # At most one active (ringing/accepted) call per conversation: set
        # to conversation_id while active, NULL once terminal — a plain
        # UNIQUE constraint on a nullable column, portable across Postgres
        # and SQLite alike (see Call model's own docstring for why this
        # isn't a dialect-specific partial index instead).
        sa.Column("active_conversation_id", sa.String(length=36), nullable=True),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"]),
        sa.ForeignKeyConstraint(["caller_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["callee_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["active_conversation_id"], ["conversations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("active_conversation_id", name="uq_calls_active_conversation"),
    )
    op.create_index("ix_calls_conversation_created", "calls", ["conversation_id", "created_at"])
    op.create_index("ix_calls_caller", "calls", ["caller_id"])
    op.create_index("ix_calls_callee", "calls", ["callee_id"])


def downgrade() -> None:
    op.drop_index("ix_calls_callee", table_name="calls")
    op.drop_index("ix_calls_caller", table_name="calls")
    op.drop_index("ix_calls_conversation_created", table_name="calls")
    op.drop_table("calls")
    # Postgres leaves the enum TYPE behind after DROP TABLE; drop it
    # explicitly so a downgrade is genuinely clean and re-upgradable.
    op.execute("DROP TYPE IF EXISTS calltype")
    op.execute("DROP TYPE IF EXISTS callstatus")
