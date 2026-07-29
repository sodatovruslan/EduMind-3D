async def test_register_login_me_flow(client):
    register_resp = await client.post(
        "/api/auth/register",
        json={"email": "student@example.com", "password": "supersecret123", "full_name": "Ivan Petrov"},
    )
    assert register_resp.status_code == 201
    body = register_resp.json()
    assert body["email"] == "student@example.com"
    assert body["role"] == "student"
    assert "hashed_password" not in body  # пароль не должен утекать в ответ

    login_resp = await client.post(
        "/api/auth/login",
        data={"username": "student@example.com", "password": "supersecret123"},
    )
    assert login_resp.status_code == 200
    tokens = login_resp.json()
    assert "access_token" in tokens
    assert "refresh_token" in tokens

    me_resp = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == "student@example.com"


async def test_register_duplicate_email_fails(client):
    payload = {"email": "dup@example.com", "password": "supersecret123", "full_name": "Dup User"}
    first = await client.post("/api/auth/register", json=payload)
    second = await client.post("/api/auth/register", json=payload)

    assert first.status_code == 201
    assert second.status_code == 400


async def test_login_wrong_password_fails(client):
    await client.post(
        "/api/auth/register",
        json={"email": "wrong@example.com", "password": "correct-password", "full_name": "Test User"},
    )

    resp = await client.post(
        "/api/auth/login",
        data={"username": "wrong@example.com", "password": "incorrect-password"},
    )
    assert resp.status_code == 401


async def test_me_without_token_is_unauthorized(client):
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401


async def test_health_check(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
