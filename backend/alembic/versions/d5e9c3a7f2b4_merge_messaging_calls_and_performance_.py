"""merge messaging/calls and performance-indexes heads

Revision ID: d5e9c3a7f2b4
Revises: 0f12aa5fce35, b3e7f9a1c2d4
Create Date: 2026-08-16 09:00:00.000000

T8 pre-flight found that the performance-indexes migration
(0f12aa5fce35), which T5/T6/T7 each found still uncommitted and
deliberately left untouched, has since been committed (backend
performance session's `433a788`, merged into `main` via PR #4 /
`6d138ea`). Both it and this project's own T5->T6->T7 chain
(f1a2b3c4d5e6 -> a7c9e1f2b3d4 -> b3e7f9a1c2d4) branch from the same
`d4e5f6a7b8c9` (T2's classrooms/memberships migration) — now that BOTH
sides are real, committed, stable history, this is a genuine two-head
situation to resolve with a normal Alembic merge, not something to keep
deferring. Pure merge — no schema changes of its own, both parents'
`upgrade()`/`downgrade()` bodies are untouched and unmodified.
"""
from alembic import op
import sqlalchemy as sa


revision = "d5e9c3a7f2b4"
down_revision = ("0f12aa5fce35", "b3e7f9a1c2d4")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
