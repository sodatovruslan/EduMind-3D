import asyncio
from sqlalchemy import select
from app.database import SessionLocal
from app.models.simulation import Simulation, SimulationModule

E2E_SIMULATIONS = [
    {
        "id": "sim-chem-world",
        "title": "Chemistry World for E2E Tests",
        "module": SimulationModule.CHEMISTRY_WORLD,
        "subject": "Химия",
        "config": {"expected_steps": ["heat_water"]},
        "difficulty": 1,
    },
    {
        "id": "sim-chem",
        "title": "Chemistry Lab for optimistic lock tests",
        "module": SimulationModule.CHEMISTRY_WORLD,
        "subject": "Химия",
        "config": {"expected_steps": ["heat_water"]},
        "difficulty": 1,
    },
]

async def main() -> None:
    async with SessionLocal() as db:
        for seed in E2E_SIMULATIONS:
            # check if exists
            stmt = select(Simulation).where(Simulation.id == seed["id"])
            res = await db.execute(stmt)
            existing = res.scalar_one_or_none()
            if not existing:
                db.add(Simulation(**seed))
                print(f"Seeded simulation {seed['id']}")
            else:
                print(f"Simulation {seed['id']} already exists")
        await db.commit()

if __name__ == "__main__":
    asyncio.run(main())
