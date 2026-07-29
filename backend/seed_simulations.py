"""
Разовый сид-скрипт для dev-БД: создает по одной демонстрационной
симуляции на каждый модуль, чтобы было что открыть на дашборде.
Запуск: .venv/Scripts/python.exe seed_simulations.py
"""
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
]


def main() -> None:
    db = SessionLocal()
    try:
        existing_titles = {s.title for s in db.query(Simulation).all()}
        created = 0
        for seed in SEED_SIMULATIONS:
            if seed["title"] in existing_titles:
                continue
            db.add(Simulation(**seed))
            created += 1
        db.commit()
        print(f"Создано симуляций: {created}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
