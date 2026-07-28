from app.models.simulation import Simulation, SimulationModule


def _register_and_login(client, email="student@example.com"):
    client.post(
        "/api/auth/register",
        json={"email": email, "password": "supersecret123", "full_name": "Test Student"},
    )
    login_resp = client.post(
        "/api/auth/login",
        data={"username": email, "password": "supersecret123"},
    )
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _seed_simlab_simulation(db_session) -> Simulation:
    simulation = Simulation(
        title="Нейтрализация HCl + NaOH",
        module=SimulationModule.SIMLAB,
        subject="Химия",
        config={"expected_steps": ["mix_reagents"]},
        difficulty=1,
    )
    db_session.add(simulation)
    db_session.commit()
    db_session.refresh(simulation)
    return simulation


def test_mix_reagents_action_returns_reaction_result(client, db_session):
    headers = _register_and_login(client)
    simulation = _seed_simlab_simulation(db_session)

    response = client.post(
        f"/api/simulations/{simulation.id}/action",
        json={"action_type": "mix_reagents", "payload": {"reagent_a": "hcl", "reagent_b": "naoh"}},
        headers=headers,
    )

    assert response.status_code == 200
    result = response.json()["result"]
    assert result["is_exothermic"] is True
    assert result["gas_released"] is False


def test_mix_unknown_reagents_returns_400(client, db_session):
    headers = _register_and_login(client)
    simulation = _seed_simlab_simulation(db_session)

    response = client.post(
        f"/api/simulations/{simulation.id}/action",
        json={"action_type": "mix_reagents", "payload": {"reagent_a": "water", "reagent_b": "sand"}},
        headers=headers,
    )

    assert response.status_code == 400


def test_complete_simulation_creates_lab_result_with_score(client, db_session):
    headers = _register_and_login(client)
    simulation = _seed_simlab_simulation(db_session)

    response = client.post(
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

    my_results = client.get("/api/results/me", headers=headers)
    assert my_results.status_code == 200
    assert len(my_results.json()) == 1


def test_ai_hint_uses_mock_when_no_api_key_configured(client, db_session):
    headers = _register_and_login(client)
    simulation = _seed_simlab_simulation(db_session)

    response = client.post(
        "/api/ai/hint",
        json={"simulation_id": simulation.id, "scene_state": "Ученик смешал HCl с NaOH при 25°C"},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["hint"].startswith("[mock-ai]")
