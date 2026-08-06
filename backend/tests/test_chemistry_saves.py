import pytest
from httpx import AsyncClient

from app.models.user import User, UserRole
from app.services.auth_service import register_user
from app.schemas.user import UserCreate
from app.core.security import create_access_token


async def _create_test_user(db_session, email: str) -> tuple[User, str]:
    user = await register_user(
        db_session,
        UserCreate(email=email, password="password123", full_name="Test User", role=UserRole.STUDENT),
    )
    token = create_access_token(user.id)
    return user, token


@pytest.mark.asyncio
async def test_create_and_get_chemistry_save(client: AsyncClient, db_session):
    user, token = await _create_test_user(db_session, "save1@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "simulation_id": "sim-chem-1",
        "experiment_id": "lab-water-heating",
        "schema_version": "1.0",
        "status": "active",
        "snapshot": {"workspace": {"containers": []}, "temperatureC": 25.0},
    }

    res = await client.post("/api/chemistry/saves", json=payload, headers=headers)
    assert res.status_code == 201
    data = res.json()
    assert data["user_id"] == user.id
    assert data["experiment_id"] == "lab-water-heating"
    assert data["revision"] == 1
    assert data["status"] == "active"
    save_id = data["id"]

    # Get save by id
    res_get = await client.get(f"/api/chemistry/saves/{save_id}", headers=headers)
    assert res_get.status_code == 200
    assert res_get.json()["id"] == save_id


@pytest.mark.asyncio
async def test_list_own_chemistry_saves(client: AsyncClient, db_session):
    user, token = await _create_test_user(db_session, "savelist@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # Create 2 saves
    await client.post("/api/chemistry/saves", json={"experiment_id": "exp-1", "snapshot": {}}, headers=headers)
    await client.post("/api/chemistry/saves", json={"experiment_id": "exp-2", "snapshot": {}}, headers=headers)

    res = await client.get("/api/chemistry/saves", headers=headers)
    assert res.status_code == 200
    saves = res.json()
    assert len(saves) == 2


@pytest.mark.asyncio
async def test_latest_active_save(client: AsyncClient, db_session):
    user, token = await _create_test_user(db_session, "savelatest@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    await client.post("/api/chemistry/saves", json={"experiment_id": "exp-water", "snapshot": {"v": 1}}, headers=headers)
    res2 = await client.post("/api/chemistry/saves", json={"experiment_id": "exp-water", "snapshot": {"v": 2}}, headers=headers)
    latest_id = res2.json()["id"]

    res_latest = await client.get("/api/chemistry/saves/latest?experiment_id=exp-water", headers=headers)
    assert res_latest.status_code == 200
    assert res_latest.json()["id"] == latest_id


@pytest.mark.asyncio
async def test_update_chemistry_save_success(client: AsyncClient, db_session):
    user, token = await _create_test_user(db_session, "saveupdate@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    res_create = await client.post("/api/chemistry/saves", json={"experiment_id": "exp-1", "snapshot": {"temp": 20}}, headers=headers)
    save_id = res_create.json()["id"]

    update_payload = {
        "expected_revision": 1,
        "snapshot": {"temp": 100},
    }
    res_update = await client.put(f"/api/chemistry/saves/{save_id}", json=update_payload, headers=headers)
    assert res_update.status_code == 200
    updated_data = res_update.json()
    assert updated_data["revision"] == 2
    assert updated_data["snapshot"]["temp"] == 100


@pytest.mark.asyncio
async def test_update_revision_conflict_returns_409(client: AsyncClient, db_session):
    user, token = await _create_test_user(db_session, "saveconflict@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    res_create = await client.post("/api/chemistry/saves", json={"experiment_id": "exp-1", "snapshot": {"temp": 20}}, headers=headers)
    save_id = res_create.json()["id"]

    # Pass wrong expected_revision 99
    update_payload = {
        "expected_revision": 99,
        "snapshot": {"temp": 100},
    }
    res_update = await client.put(f"/api/chemistry/saves/{save_id}", json=update_payload, headers=headers)
    assert res_update.status_code == 409
    err = res_update.json()
    assert err["detail"]["error"] == "revision_conflict"
    assert err["detail"]["current_revision"] == 1


@pytest.mark.asyncio
async def test_idempotent_create_with_idempotency_key(client: AsyncClient, db_session):
    user, token = await _create_test_user(db_session, "idempotent@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    key = "key-unique-12345"
    payload = {
        "experiment_id": "exp-idem",
        "idempotency_key": key,
        "snapshot": {"step": 1},
    }

    res1 = await client.post("/api/chemistry/saves", json=payload, headers=headers)
    assert res1.status_code == 201
    save1 = res1.json()

    # Repeat request with same idempotency_key
    res2 = await client.post("/api/chemistry/saves", json=payload, headers=headers)
    assert res2.status_code == 201
    save2 = res2.json()
    assert save1["id"] == save2["id"]


@pytest.mark.asyncio
async def test_strict_user_ownership_isolation(client: AsyncClient, db_session):
    user_a, token_a = await _create_test_user(db_session, "usera@example.com")
    user_b, token_b = await _create_test_user(db_session, "userb@example.com")

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # User A creates save
    res_create = await client.post("/api/chemistry/saves", json={"experiment_id": "secret-exp", "snapshot": {}}, headers=headers_a)
    save_id = res_create.json()["id"]

    # User B tries to read User A's save -> 404
    res_get_b = await client.get(f"/api/chemistry/saves/{save_id}", headers=headers_b)
    assert res_get_b.status_code == 404

    # User B tries to update User A's save -> 404
    res_put_b = await client.put(f"/api/chemistry/saves/{save_id}", json={"expected_revision": 1, "snapshot": {}}, headers=headers_b)
    assert res_put_b.status_code == 404

    # User B tries to delete User A's save -> 404
    res_del_b = await client.delete(f"/api/chemistry/saves/{save_id}", headers=headers_b)
    assert res_del_b.status_code == 404


@pytest.mark.asyncio
async def test_delete_chemistry_save(client: AsyncClient, db_session):
    user, token = await _create_test_user(db_session, "savedel@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    res_create = await client.post("/api/chemistry/saves", json={"experiment_id": "to-delete", "snapshot": {}}, headers=headers)
    save_id = res_create.json()["id"]

    res_del = await client.delete(f"/api/chemistry/saves/{save_id}", headers=headers)
    assert res_del.status_code == 204

    res_get = await client.get(f"/api/chemistry/saves/{save_id}", headers=headers)
    assert res_get.status_code == 404


@pytest.mark.asyncio
async def test_payload_size_limit_exceeded(client: AsyncClient, db_session):
    user, token = await _create_test_user(db_session, "largepayload@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # Create oversized snapshot > 2 MB
    large_str = "x" * (2 * 1024 * 1024 + 100)
    large_payload = {
        "experiment_id": "large-exp",
        "snapshot": {"data": large_str},
    }

    res = await client.post("/api/chemistry/saves", json=large_payload, headers=headers)
    assert res.status_code == 413
