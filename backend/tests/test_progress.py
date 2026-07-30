from app.config import settings
from app.models.simulation import Simulation, SimulationModule


async def _register_and_login(client, email="progress-student@example.com"):
    await client.post(
        "/api/auth/register",
        json={"email": email, "password": "supersecret123", "full_name": "Test Student"},
    )
    login_resp = await client.post(
        "/api/auth/login",
        data={"username": email, "password": "supersecret123"},
    )
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _seed_electricity_lab_simulation(db_session) -> Simulation:
    simulation = Simulation(
        title="Собери электрическую цепь",
        module=SimulationModule.ELECTRICITY_LAB,
        subject="Физика",
        config={"expected_steps": ["connect_circuit", "close_switch", "read_meters"]},
        difficulty=1,
    )
    db_session.add(simulation)
    await db_session.commit()
    await db_session.refresh(simulation)
    return simulation


async def test_task_event_updates_xp_level_and_first_circuit_achievement(client, db_session):
    headers = await _register_and_login(client)
    simulation = await _seed_electricity_lab_simulation(db_session)

    response = await client.post(
        "/api/progress/task-event",
        json={
            "simulation_id": simulation.id,
            "task_id": "task-1-close-loop",
            "difficulty": "easy",
            "xp_reward": 10,
            "completed": True,
            "hints_used": 0,
            "attempts": 3,
            "mistakes": [],
        },
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["profile"]["xp"] == 10
    assert body["profile"]["level"] == 1
    assert body["profile"]["completed_tasks"] == ["task-1-close-loop"]
    assert "first_circuit" in body["new_achievements"]
    assert body["profile"]["accuracy"] == 100.0
    assert body["profile"]["current_streak"] == 1


async def test_task_event_does_not_double_count_xp_on_repeat_completion(client, db_session):
    headers = await _register_and_login(client)
    simulation = await _seed_electricity_lab_simulation(db_session)

    task_payload = {
        "simulation_id": simulation.id,
        "task_id": "task-1-close-loop",
        "difficulty": "easy",
        "xp_reward": 10,
        "completed": True,
        "hints_used": 0,
        "attempts": 2,
        "mistakes": [],
    }
    first = await client.post("/api/progress/task-event", json=task_payload, headers=headers)
    second = await client.post("/api/progress/task-event", json=task_payload, headers=headers)

    assert first.json()["profile"]["xp"] == 10
    # повторное прохождение уже пройденной задачи не начисляет XP второй раз
    assert second.json()["profile"]["xp"] == 10
    assert second.json()["new_achievements"] == []


async def test_repeated_mistake_is_detected_after_three_identical_codes(client, db_session):
    headers = await _register_and_login(client)
    simulation = await _seed_electricity_lab_simulation(db_session)

    last_response = None
    for _ in range(3):
        last_response = await client.post(
            "/api/progress/task-event",
            json={
                "simulation_id": simulation.id,
                "task_id": "task-2-ammeter-series",
                "difficulty": "medium",
                "xp_reward": 15,
                "completed": False,
                "hints_used": 0,
                "attempts": 1,
                "mistakes": [{"code": "ammeter_parallel"}],
            },
            headers=headers,
        )

    assert last_response.status_code == 200
    assert last_response.json()["repeated_mistake_code"] == "ammeter_parallel"


async def test_lab_completed_awards_perfect_and_no_hints_achievements(client, db_session, monkeypatch):
    # /lab-completed вызывает get_lab_summary -> _chat_completion — без
    # мок-fallback'а это был бы реальный сетевой запрос к Gemini/OpenAI
    monkeypatch.setattr(settings, "OPENAI_API_KEY", None)
    monkeypatch.setattr(settings, "GEMINI_API_KEY", None)

    headers = await _register_and_login(client)
    simulation = await _seed_electricity_lab_simulation(db_session)

    response = await client.post(
        "/api/progress/lab-completed",
        json={
            "simulation_id": simulation.id,
            "tasks_completed": 6,
            "total_mistakes": 0,
            "total_hints": 0,
            "total_attempts": 12,
        },
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["profile"]["completed_labs"] == 1
    assert body["profile"]["last_completed_lab"] == simulation.id
    assert "first_perfect_lab" in body["new_achievements"]
    assert "no_hints_used" in body["new_achievements"]
    assert "fast_learner" in body["new_achievements"]
    assert isinstance(body["summary"], str) and len(body["summary"]) > 0


async def test_get_my_progress_returns_profile_and_history(client, db_session):
    headers = await _register_and_login(client, email="progress-history@example.com")
    simulation = await _seed_electricity_lab_simulation(db_session)

    await client.post(
        "/api/progress/task-event",
        json={
            "simulation_id": simulation.id,
            "task_id": "task-1-close-loop",
            "difficulty": "easy",
            "xp_reward": 10,
            "completed": True,
            "hints_used": 1,
            "attempts": 4,
            "mistakes": [{"code": "open_circuit"}],
        },
        headers=headers,
    )

    response = await client.get("/api/progress/me", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["profile"]["xp"] == 10
    assert len(body["events"]) >= 2  # task_completed + mistake


async def test_teacher_chat_accepts_optional_learning_profile(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "OPENAI_API_KEY", None)
    monkeypatch.setattr(settings, "GEMINI_API_KEY", None)

    headers = await _register_and_login(client, email="progress-teacher-chat@example.com")
    simulation = await _seed_electricity_lab_simulation(db_session)

    response = await client.post(
        "/api/ai/teacher",
        json={
            "simulation_id": simulation.id,
            "student_message": "Как у меня дела?",
            "context": {"physics": {}, "validation": {"errors": []}},
            "history": [],
            "learning_profile": {"level": 2, "xp": 40, "weak_topics": ["Амперметр"]},
        },
        headers=headers,
    )

    assert response.status_code == 200
    # эндпоинт не должен падать, если передан learning_profile — мок просто
    # эхо-обрезает итоговый user_prompt (context + профиль + вопрос)
    assert response.json()["reply"].startswith("[mock-ai]")
