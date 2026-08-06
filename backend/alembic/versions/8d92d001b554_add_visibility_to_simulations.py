"""add visibility to simulations

Revision ID: 8d92d001b554
Revises: 102219d86db6
Create Date: 2026-08-06 12:00:00.000000

Adds Simulation.visibility (PUBLIC/INTERNAL/TEST/ARCHIVED) so the user-facing
dashboard catalog (GET /api/simulations/, filtered to PUBLIC) can stop showing
E2E test fixtures and stale demo duplicates without deleting any rows.

Existing-row backfill by known, verified id (see HANDOFF.md 2026-08-06 —
GeoWorld duplicate resolved by comparing config.expected_steps against the
real 4-layer scene, not by title alone):
  PUBLIC   -> Chemistry World: первые эксперименты, Собери электрическую цепь,
              Строение Земли: кора, мантия, ядро (the real 4-step GeoWorld —
              matches seed_simulations.py and geography_engine.py's 4 layers)
  TEST     -> sim-chem-world, sim-chem (fixed E2E fixture ids)
  ARCHIVED -> Нейтрализация HCl + NaOH (SimLab demo, not in the 3-card catalog),
              Внутреннее строение Земли (orphaned 1-step GeoWorld duplicate,
              config doesn't match the real 4-layer scene)
Any other pre-existing row defaults to PUBLIC (server_default) — there were
none besides the 7 identified above at migration-authoring time.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '8d92d001b554'
down_revision = '102219d86db6'
branch_labels = None
depends_on = None


ARCHIVED_IDS = [
    '5c5e3f81-7ca5-4f3b-8042-299128f25dfc',  # SimLab: Нейтрализация HCl + NaOH
    '25a4ebc1-ffd0-4807-9116-6252a172fc21',  # GeoWorld: Внутреннее строение Земли (orphaned 1-step dup)
]
TEST_IDS = ['sim-chem-world', 'sim-chem']


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("CREATE TYPE simulationvisibility AS ENUM ('PUBLIC', 'INTERNAL', 'TEST', 'ARCHIVED')")
        op.execute(
            "ALTER TABLE simulations "
            "ADD COLUMN visibility simulationvisibility NOT NULL DEFAULT 'PUBLIC'"
        )
    else:
        with op.batch_alter_table("simulations") as batch_op:
            batch_op.add_column(
                sa.Column(
                    "visibility",
                    sa.Enum("PUBLIC", "INTERNAL", "TEST", "ARCHIVED", name="simulationvisibility"),
                    nullable=False,
                    server_default="PUBLIC",
                )
            )

    # Backfill known rows — nothing is deleted, only reclassified.
    archived_placeholders = ", ".join(f"'{i}'" for i in ARCHIVED_IDS)
    op.execute(f"UPDATE simulations SET visibility = 'ARCHIVED' WHERE id IN ({archived_placeholders})")
    test_placeholders = ", ".join(f"'{i}'" for i in TEST_IDS)
    op.execute(f"UPDATE simulations SET visibility = 'TEST' WHERE id IN ({test_placeholders})")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE simulations DROP COLUMN visibility")
        op.execute("DROP TYPE simulationvisibility")
    else:
        with op.batch_alter_table("simulations") as batch_op:
            batch_op.drop_column("visibility")
