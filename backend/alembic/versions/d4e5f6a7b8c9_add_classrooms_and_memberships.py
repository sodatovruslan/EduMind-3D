"""add classrooms and class memberships

Revision ID: d4e5f6a7b8c9
Revises: 8d92d001b554
Create Date: 2026-08-10 16:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "d4e5f6a7b8c9"
down_revision = "8d92d001b554"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "classrooms",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("teacher_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("status IN ('active', 'archived')", name="ck_classrooms_status"),
        sa.ForeignKeyConstraint(["teacher_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_classrooms_teacher_id", "classrooms", ["teacher_id"])
    op.create_index("ix_classrooms_teacher_status", "classrooms", ["teacher_id", "status"])
    op.create_table(
        "class_memberships",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("class_id", sa.String(length=36), nullable=False),
        sa.Column("student_id", sa.String(length=36), nullable=False),
        sa.Column("joined_at", sa.DateTime(), nullable=False),
        sa.Column("removed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["class_id"], ["classrooms.id"]),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("class_id", "student_id", name="uq_class_memberships_class_student"),
    )
    op.create_index("ix_class_memberships_class_active", "class_memberships", ["class_id", "removed_at"])
    op.create_index("ix_class_memberships_student_active", "class_memberships", ["student_id", "removed_at"])


def downgrade() -> None:
    op.drop_index("ix_class_memberships_student_active", table_name="class_memberships")
    op.drop_index("ix_class_memberships_class_active", table_name="class_memberships")
    op.drop_table("class_memberships")
    op.drop_index("ix_classrooms_teacher_status", table_name="classrooms")
    op.drop_index("ix_classrooms_teacher_id", table_name="classrooms")
    op.drop_table("classrooms")
