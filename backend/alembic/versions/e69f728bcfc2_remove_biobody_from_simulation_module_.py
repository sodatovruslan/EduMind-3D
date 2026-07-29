"""remove biobody from simulation module enum

Revision ID: e69f728bcfc2
Revises: 50f21cc0fd52
Create Date: 2026-07-28 17:08:10.583682

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e69f728bcfc2'
down_revision = '50f21cc0fd52'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # На Postgres module — уже настоящий ENUM-тип (не VARCHAR), и
        # batch_alter_table здесь НЕ пересобирает таблицу (это фича только
        # SQLite-режима) — он бы просто молча привязал колонку к тому же
        # типу "simulationmodule", в котором BIOBODY как был, так и остался.
        # Поэтому руками: новый тип без BIOBODY -> перекладываем колонку -> удаляем старый.
        op.execute("ALTER TYPE simulationmodule RENAME TO simulationmodule_old")
        op.execute("CREATE TYPE simulationmodule AS ENUM ('SIMLAB', 'GEO3D')")
        op.execute(
            "ALTER TABLE simulations "
            "ALTER COLUMN module TYPE simulationmodule "
            "USING module::text::simulationmodule"
        )
        op.execute("DROP TYPE simulationmodule_old")
    else:
        # SQLite не поддерживает ALTER COLUMN TYPE напрямую — нужен batch-режим
        # (Alembic пересобирает таблицу целиком под капотом).
        with op.batch_alter_table("simulations") as batch_op:
            batch_op.alter_column(
                "module",
                existing_type=sa.VARCHAR(length=7),
                type_=sa.Enum("SIMLAB", "GEO3D", name="simulationmodule"),
                existing_nullable=False,
            )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE simulationmodule RENAME TO simulationmodule_new")
        op.execute("CREATE TYPE simulationmodule AS ENUM ('SIMLAB', 'BIOBODY', 'GEO3D')")
        op.execute(
            "ALTER TABLE simulations "
            "ALTER COLUMN module TYPE simulationmodule "
            "USING module::text::simulationmodule"
        )
        op.execute("DROP TYPE simulationmodule_new")
    else:
        with op.batch_alter_table("simulations") as batch_op:
            batch_op.alter_column(
                "module",
                existing_type=sa.Enum("SIMLAB", "GEO3D", name="simulationmodule"),
                type_=sa.VARCHAR(length=7),
                existing_nullable=False,
            )
