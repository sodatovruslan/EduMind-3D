from app.models.simulation import Simulation, SimulationModule


async def _register_and_login(client, email="student@example.com"):
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


async def _seed_simlab_simulation(db_session) -> Simulation:
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


async def test_mix_reagents_action_returns_reaction_result(client, db_session):
    headers = await _register_and_login(client)
    simulation = await _seed_simlab_simulation(db_session)

    response = await client.post(
        f"/api/simulations/{simulation.id}/action",
        json={"action_type": "mix_reagents", "payload": {"reagent_a": "hcl", "reagent_b": "naoh"}},
        headers=headers,
    )

    assert response.status_code == 200
    result = response.json()["result"]
    assert result["is_exothermic"] is True
    assert result["gas_released"] is False


async def test_mix_unknown_reagents_returns_400(client, db_session):
    headers = await _register_and_login(client)
    simulation = await _seed_simlab_simulation(db_session)

    response = await client.post(
        f"/api/simulations/{simulation.id}/action",
        json={"action_type": "mix_reagents", "payload": {"reagent_a": "water", "reagent_b": "sand"}},
        headers=headers,
    )

    assert response.status_code == 400


async def test_complete_simulation_creates_lab_result_with_score(client, db_session):
    headers = await _register_and_login(client)
    simulation = await _seed_simlab_simulation(db_session)

    response = await client.post(
        f"/api/simulations/{simulation.id}/complete",
        json={
            "actions_log": [{"action_type": "mix_reagents"}],
            "duration_seconds": 42,
        },
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["score"] == 100.0
    assert body["simulation_id"] == simulation.id

    my_results = await client.get("/api/results/me", headers=headers)
    assert my_results.status_code == 200
    assert len(my_results.json()) == 1


async def test_ai_hint_uses_mock_when_no_api_key_configured(client, db_session, monkeypatch):
    # мок-fallback должен срабатывать именно при отсутствии ключей, вне
    # зависимости от того, что реально настроено в .env этого окружения
    # (например, реальный GEMINI_API_KEY для ручной проверки в браузере)
    from app.config import settings

    monkeypatch.setattr(settings, "OPENAI_API_KEY", None)
    monkeypatch.setattr(settings, "GEMINI_API_KEY", None)

    headers = await _register_and_login(client)
    simulation = await _seed_simlab_simulation(db_session)

    response = await client.post(
        "/api/ai/hint",
        json={"simulation_id": simulation.id, "scene_state": "Ученик смешал HCl с NaOH при 25°C"},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["hint"].startswith("[mock-ai]")
