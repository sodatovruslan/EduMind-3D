import asyncio
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from app.models.call import Call
from app.models.classroom import ClassMembership, Classroom
from app.models.user import User, UserRole
from app.services.call_service import CALL_RING_TIMEOUT_SECONDS


async def _graceful_close(sock, settle_iterations: int = 25) -> None:
    """See test_messaging.py's own copy of this helper for the full
    explanation — Starlette TestClient races a client-initiated close
    against forcibly cancelling the server task driving the WS handler;
    closing explicitly and settling here avoids that race instead of
    relying on disconnect-time DB writes to survive being cancelled
    mid-statement (a TestClient-only concern, not a production one)."""
    sock.close()
    for _ in range(settle_iterations):
        await asyncio.sleep(0.02)


async def _register(client, db, email: str, role: UserRole, name: str):
    password = "supersecret123"
    response = await client.post("/api/auth/register", json={"email": email, "password": password, "full_name": name})
    assert response.status_code == 201
    user = (await db.execute(select(User).where(User.email == email))).scalar_one()
    user.role = role
    await db.commit()
    login = await client.post("/api/auth/login", data={"username": email, "password": password})
    token = login.json()["access_token"]
    return user, {"Authorization": f"Bearer {token}"}, token


async def _world(client, db):
    """Teacher A owns a class with Student A as an active member. Teacher B
    and Student B exist but share no classroom with Teacher A / Student A."""
    teacher_a, a, a_tok = await _register(client, db, "call-teacher-a@example.com", UserRole.TEACHER, "Teacher A")
    teacher_b, b, b_tok = await _register(client, db, "call-teacher-b@example.com", UserRole.TEACHER, "Teacher B")
    student_a, sa, sa_tok = await _register(client, db, "call-student-a@example.com", UserRole.STUDENT, "Student A")
    student_b, sb, sb_tok = await _register(client, db, "call-student-b@example.com", UserRole.STUDENT, "Student B")
    admin, admin_h, admin_tok = await _register(client, db, "call-admin@example.com", UserRole.ADMIN, "Admin")

    classroom = Classroom(teacher_id=teacher_a.id, name="Class A")
    db.add(classroom)
    await db.flush()
    db.add(ClassMembership(class_id=classroom.id, student_id=student_a.id))
    await db.commit()

    return {
        "teacher_a": (teacher_a, a, a_tok),
        "teacher_b": (teacher_b, b, b_tok),
        "student_a": (student_a, sa, sa_tok),
        "student_b": (student_b, sb, sb_tok),
        "admin": (admin, admin_h, admin_tok),
        "classroom": classroom,
    }


async def _open_conversation(client, headers, counterpart_id: str) -> str:
    response = await client.post("/api/conversations", headers=headers, json={"counterpart_id": counterpart_id})
    assert response.status_code == 201, response.text
    return response.json()["id"]


# ---------------------------------------------------------------------------
# Authorization / security
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_student_can_call_own_teacher(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, _, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)

    response = await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "video"})
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "ringing"
    assert body["call_type"] == "video"
    assert body["caller"]["id"] == w["student_a"][0].id
    assert body["callee"]["id"] == teacher_a.id


@pytest.mark.asyncio
async def test_teacher_can_call_own_student(client, db_session):
    w = await _world(client, db_session)
    teacher_a, a_headers, _ = w["teacher_a"]
    student_a, _, _ = w["student_a"]
    conversation_id = await _open_conversation(client, a_headers, student_a.id)

    response = await client.post("/api/calls", headers=a_headers, json={"conversation_id": conversation_id, "call_type": "audio"})
    assert response.status_code == 201, response.text
    assert response.json()["caller"]["id"] == teacher_a.id


@pytest.mark.asyncio
async def test_call_denied_without_shared_classroom(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_b, b_headers, _ = w["teacher_b"]

    # No conversation exists (and can't — no shared classroom), so a call
    # attempt against a made-up conversation id, or teacher_b's own
    # unrelated conversation, must 404 rather than ever create a call.
    fake_conversation_id = "00000000-0000-0000-0000-000000000000"
    response = await client.post(
        "/api/calls", headers=sa_headers, json={"conversation_id": fake_conversation_id, "call_type": "audio"}
    )
    assert response.status_code == 404

    student_b, sb_headers, _ = w["student_b"]
    other_classroom = Classroom(teacher_id=teacher_b.id, name="Class B")
    db_session.add(other_classroom)
    await db_session.flush()
    db_session.add(ClassMembership(class_id=other_classroom.id, student_id=student_b.id))
    await db_session.commit()
    unrelated_conversation_id = await _open_conversation(client, sb_headers, teacher_b.id)
    response2 = await client.post(
        "/api/calls", headers=sa_headers, json={"conversation_id": unrelated_conversation_id, "call_type": "audio"}
    )
    assert response2.status_code == 404


@pytest.mark.asyncio
async def test_call_denied_after_removed_membership(client, db_session):
    w = await _world(client, db_session)
    student_a, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)

    membership = (
        await db_session.execute(select(ClassMembership).where(ClassMembership.student_id == student_a.id))
    ).scalar_one()
    membership.removed_at = datetime.utcnow()
    await db_session.commit()

    response = await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "audio"})
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_admin_cannot_inspect_or_join_unrelated_call(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    _, admin_headers, _ = w["admin"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    call = (
        await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "audio"})
    ).json()

    assert (await client.get(f"/api/calls/{call['id']}", headers=admin_headers)).status_code == 404
    assert (await client.post(f"/api/calls/{call['id']}/accept", headers=admin_headers)).status_code == 404
    assert (await client.post(f"/api/calls/{call['id']}/end", headers=admin_headers)).status_code == 404


@pytest.mark.asyncio
async def test_random_user_cannot_inspect_accept_or_end_call(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, _, _ = w["teacher_a"]
    _, b_headers, _ = w["teacher_b"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    call = (
        await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "audio"})
    ).json()

    assert (await client.get(f"/api/calls/{call['id']}", headers=b_headers)).status_code == 404
    assert (await client.post(f"/api/calls/{call['id']}/accept", headers=b_headers)).status_code == 404
    assert (await client.post(f"/api/calls/{call['id']}/decline", headers=b_headers)).status_code == 404
    assert (await client.post(f"/api/calls/{call['id']}/cancel", headers=b_headers)).status_code == 404
    assert (await client.post(f"/api/calls/{call['id']}/end", headers=b_headers)).status_code == 404


@pytest.mark.asyncio
async def test_client_cannot_spoof_caller_id(client, db_session):
    w = await _world(client, db_session)
    student_a, sa_headers, _ = w["student_a"]
    teacher_a, _, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)

    response = await client.post(
        "/api/calls",
        headers=sa_headers,
        json={"conversation_id": conversation_id, "call_type": "audio", "caller_id": teacher_a.id},
    )
    assert response.status_code == 201
    # caller is ALWAYS the authenticated user — the extra caller_id field
    # in the request body is silently ignored, never trusted.
    assert response.json()["caller"]["id"] == student_a.id


# ---------------------------------------------------------------------------
# Call lifecycle / state machine
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_full_accept_lifecycle(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    call = (
        await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "video"})
    ).json()

    accepted = await client.post(f"/api/calls/{call['id']}/accept", headers=a_headers)
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "accepted"
    assert accepted.json()["answered_at"] is not None

    ended = await client.post(f"/api/calls/{call['id']}/end", headers=sa_headers)
    assert ended.status_code == 200
    assert ended.json()["status"] == "ended"
    assert ended.json()["ended_at"] is not None


@pytest.mark.asyncio
async def test_decline_lifecycle(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    call = (
        await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "audio"})
    ).json()

    declined = await client.post(f"/api/calls/{call['id']}/decline", headers=a_headers)
    assert declined.status_code == 200
    assert declined.json()["status"] == "declined"
    assert declined.json()["ended_at"] is not None


@pytest.mark.asyncio
async def test_cancel_lifecycle(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, _, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    call = (
        await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "audio"})
    ).json()

    cancelled = await client.post(f"/api/calls/{call['id']}/cancel", headers=sa_headers)
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"


@pytest.mark.asyncio
async def test_only_callee_can_accept_or_decline(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, _, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    call = (
        await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "audio"})
    ).json()

    # the CALLER trying to accept/decline their own outgoing call is invalid
    assert (await client.post(f"/api/calls/{call['id']}/accept", headers=sa_headers)).status_code == 409
    assert (await client.post(f"/api/calls/{call['id']}/decline", headers=sa_headers)).status_code == 409


@pytest.mark.asyncio
async def test_only_caller_can_cancel(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    call = (
        await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "audio"})
    ).json()

    assert (await client.post(f"/api/calls/{call['id']}/cancel", headers=a_headers)).status_code == 409


@pytest.mark.asyncio
async def test_either_party_can_end_an_accepted_call(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    call = (
        await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "audio"})
    ).json()
    await client.post(f"/api/calls/{call['id']}/accept", headers=a_headers)

    ended = await client.post(f"/api/calls/{call['id']}/end", headers=a_headers)
    assert ended.status_code == 200
    assert ended.json()["status"] == "ended"


async def _new_call(client, sa_headers, teacher_a_id):
    conversation_id = await _open_conversation(client, sa_headers, teacher_a_id)
    call = (
        await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "audio"})
    ).json()
    return call


@pytest.mark.asyncio
async def test_declined_call_cannot_be_accepted_or_declined_again(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    call = await _new_call(client, sa_headers, teacher_a.id)
    await client.post(f"/api/calls/{call['id']}/decline", headers=a_headers)

    assert (await client.post(f"/api/calls/{call['id']}/accept", headers=a_headers)).status_code == 409
    assert (await client.post(f"/api/calls/{call['id']}/decline", headers=a_headers)).status_code == 409


@pytest.mark.asyncio
async def test_cancelled_call_cannot_be_accepted(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    call = await _new_call(client, sa_headers, teacher_a.id)
    await client.post(f"/api/calls/{call['id']}/cancel", headers=sa_headers)

    assert (await client.post(f"/api/calls/{call['id']}/accept", headers=a_headers)).status_code == 409


@pytest.mark.asyncio
async def test_ended_call_cannot_be_accepted_or_cancelled(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    call = await _new_call(client, sa_headers, teacher_a.id)
    await client.post(f"/api/calls/{call['id']}/accept", headers=a_headers)
    await client.post(f"/api/calls/{call['id']}/end", headers=a_headers)

    assert (await client.post(f"/api/calls/{call['id']}/accept", headers=a_headers)).status_code == 409
    assert (await client.post(f"/api/calls/{call['id']}/cancel", headers=sa_headers)).status_code == 409


@pytest.mark.asyncio
async def test_ringing_cannot_be_ended_directly(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    call = (
        await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "audio"})
    ).json()

    # "End" is only valid from ACCEPTED — a still-ringing call must be
    # cancelled (by the caller) or declined (by the callee), not "ended".
    assert (await client.post(f"/api/calls/{call['id']}/end", headers=sa_headers)).status_code == 409
    assert (await client.post(f"/api/calls/{call['id']}/end", headers=a_headers)).status_code == 409


# ---------------------------------------------------------------------------
# Busy / race conditions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_double_start_call_by_same_caller_is_idempotent(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, _, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)

    first = await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "audio"})
    second = await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "audio"})
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] == second.json()["id"]

    rows = (await db_session.execute(select(Call).where(Call.conversation_id == conversation_id))).scalars().all()
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_busy_when_callee_already_ringing_from_the_other_side(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)

    await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "audio"})
    # Simultaneous-call scenario (brief §14): the SAME conversation,
    # teacher tries to call back while the student's call is still
    # ringing — must NOT create a second CallSession.
    reverse = await client.post("/api/calls", headers=a_headers, json={"conversation_id": conversation_id, "call_type": "audio"})
    assert reverse.status_code == 409
    assert reverse.json()["detail"] == "busy"

    rows = (await db_session.execute(select(Call).where(Call.conversation_id == conversation_id))).scalars().all()
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_busy_when_callee_has_active_call_in_another_conversation(client, db_session):
    w = await _world(client, db_session)
    student_a, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "audio"})

    # teacher_a now has an active ringing call (in conversation_id above).
    # A second, unrelated student in a shared classroom with teacher_a
    # tries to call them too — must be told busy, even though it's a
    # DIFFERENT conversation.
    other_student, other_headers, _ = await _register(client, db_session, "call-student-c@example.com", UserRole.STUDENT, "Student C")
    db_session.add(ClassMembership(class_id=w["classroom"].id, student_id=other_student.id))
    await db_session.commit()
    other_conversation_id = await _open_conversation(client, other_headers, teacher_a.id)

    response = await client.post(
        "/api/calls", headers=other_headers, json={"conversation_id": other_conversation_id, "call_type": "audio"}
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "busy"


@pytest.mark.asyncio
async def test_accept_twice_is_rejected_not_silently_duplicated(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    call = (
        await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "audio"})
    ).json()

    first = await client.post(f"/api/calls/{call['id']}/accept", headers=a_headers)
    second = await client.post(f"/api/calls/{call['id']}/accept", headers=a_headers)
    assert first.status_code == 200
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_end_twice_is_rejected(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    call = (
        await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "audio"})
    ).json()
    await client.post(f"/api/calls/{call['id']}/accept", headers=a_headers)

    first = await client.post(f"/api/calls/{call['id']}/end", headers=sa_headers)
    second = await client.post(f"/api/calls/{call['id']}/end", headers=a_headers)
    assert first.status_code == 200
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_after_call_ends_a_new_call_can_be_started(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    first = (
        await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "audio"})
    ).json()
    await client.post(f"/api/calls/{first['id']}/cancel", headers=sa_headers)

    second = await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "video"})
    assert second.status_code == 201
    assert second.json()["id"] != first["id"]


# ---------------------------------------------------------------------------
# Timeout / missed
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ringing_call_becomes_missed_after_timeout(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    call = (
        await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "audio"})
    ).json()

    row = (await db_session.execute(select(Call).where(Call.id == call["id"]))).scalar_one()
    row.created_at = datetime.utcnow() - timedelta(seconds=CALL_RING_TIMEOUT_SECONDS + 5)
    await db_session.commit()

    fetched = await client.get(f"/api/calls/{call['id']}", headers=sa_headers)
    assert fetched.status_code == 200
    assert fetched.json()["status"] == "missed"
    assert fetched.json()["ended_at"] is not None

    # No active call remains for the conversation once it's timed out.
    current = await client.get(f"/api/conversations/{conversation_id}/call", headers=sa_headers)
    assert current.status_code == 404


@pytest.mark.asyncio
async def test_missed_call_cannot_then_be_accepted(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    call = (
        await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "audio"})
    ).json()

    row = (await db_session.execute(select(Call).where(Call.id == call["id"]))).scalar_one()
    row.created_at = datetime.utcnow() - timedelta(seconds=CALL_RING_TIMEOUT_SECONDS + 5)
    await db_session.commit()

    # The callee tries to accept a call that has actually already timed
    # out server-side — reconciliation happens first, then the accept
    # attempt correctly fails against the now-MISSED status.
    response = await client.post(f"/api/calls/{call['id']}/accept", headers=a_headers)
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_missed_call_after_timeout_frees_the_conversation_for_a_new_call(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    call = (
        await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "audio"})
    ).json()

    row = (await db_session.execute(select(Call).where(Call.id == call["id"]))).scalar_one()
    row.created_at = datetime.utcnow() - timedelta(seconds=CALL_RING_TIMEOUT_SECONDS + 5)
    await db_session.commit()

    retry = await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "audio"})
    assert retry.status_code == 201
    assert retry.json()["id"] != call["id"]
    assert retry.json()["status"] == "ringing"


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_call_history_reflects_real_records_in_order(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)

    first = (
        await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "audio"})
    ).json()
    await client.post(f"/api/calls/{first['id']}/decline", headers=a_headers)

    second = (
        await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "video"})
    ).json()
    await client.post(f"/api/calls/{second['id']}/accept", headers=a_headers)
    await client.post(f"/api/calls/{second['id']}/end", headers=sa_headers)

    history = await client.get(f"/api/conversations/{conversation_id}/calls", headers=a_headers)
    assert history.status_code == 200
    statuses = [c["status"] for c in history.json()]
    assert statuses == ["declined", "ended"]


@pytest.mark.asyncio
async def test_call_history_denied_for_unrelated_user(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, _, _ = w["teacher_a"]
    _, b_headers, _ = w["teacher_b"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)

    assert (await client.get(f"/api/conversations/{conversation_id}/calls", headers=b_headers)).status_code == 404


# ---------------------------------------------------------------------------
# Realtime signaling
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_incoming_call_reaches_callee_over_websocket(client, db_session):
    from fastapi.testclient import TestClient
    from app.main import app

    w = await _world(client, db_session)
    _, sa_headers, sa_token = w["student_a"]
    teacher_a, _, a_token = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)

    ws_client = TestClient(app)
    with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={a_token}") as teacher_socket:
        started = await client.post(
            "/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "video"}
        )
        assert started.status_code == 201
        event = teacher_socket.receive_json()
        assert event["type"] == "call:ringing"
        assert event["call"]["id"] == started.json()["id"]
        assert event["call"]["callee"]["id"] == teacher_a.id
        await _graceful_close(teacher_socket)


@pytest.mark.asyncio
async def test_call_reaches_recipient_even_on_a_different_conversations_socket(client, db_session):
    """A user's call events should reach ANY of their open sockets, not
    only one connected to the exact conversation the call belongs to —
    see ws_manager.PresenceManager.broadcast_to_user's own docstring for
    why (a call is more urgent than a single conversation's typing
    indicator)."""
    from fastapi.testclient import TestClient
    from app.main import app

    w = await _world(client, db_session)
    student_a, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, a_token = w["teacher_a"]
    student_b, sb_headers, _ = w["student_b"]
    db_session.add(ClassMembership(class_id=w["classroom"].id, student_id=student_b.id))
    await db_session.commit()

    conversation_ab = await _open_conversation(client, sa_headers, teacher_a.id)
    other_conversation = await _open_conversation(client, sb_headers, teacher_a.id)

    ws_client = TestClient(app)
    # Teacher A has a socket open on a DIFFERENT conversation (with
    # student_b), not the one student_a is about to call about.
    with ws_client.websocket_connect(f"/ws/conversations/{other_conversation}?token={a_token}") as teacher_socket:
        started = await client.post(
            "/api/calls", headers=sa_headers, json={"conversation_id": conversation_ab, "call_type": "audio"}
        )
        assert started.status_code == 201
        event = teacher_socket.receive_json()
        assert event["type"] == "call:ringing"
        assert event["call"]["conversation_id"] == conversation_ab
        await _graceful_close(teacher_socket)


@pytest.mark.asyncio
async def test_accept_and_end_broadcast_to_both_parties(client, db_session):
    from fastapi.testclient import TestClient
    from app.main import app

    w = await _world(client, db_session)
    _, sa_headers, sa_token = w["student_a"]
    teacher_a, a_headers, a_token = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)

    ws_client = TestClient(app)
    with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={sa_token}") as student_socket:
        with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={a_token}") as teacher_socket:
            # The teacher's own connect fires a presence:update to the
            # student's socket first — drain it before looking at call events.
            presence_event = student_socket.receive_json()
            assert presence_event["type"] == "presence:update"

            started = await client.post(
                "/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "audio"}
            )
            call_id = started.json()["id"]
            # both sockets see the initial ringing broadcast
            student_socket.receive_json()
            teacher_socket.receive_json()

            await client.post(f"/api/calls/{call_id}/accept", headers=a_headers)
            student_accepted = student_socket.receive_json()
            teacher_accepted = teacher_socket.receive_json()
            assert student_accepted["type"] == "call:accepted"
            assert teacher_accepted["type"] == "call:accepted"

            await client.post(f"/api/calls/{call_id}/end", headers=sa_headers)
            student_ended = student_socket.receive_json()
            teacher_ended = teacher_socket.receive_json()
            assert student_ended["type"] == "call:ended"
            assert teacher_ended["type"] == "call:ended"

            await _graceful_close(teacher_socket)
        await _graceful_close(student_socket)
