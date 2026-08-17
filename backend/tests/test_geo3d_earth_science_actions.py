from app.models.simulation import Simulation, SimulationModule


async def _register_and_login(client, email="geo3d-student@example.com"):
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


async def _seed_geo3d_simulation(db_session) -> Simulation:
    simulation = Simulation(
        title="GeoWorld: Earth Science",
        module=SimulationModule.GEO3D,
        subject="География",
        config={"expected_steps": ["explore_plate_boundary", "explore_volcano", "explore_earthquake"]},
        difficulty=1,
    )
    db_session.add(simulation)
    await db_session.commit()
    await db_session.refresh(simulation)
    return simulation


# G6.12 §13/§16/§20 — эти три action_type НЕ дублируют внешние датасеты
# (PB2002/NOAA/USGS) на бэкенде (dataset = source of truth остаётся на
# фронтенде) — бэкенд только подтверждает форму payload и логирует
# реальный round-trip, пригодный для order-preserving scoring через
# compute_score (та же семантика, что explore_layer/explore_continent).


async def test_explore_plate_boundary_action_echoes_payload(client, db_session):
    headers = await _register_and_login(client)
    simulation = await _seed_geo3d_simulation(db_session)

    response = await client.post(
        f"/api/simulations/{simulation.id}/action",
        json={
            "action_type": "explore_plate_boundary",
            "payload": {"plate_a": "Eurasia", "plate_b": "India", "boundary_type": "subduction"},
        },
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["action_type"] == "explore_plate_boundary"
    assert body["result"] == {"plate_a": "Eurasia", "plate_b": "India", "boundary_type": "subduction"}


async def test_explore_plate_boundary_missing_plate_names_returns_400(client, db_session):
    headers = await _register_and_login(client)
    simulation = await _seed_geo3d_simulation(db_session)

    response = await client.post(
        f"/api/simulations/{simulation.id}/action",
        json={"action_type": "explore_plate_boundary", "payload": {"plate_a": "Eurasia"}},
        headers=headers,
    )

    assert response.status_code == 400


async def test_explore_volcano_action_echoes_payload(client, db_session):
    headers = await _register_and_login(client)
    simulation = await _seed_geo3d_simulation(db_session)

    response = await client.post(
        f"/api/simulations/{simulation.id}/action",
        json={"action_type": "explore_volcano", "payload": {"name": "Krakatoa", "country": "Indonesia"}},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["result"] == {"name": "Krakatoa", "country": "Indonesia"}


async def test_explore_volcano_missing_name_returns_400(client, db_session):
    headers = await _register_and_login(client)
    simulation = await _seed_geo3d_simulation(db_session)

    response = await client.post(
        f"/api/simulations/{simulation.id}/action",
        json={"action_type": "explore_volcano", "payload": {}},
        headers=headers,
    )

    assert response.status_code == 400


async def test_explore_earthquake_action_echoes_payload(client, db_session):
    headers = await _register_and_login(client)
    simulation = await _seed_geo3d_simulation(db_session)

    response = await client.post(
        f"/api/simulations/{simulation.id}/action",
        json={"action_type": "explore_earthquake", "payload": {"place": "10km SW of Somewhere", "magnitude": 6.5}},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["result"] == {"place": "10km SW of Somewhere", "magnitude": 6.5}


async def test_explore_earthquake_missing_magnitude_returns_400(client, db_session):
    headers = await _register_and_login(client)
    simulation = await _seed_geo3d_simulation(db_session)

    response = await client.post(
        f"/api/simulations/{simulation.id}/action",
        json={"action_type": "explore_earthquake", "payload": {"place": "Somewhere"}},
        headers=headers,
    )

    assert response.status_code == 400


async def test_complete_with_new_action_types_scores_against_expected_steps(client, db_session):
    headers = await _register_and_login(client)
    simulation = await _seed_geo3d_simulation(db_session)

    response = await client.post(
        f"/api/simulations/{simulation.id}/complete",
        json={
            "actions_log": [
                {"action_type": "explore_plate_boundary", "plate_a": "Eurasia", "plate_b": "India"},
                {"action_type": "explore_volcano", "name": "Krakatoa"},
                {"action_type": "explore_earthquake", "place": "Somewhere", "magnitude": 6.5},
            ],
            "duration_seconds": 30,
        },
        headers=headers,
    )

    assert response.status_code == 201
    assert response.json()["score"] == 100.0
