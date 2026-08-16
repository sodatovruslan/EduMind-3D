from app.models.simulation import Simulation, SimulationModule, SimulationVisibility


async def _register_and_login(client, email="visibility_student@example.com"):
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


async def _seed_catalog(db_session) -> dict[str, Simulation]:
    """
    Mirrors the real dev-DB shape after the visibility migration: 3 public
    (Chemistry World, Electricity Lab, one GeoWorld), 2 test E2E fixtures,
    2 archived duplicates (SimLab demo + the orphaned 1-step GeoWorld dup).
    """
    rows = {
        "chem_public": Simulation(
            title="Chemistry World: первые эксперименты",
            module=SimulationModule.CHEMISTRY_WORLD,
            visibility=SimulationVisibility.PUBLIC,
            subject="Химия",
            config={"expected_steps": ["dissolve_salt", "neutralize", "precipitate", "heat_water"]},
            difficulty=1,
        ),
        "electricity_public": Simulation(
            title="Собери электрическую цепь",
            module=SimulationModule.ELECTRICITY_LAB,
            visibility=SimulationVisibility.PUBLIC,
            subject="Физика",
            config={"expected_steps": ["connect_circuit", "close_switch", "read_meters"]},
            difficulty=1,
        ),
        "geo_public": Simulation(
            title="Строение Земли: кора, мантия, ядро",
            module=SimulationModule.GEO3D,
            visibility=SimulationVisibility.PUBLIC,
            subject="География и геология",
            config={"expected_steps": ["explore_layer", "explore_layer", "explore_layer", "explore_layer"]},
            difficulty=1,
        ),
        "geo_archived_dup": Simulation(
            title="Внутреннее строение Земли",
            module=SimulationModule.GEO3D,
            visibility=SimulationVisibility.ARCHIVED,
            subject="Геология",
            config={"expected_steps": ["explore_layer"]},
            difficulty=1,
        ),
        "simlab_archived": Simulation(
            id="sim-simlab-demo",
            title="Нейтрализация HCl + NaOH",
            module=SimulationModule.SIMLAB,
            visibility=SimulationVisibility.ARCHIVED,
            subject="Химия",
            config={"expected_steps": ["mix_reagents"]},
            difficulty=1,
        ),
        "chem_test": Simulation(
            id="sim-chem-world",
            title="Chemistry World for E2E Tests",
            module=SimulationModule.CHEMISTRY_WORLD,
            visibility=SimulationVisibility.TEST,
            subject="Химия",
            config={"expected_steps": ["heat_water"]},
            difficulty=1,
        ),
        "chem_lock_test": Simulation(
            id="sim-chem",
            title="Chemistry Lab for optimistic lock tests",
            module=SimulationModule.CHEMISTRY_WORLD,
            visibility=SimulationVisibility.TEST,
            subject="Химия",
            config={"expected_steps": ["heat_water"]},
            difficulty=1,
        ),
    }
    for row in rows.values():
        db_session.add(row)
    await db_session.commit()
    for row in rows.values():
        await db_session.refresh(row)
    return rows


async def test_catalog_excludes_test_records(client, db_session):
    headers = await _register_and_login(client)
    await _seed_catalog(db_session)

    response = await client.get("/api/simulations/", headers=headers)
    assert response.status_code == 200
    titles = {s["title"] for s in response.json()}
    assert "Chemistry World for E2E Tests" not in titles
    assert "Chemistry Lab for optimistic lock tests" not in titles


async def test_catalog_excludes_archived_records(client, db_session):
    headers = await _register_and_login(client)
    await _seed_catalog(db_session)

    response = await client.get("/api/simulations/", headers=headers)
    titles = {s["title"] for s in response.json()}
    assert "Нейтрализация HCl + NaOH" not in titles
    assert "Внутреннее строение Земли" not in titles


async def test_catalog_returns_public_chemistry_world(client, db_session):
    headers = await _register_and_login(client)
    await _seed_catalog(db_session)

    response = await client.get("/api/simulations/", headers=headers)
    titles = {s["title"] for s in response.json()}
    assert "Chemistry World: первые эксперименты" in titles


async def test_catalog_returns_public_electricity_lab(client, db_session):
    headers = await _register_and_login(client)
    await _seed_catalog(db_session)

    response = await client.get("/api/simulations/", headers=headers)
    titles = {s["title"] for s in response.json()}
    assert "Собери электрическую цепь" in titles


async def test_catalog_returns_exactly_one_public_geoworld_card(client, db_session):
    headers = await _register_and_login(client)
    await _seed_catalog(db_session)

    response = await client.get("/api/simulations/", headers=headers)
    geo_cards = [s for s in response.json() if s["module"] == "geo3d"]
    assert len(geo_cards) == 1
    assert geo_cards[0]["title"] == "Строение Земли: кора, мантия, ядро"


async def test_catalog_returns_exactly_the_three_public_cards(client, db_session):
    headers = await _register_and_login(client)
    await _seed_catalog(db_session)

    response = await client.get("/api/simulations/", headers=headers)
    titles = sorted(s["title"] for s in response.json())
    assert titles == sorted(
        [
            "Chemistry World: первые эксперименты",
            "Собери электрическую цепь",
            "Строение Земли: кора, мантия, ядро",
        ]
    )


async def test_get_by_id_still_works_for_test_visibility_record(client, db_session):
    """E2E hits sim-chem-world/sim-chem directly by id (not through the list
    endpoint) — visibility must not block that direct lookup."""
    headers = await _register_and_login(client)
    await _seed_catalog(db_session)

    response = await client.get("/api/simulations/sim-chem-world", headers=headers)
    assert response.status_code == 200
    assert response.json()["visibility"] == "test"

    response2 = await client.get("/api/simulations/sim-chem", headers=headers)
    assert response2.status_code == 200
    assert response2.json()["visibility"] == "test"


async def test_get_by_id_still_works_for_archived_record(client, db_session):
    headers = await _register_and_login(client)
    await _seed_catalog(db_session)

    response = await client.get("/api/simulations/sim-simlab-demo", headers=headers)
    assert response.status_code == 200
    assert response.json()["visibility"] == "archived"


async def test_explicit_visibility_query_param_can_list_test_records(client, db_session):
    headers = await _register_and_login(client)
    await _seed_catalog(db_session)

    response = await client.get("/api/simulations/?visibility=test", headers=headers)
    assert response.status_code == 200
    titles = {s["title"] for s in response.json()}
    assert titles == {"Chemistry World for E2E Tests", "Chemistry Lab for optimistic lock tests"}


async def test_new_simulation_defaults_to_public_visibility(db_session):
    """Rows created without an explicit visibility (matching how existing
    code/tests build Simulation objects) must default to PUBLIC."""
    simulation = Simulation(
        title="Default visibility check",
        module=SimulationModule.SIMLAB,
        subject="Химия",
        config={},
        difficulty=1,
    )
    db_session.add(simulation)
    await db_session.commit()
    await db_session.refresh(simulation)
    assert simulation.visibility == SimulationVisibility.PUBLIC
