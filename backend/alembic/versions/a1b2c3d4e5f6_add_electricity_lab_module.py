"""add electricity_lab to simulation module enum

Revision ID: a1b2c3d4e5f6
Revises: e69f728bcfc2
Create Date: 2026-07-29 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = 'e69f728bcfc2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # В отличие от удаления значения (BIOBODY, см. e69f728bcfc2), ДОБАВЛЕНИЕ
        # нового значения в существующий enum-тип Postgres поддерживает нативно
        # и без пересборки типа — ALTER TYPE ... ADD VALUE достаточно.
        op.execute("ALTER TYPE simulationmodule ADD VALUE IF NOT EXISTS 'ELECTRICITY_LAB'")
    else:
        with op.batch_alter_table("simulations") as batch_op:
            batch_op.alter_column(
                "module",
                existing_type=sa.Enum("SIMLAB", "GEO3D", name="simulationmodule"),
                type_=sa.Enum("SIMLAB", "GEO3D", "ELECTRICITY_LAB", name="simulationmodule"),
                existing_nullable=False,
            )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # Postgres не поддерживает удаление значения из enum напрямую -
        # тот же rename/recreate прием, что и в e69f728bcfc2.downgrade.
        op.execute("ALTER TYPE simulationmodule RENAME TO simulationmodule_old")
        op.execute("CREATE TYPE simulationmodule AS ENUM ('SIMLAB', 'GEO3D')")
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
                existing_type=sa.Enum("SIMLAB", "GEO3D", "ELECTRICITY_LAB", name="simulationmodule"),
                type_=sa.Enum("SIMLAB", "GEO3D", name="simulationmodule"),
                existing_nullable=False,
            )
