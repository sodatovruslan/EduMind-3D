"""
Разовый сид-скрипт для dev-БД: создает по одной РЕАЛЬНОЙ пользовательской
симуляции на модуль, чтобы было что открыть на дашборде. Все записи здесь —
visibility=PUBLIC. Устаревшие demo-заглушки (например старый SimLab-пример)
сюда сознательно не добавляются — если такие записи уже есть в БД с прошлых
запусков, их видимость правится вручную (или отдельной миграцией), а не
пересозданием отсюда.
Запуск: python seed_simulations.py
"""
import asyncio

from sqlalchemy import select

from app.database import SessionLocal
from app.models.simulation import Simulation, SimulationModule, SimulationVisibility

SEED_SIMULATIONS = [
    {
        "title": "GeoWorld: материки, рекорды Земли и страны",
        "module": SimulationModule.GEO3D,
        "visibility": SimulationVisibility.PUBLIC,
        "subject": "География и геология",
        "config": {"expected_steps": ["explore_layer", "explore_layer", "explore_layer", "explore_layer"]},
        "difficulty": 1,
    },
    {
        "title": "Собери электрическую цепь",
        "module": SimulationModule.ELECTRICITY_LAB,
        "visibility": SimulationVisibility.PUBLIC,
        "subject": "Физика",
        "config": {"expected_steps": ["connect_circuit", "close_switch", "read_meters"]},
        "difficulty": 1,
    },
    {
        "title": "Chemistry World: первые эксперименты",
        "module": SimulationModule.CHEMISTRY_WORLD,
        "visibility": SimulationVisibility.PUBLIC,
        "subject": "Химия",
        "config": {"expected_steps": ["dissolve_salt", "neutralize", "precipitate", "heat_water"]},
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
