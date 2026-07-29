from app.config import settings
from app.models.simulation import Simulation, SimulationModule


async def _register_and_login(client, email="teacher-chat-student@example.com"):
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


async def test_teacher_chat_uses_mock_and_forwards_context(client, db_session, monkeypatch):
    # без реальных ключей эндпоинт не должен падать и не должен ходить в сеть —
    # тот же mock-fallback принцип, что и у /api/ai/hint
    monkeypatch.setattr(settings, "OPENAI_API_KEY", None)
    monkeypatch.setattr(settings, "GEMINI_API_KEY", None)

    headers = await _register_and_login(client)
    simulation = await _seed_electricity_lab_simulation(db_session)

    context = {
        "currentTask": {"id": "task-1-close-loop", "title": "Собери замкнутую цепь", "difficulty": "easy"},
        "taskStatus": "in_progress",
        "xp": 0,
        "physics": {
            "currentA": 0,
            "voltageV": 12,
            "isCircuitActive": False,
            "isShortCircuit": False,
            "isClosedLoop": True,
            "switchState": "OPEN",
            "fuseState": "OK",
            "lampState": "OFF",
        },
        "validation": {
            "completed": False,
            "errors": [{"code": "switch_open", "message": "переключатель разомкнут"}],
            "warnings": [],
            "measurements": {},
        },
        "connections": [{"from": "battery_pos", "to": "switch_a"}],
        "components": [{"id": "battery", "kind": "battery"}],
    }

    response = await client.post(
        "/api/ai/teacher",
        json={
            "simulation_id": simulation.id,
            "student_message": "Почему лампа не горит?",
            "context": context,
            "history": [],
        },
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["reply"].startswith("[mock-ai]")
    # мок-ответ — это усечённый user_prompt, значит реальный контекст физики/
    # валидации действительно дошёл до AI-слоя, а не был подменён чем-то фейковым
    assert "switch_open" in body["reply"] or "Состояние лаборатории" in body["reply"]


async def test_teacher_chat_requires_existing_simulation(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "OPENAI_API_KEY", None)
    monkeypatch.setattr(settings, "GEMINI_API_KEY", None)

    headers = await _register_and_login(client, email="teacher-chat-404@example.com")

    response = await client.post(
        "/api/ai/teacher",
        json={
            "simulation_id": "does-not-exist",
            "student_message": "Привет",
            "context": {},
            "history": [],
        },
        headers=headers,
    )

    assert response.status_code == 404
