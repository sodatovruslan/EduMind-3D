"""add help_requests table (T10 contextual student teacher help)

Revision ID: c33e94e8e09c
Revises: d5e9c3a7f2b4
Create Date: 2026-08-18 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "c33e94e8e09c"
down_revision = "d5e9c3a7f2b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "help_requests",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("conversation_id", sa.String(length=36), nullable=False),
        sa.Column("student_id", sa.String(length=36), nullable=False),
        sa.Column("teacher_id", sa.String(length=36), nullable=False),
        sa.Column("world", sa.String(length=20), nullable=False),
        sa.Column("context_snapshot", sa.JSON(), nullable=False),
        sa.Column("student_message", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("PENDING", "ACCEPTED", "DECLINED", "RESOLVED", "CANCELLED", name="helprequeststatus"),
            nullable=False,
        ),
        sa.Column("call_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        # At most one active (pending/accepted) help request per
        # (conversation, world) — same portable nullable-unique-column
        # race guard as calls.active_conversation_id (see that migration
        # and the HelpRequest model's own docstring for why this isn't a
        # dialect-specific partial index).
        sa.Column("active_key", sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"]),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["teacher_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["call_id"], ["calls.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("active_key", name="uq_help_requests_active_key"),
    )
    op.create_index("ix_help_requests_conversation_created", "help_requests", ["conversation_id", "created_at"])
    op.create_index("ix_help_requests_teacher_status", "help_requests", ["teacher_id", "status"])
    op.create_index("ix_help_requests_student_status", "help_requests", ["student_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_help_requests_student_status", table_name="help_requests")
    op.drop_index("ix_help_requests_teacher_status", table_name="help_requests")
    op.drop_index("ix_help_requests_conversation_created", table_name="help_requests")
    op.drop_table("help_requests")
    # Postgres leaves the enum TYPE behind after DROP TABLE; drop it
    # explicitly so a downgrade is genuinely clean and re-upgradable.
    op.execute("DROP TYPE IF EXISTS helprequeststatus")
