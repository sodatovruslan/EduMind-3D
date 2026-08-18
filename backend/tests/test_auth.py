from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from app.config import settings
from app.models.user import User
from app.routers import auth as auth_router
from app.services.email_service import EmailDeliveryError

@pytest.fixture(autouse=True)
def capture_verification_email(monkeypatch):
    sent = {}
    async def fake_send(email, code):
        sent[email] = code
    monkeypatch.setattr(auth_router, "send_verification_email", fake_send)
    return sent

async def test_register_login_me_flow(client, capture_verification_email):
    register_resp = await client.post(
        "/api/auth/register",
        json={"email": "student@example.com", "password": "supersecret123", "full_name": "Ivan Petrov"},
    )
    assert register_resp.status_code == 201
    body = register_resp.json()
    assert body["email"] == "student@example.com"
    assert body["role"] == "student"
    assert body["email_verified"] is False
    assert "hashed_password" not in body  # пароль не должен утекать в ответ

    blocked = await client.post(
        "/api/auth/login",
        data={"username": "student@example.com", "password": "supersecret123"},
    )
    assert blocked.status_code == 403
    assert blocked.json()["detail"]["code"] == "EMAIL_NOT_VERIFIED"
    verify = await client.post("/api/auth/verify-email", json={"email": "student@example.com", "code": capture_verification_email["student@example.com"]})
    assert verify.status_code == 200
    login_resp = await client.post("/api/auth/login", data={"username": "student@example.com", "password": "supersecret123"})
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

async def test_email_is_case_insensitive(client):
    payload = {"email": "User@Example.com", "password": "supersecret123", "full_name": "User"}
    assert (await client.post("/api/auth/register", json=payload)).status_code == 201
    assert (await client.post("/api/auth/register", json={**payload, "email": "user@example.com"})).status_code == 400

async def test_invalid_code_and_resend_invalidate_old_code(client, capture_verification_email):
    email = "verify@example.com"
    await client.post("/api/auth/register", json={"email": email, "password": "supersecret123", "full_name": "Verify"})
    assert (await client.post("/api/auth/verify-email", json={"email": email, "code": "999999"})).status_code == 400
    # cooldown is server-side; endpoint must reject immediate resend
    resend = await client.post("/api/auth/resend-verification", json={"email": email})
    assert resend.status_code == 429


async def test_resend_replaces_previous_code_after_cooldown(client, db_session, capture_verification_email):
    email = "resend@example.com"
    await client.post("/api/auth/register", json={"email": email, "password": "supersecret123", "full_name": "Resend"})
    old_code = capture_verification_email[email]
    user = (await db_session.execute(select(User).where(User.email == email))).scalar_one()
    user.email_verification_sent_at = datetime.utcnow() - timedelta(seconds=settings.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS + 1)
    await db_session.commit()

    response = await client.post("/api/auth/resend-verification", json={"email": email})
    assert response.status_code == 200
    new_code = capture_verification_email[email]
    assert (await client.post("/api/auth/verify-email", json={"email": email, "code": old_code})).status_code == 400
    assert (await client.post("/api/auth/verify-email", json={"email": email, "code": new_code})).status_code == 200


async def test_code_expiry_and_attempt_limit(client, db_session):
    email = "limits@example.com"
    await client.post("/api/auth/register", json={"email": email, "password": "supersecret123", "full_name": "Limits"})
    user = (await db_session.execute(select(User).where(User.email == email))).scalar_one()
    user.email_verification_expires_at = datetime.utcnow() - timedelta(seconds=1)
    await db_session.commit()
    expired = await client.post("/api/auth/verify-email", json={"email": email, "code": "123456"})
    assert expired.status_code == 400
    assert expired.json()["detail"]["code"] == "VERIFICATION_CODE_EXPIRED"

    attempts_email = "attempts@example.com"
    await client.post("/api/auth/register", json={"email": attempts_email, "password": "supersecret123", "full_name": "Attempts"})
    for _ in range(settings.EMAIL_VERIFICATION_MAX_ATTEMPTS - 1):
        invalid = await client.post("/api/auth/verify-email", json={"email": attempts_email, "code": "999999"})
        assert invalid.status_code == 400
    limited = await client.post("/api/auth/verify-email", json={"email": attempts_email, "code": "999999"})
    assert limited.status_code == 429
    assert limited.json()["detail"]["code"] == "VERIFICATION_ATTEMPTS_EXCEEDED"


async def test_registration_survives_email_delivery_failure(client, db_session, monkeypatch):
    async def fail_send(_email, _code):
        raise EmailDeliveryError("unavailable")

    monkeypatch.setattr(auth_router, "send_verification_email", fail_send)
    email = "delivery-failed@example.com"
    response = await client.post("/api/auth/register", json={"email": email, "password": "supersecret123", "full_name": "Delivery"})
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "VERIFICATION_EMAIL_FAILED"
    user = (await db_session.execute(select(User).where(User.email == email))).scalar_one()
    assert user.email_verified is False
    assert user.email_verification_code_hash is not None
    assert user.email_verification_sent_at is None


async def test_verification_code_is_hashed_and_preserves_leading_zero(client, db_session, capture_verification_email, monkeypatch):
    monkeypatch.setattr("app.services.auth_service.secrets.randbelow", lambda _limit: 421)
    email = "leading-zero@example.com"
    await client.post("/api/auth/register", json={"email": email, "password": "supersecret123", "full_name": "Zero"})
    assert capture_verification_email[email] == "000421"
    user = (await db_session.execute(select(User).where(User.email == email))).scalar_one()
    assert user.email_verification_code_hash != "000421"
    assert "000421" not in user.email_verification_code_hash


async def test_verify_is_idempotent_for_already_verified_user(client, capture_verification_email):
    email = "already-verified@example.com"
    await client.post("/api/auth/register", json={"email": email, "password": "supersecret123", "full_name": "Verified"})
    code = capture_verification_email[email]
    assert (await client.post("/api/auth/verify-email", json={"email": email, "code": code})).status_code == 200
    repeated = await client.post("/api/auth/verify-email", json={"email": email, "code": "000000"})
    assert repeated.status_code == 200
    assert repeated.json()["verified"] is True


async def test_resend_does_not_enumerate_unknown_email(client):
    response = await client.post("/api/auth/resend-verification", json={"email": "missing@example.com"})
    assert response.status_code == 200
    assert response.json()["message"] == "VERIFICATION_SENT"


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
