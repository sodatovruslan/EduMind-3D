"""add email verification

Revision ID: d44f02a9c711
Revises: c33e94e8e09c
"""
from alembic import op
import sqlalchemy as sa

revision = "d44f02a9c711"
down_revision = "c33e94e8e09c"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("users", sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("users", sa.Column("email_verification_code_hash", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("email_verification_expires_at", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("email_verification_sent_at", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("email_verification_attempts", sa.Integer(), nullable=False, server_default="0"))
    op.alter_column("users", "email_verified", server_default=sa.false())
    op.execute("UPDATE users SET email = lower(trim(email))")
    op.create_index("uq_users_email_lower", "users", [sa.text("lower(email)")], unique=True)

def downgrade() -> None:
    op.drop_index("uq_users_email_lower", table_name="users")
    for name in ["email_verification_attempts", "email_verification_sent_at", "email_verification_expires_at", "email_verification_code_hash", "email_verified"]:
        op.drop_column("users", name)
