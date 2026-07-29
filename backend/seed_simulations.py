"""
Разовый сид-скрипт для dev-БД: создает по одной демонстрационной
симуляции на каждый модуль, чтобы было что открыть на дашборде.
Запуск: python seed_simulations.py
"""
import asyncio

from sqlalchemy import select

from app.database import SessionLocal
from app.models.simulation import Simulation, SimulationModule

SEED_SIMULATIONS = [
    {
        "title": "Нейтрализация HCl + NaOH",
        "module": SimulationModule.SIMLAB,
        "subject": "Химия",
        "config": {"expected_steps": ["mix_reagents"]},
        "difficulty": 1,
    },
    {
        "title": "Строение Земли: кора, мантия, ядро",
        "module": SimulationModule.GEO3D,
        "subject": "География и геология",
        "config": {"expected_steps": ["explore_layer", "explore_layer", "explore_layer", "explore_layer"]},
        "difficulty": 1,
    },
    {
        "title": "Собери электрическую цепь",
        "module": SimulationModule.ELECTRICITY_LAB,
        "subject": "Физика",
        "config": {"expected_steps": ["connect_circuit", "close_switch", "read_meters"]},
        "difficulty": 1,
    },
]


async def main() -> None:
    async with SessionLocal() as db:
        existing_titles = {row[0] for row in (await db.execute(select(Simulation.title))).all()}
        created = 0
        for seed in SEED_SIMULATIONS:
            if seed["title"] in existing_titles:
                continue
            db.add(Simulation(**seed))
            created += 1
        await db.commit()
        print(f"Создано симуляций: {created}")


if __name__ == "__main__":
    asyncio.run(main())
