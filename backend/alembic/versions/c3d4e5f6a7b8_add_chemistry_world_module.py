"""add chemistry_world to simulation module enum

Revision ID: c3d4e5f6a7b8
Revises: b7c8d9e0f1a2
Create Date: 2026-07-30 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c3d4e5f6a7b8'
down_revision = 'b7c8d9e0f1a2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE simulationmodule ADD VALUE IF NOT EXISTS 'CHEMISTRY_WORLD'")
    else:
        with op.batch_alter_table("simulations") as batch_op:
            batch_op.alter_column(
                "module",
                existing_type=sa.Enum("SIMLAB", "GEO3D", "ELECTRICITY_LAB", name="simulationmodule"),
                type_=sa.Enum("SIMLAB", "GEO3D", "ELECTRICITY_LAB", "CHEMISTRY_WORLD", name="simulationmodule"),
                existing_nullable=False,
            )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE simulationmodule RENAME TO simulationmodule_old")
        op.execute("CREATE TYPE simulationmodule AS ENUM ('SIMLAB', 'GEO3D', 'ELECTRICITY_LAB')")
        op.execute(
            "ALTER TABLE simulations "
            "ALTER COLUMN module TYPE simulationmodule "
            "USING module::text::simulationmodule"
        )
        op.execute("DROP TYPE simulationmodule_old")
    else:
        with op.batch_alter_table("simulations") as batch_op:
            batch_op.alter_column(
                "module",
                existing_type=sa.Enum("SIMLAB", "GEO3D", "ELECTRICITY_LAB", "CHEMISTRY_WORLD", name="simulationmodule"),
                type_=sa.Enum("SIMLAB", "GEO3D", "ELECTRICITY_LAB", name="simulationmodule"),
                existing_nullable=False,
            )
