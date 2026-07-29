from sqlalchemy import select

from app.models.simulation import Simulation, SimulationModule
from app.models.user import User, UserRole


async def _register_and_login(client, email):
    await client.post(
        "/api/auth/register",
        json={"email": email, "password": "supersecret123", "full_name": "Test User"},
    )
    login_resp = await client.post(
        "/api/auth/login",
        data={"username": email, "password": "supersecret123"},
    )
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _promote_to_teacher(db_session, email):
    result = await db_session.execute(select(User).where(User.email == email))
    user = result.scalar_one()
    user.role = UserRole.TEACHER
    await db_session.commit()


async def _seed_simulation(db_session) -> Simulation:
    simulation = Simulation(
        title="Нейтрализация HCl + NaOH",
        module=SimulationModule.SIMLAB,
        subject="Химия",
        config={"expected_steps": ["mix_reagents"]},
        difficulty=1,
    )
    db_session.add(simulation)
    await db_session.commit()
    await db_session.refresh(simulation)
    return simulation


async def test_class_stats_requires_teacher_role(client):
    student_headers = await _register_and_login(client, "student@example.com")
    response = await client.get("/api/results/stats", headers=student_headers)
    assert response.status_code == 403


async def test_class_stats_aggregates_results(client, db_session):
    simulation = await _seed_simulation(db_session)

    student_headers = await _register_and_login(client, "student1@example.com")
    await client.post(
        f"/api/simulations/{simulation.id}/complete",
        json={"actions_log": [{"action_type": "mix_reagents"}], "duration_seconds": 30},
        headers=student_headers,
    )

    await _register_and_login(client, "student2@example.com")  # ученик без попыток

    teacher_headers = await _register_and_login(client, "teacher@example.com")
    await _promote_to_teacher(db_session, "teacher@example.com")

    response = await client.get("/api/results/stats", headers=teacher_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["average_score"] == 100.0
    assert body["active_students"] == 1
    assert body["total_students"] == 2
    assert body["completion_rate"] == 50.0


async def test_results_include_simulation_title(client, db_session):
    simulation = await _seed_simulation(db_session)
    headers = await _register_and_login(client, "student@example.com")
    await client.post(
        f"/api/simulations/{simulation.id}/complete",
        json={"actions_log": [{"action_type": "mix_reagents"}], "duration_seconds": 10},
        headers=headers,
    )

    response = await client.get("/api/results/me", headers=headers)
    assert response.status_code == 200
    results = response.json()
    assert results[0]["simulation_title"] == "Нейтрализация HCl + NaOH"
