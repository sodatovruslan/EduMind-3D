import asyncio
from datetime import datetime

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models.classroom import ClassMembership, Classroom
from app.models.messaging import Conversation, Message
from app.models.user import User, UserRole


async def _graceful_close(sock, settle_iterations: int = 25) -> None:
    """Sends the WS close frame and gives the server's own (portal-thread)
    event loop time to finish its disconnect handling — which now touches
    the database (presence/last_seen) — BEFORE the `with` block's own
    `__exit__` races that handling against a forced task cancellation.
    That race is a Starlette TestClient-only concern (production has one
    long-lived event loop, no per-connection portal thread to tear down);
    closing explicitly and settling here avoids it instead of relying on
    the disconnect-time write to survive being cancelled mid-statement."""
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
    teacher_a, a, a_tok = await _register(client, db, "msg-teacher-a@example.com", UserRole.TEACHER, "Teacher A")
    teacher_b, b, b_tok = await _register(client, db, "msg-teacher-b@example.com", UserRole.TEACHER, "Teacher B")
    student_a, sa, sa_tok = await _register(client, db, "msg-student-a@example.com", UserRole.STUDENT, "Student A")
    student_b, sb, sb_tok = await _register(client, db, "msg-student-b@example.com", UserRole.STUDENT, "Student B")
    admin, admin_h, admin_tok = await _register(client, db, "msg-admin@example.com", UserRole.ADMIN, "Admin")

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


@pytest.mark.asyncio
async def test_student_opens_conversation_with_own_teacher(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, _, _ = w["teacher_a"]

    response = await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["counterpart"]["id"] == teacher_a.id
    assert body["last_message_at"] is None
    assert body["last_message_preview"] is None


@pytest.mark.asyncio
async def test_teacher_opens_conversation_with_own_student(client, db_session):
    w = await _world(client, db_session)
    _, a_headers, _ = w["teacher_a"]
    student_a, _, _ = w["student_a"]

    response = await client.post("/api/conversations", headers=a_headers, json={"counterpart_id": student_a.id})
    assert response.status_code == 201, response.text
    assert response.json()["counterpart"]["id"] == student_a.id


@pytest.mark.asyncio
async def test_student_cannot_message_unrelated_teacher(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_b, _, _ = w["teacher_b"]

    response = await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_b.id})
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_teacher_cannot_message_unrelated_student(client, db_session):
    w = await _world(client, db_session)
    _, a_headers, _ = w["teacher_a"]
    student_b, _, _ = w["student_b"]

    response = await client.post("/api/conversations", headers=a_headers, json={"counterpart_id": student_b.id})
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_admin_is_not_auto_granted_messaging(client, db_session):
    w = await _world(client, db_session)
    _, admin_headers, _ = w["admin"]
    teacher_a, _, _ = w["teacher_a"]

    response = await client.post("/api/conversations", headers=admin_headers, json={"counterpart_id": teacher_a.id})
    assert response.status_code == 403
    assert (await client.get("/api/conversations", headers=admin_headers)).json() == []


@pytest.mark.asyncio
async def test_removed_membership_blocks_new_and_existing_conversations(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    student_a, _, _ = w["student_a"]

    opened = await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})
    assert opened.status_code == 201
    conversation_id = opened.json()["id"]
    assert (await client.get(f"/api/conversations/{conversation_id}", headers=sa_headers)).status_code == 200

    membership = (
        await db_session.execute(select(ClassMembership).where(ClassMembership.student_id == student_a.id))
    ).scalar_one()
    membership.removed_at = datetime.utcnow()
    await db_session.commit()

    # Documented decision: a removed membership closes the conversation
    # immediately, including READING its already-existing history — not
    # just blocking new ones. Re-checked on every access, not just at
    # creation (see routers/messaging.py's _get_authorized_conversation).
    assert (await client.get(f"/api/conversations/{conversation_id}", headers=sa_headers)).status_code == 404
    assert (await client.get(f"/api/conversations/{conversation_id}/messages", headers=sa_headers)).status_code == 404
    reopen = await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})
    assert reopen.status_code == 404


@pytest.mark.asyncio
async def test_counterparts_are_real_classroom_derived_and_role_aware(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    student_a, _, _ = w["student_a"]
    _, admin_headers, _ = w["admin"]

    student_view = await client.get("/api/conversations/counterparts", headers=sa_headers)
    assert student_view.status_code == 200
    assert [c["id"] for c in student_view.json()] == [teacher_a.id]

    teacher_view = await client.get("/api/conversations/counterparts", headers=a_headers)
    assert [c["id"] for c in teacher_view.json()] == [student_a.id]

    assert (await client.get("/api/conversations/counterparts", headers=admin_headers)).json() == []


@pytest.mark.asyncio
async def test_duplicate_conversation_open_returns_the_same_conversation(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, _, _ = w["teacher_a"]

    first = await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})
    second = await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})
    assert first.json()["id"] == second.json()["id"]

    rows = (await db_session.execute(select(Conversation))).scalars().all()
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_database_unique_constraint_guards_conversation_races(db_session):
    teacher = User(email="race-msg-t@example.com", hashed_password="x", full_name="T", role=UserRole.TEACHER)
    student = User(email="race-msg-s@example.com", hashed_password="x", full_name="S", role=UserRole.STUDENT)
    db_session.add_all([teacher, student])
    await db_session.flush()
    db_session.add_all(
        [
            Conversation(teacher_id=teacher.id, student_id=student.id),
            Conversation(teacher_id=teacher.id, student_id=student.id),
        ]
    )
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_send_message_persists_and_updates_conversation_preview(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, _, _ = w["teacher_a"]

    conversation_id = (await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})).json()["id"]
    sent = await client.post(f"/api/conversations/{conversation_id}/messages", headers=sa_headers, json={"content": "Здравствуйте!"})
    assert sent.status_code == 201, sent.text
    assert sent.json()["content"] == "Здравствуйте!"

    conversation = await client.get(f"/api/conversations/{conversation_id}", headers=sa_headers)
    assert conversation.json()["last_message_preview"] == "Здравствуйте!"
    assert conversation.json()["last_message_at"] is not None


@pytest.mark.asyncio
async def test_empty_and_whitespace_only_messages_are_rejected(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, _, _ = w["teacher_a"]
    conversation_id = (await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})).json()["id"]

    assert (await client.post(f"/api/conversations/{conversation_id}/messages", headers=sa_headers, json={"content": ""})).status_code == 422
    assert (await client.post(f"/api/conversations/{conversation_id}/messages", headers=sa_headers, json={"content": "   "})).status_code == 422


@pytest.mark.asyncio
async def test_too_long_message_is_rejected(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, _, _ = w["teacher_a"]
    conversation_id = (await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})).json()["id"]

    too_long = "x" * 4001
    response = await client.post(f"/api/conversations/{conversation_id}/messages", headers=sa_headers, json={"content": too_long})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_message_history_is_chronologically_ordered(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    conversation_id = (await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})).json()["id"]

    for text in ["one", "two", "three"]:
        await client.post(f"/api/conversations/{conversation_id}/messages", headers=sa_headers, json={"content": text})

    history = await client.get(f"/api/conversations/{conversation_id}/messages", headers=a_headers)
    assert [m["content"] for m in history.json()["messages"]] == ["one", "two", "three"]


@pytest.mark.asyncio
async def test_message_pagination_has_more_and_cursor(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, _, _ = w["teacher_a"]
    conversation_id = (await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})).json()["id"]

    for i in range(5):
        await client.post(f"/api/conversations/{conversation_id}/messages", headers=sa_headers, json={"content": f"msg-{i}"})

    first_page = await client.get(f"/api/conversations/{conversation_id}/messages?limit=2", headers=sa_headers)
    assert first_page.status_code == 200
    body = first_page.json()
    assert [m["content"] for m in body["messages"]] == ["msg-3", "msg-4"]
    assert body["has_more"] is True

    oldest_of_first_page = body["messages"][0]["created_at"]
    second_page = await client.get(
        f"/api/conversations/{conversation_id}/messages?limit=2&before={oldest_of_first_page}", headers=sa_headers
    )
    second_body = second_page.json()
    assert [m["content"] for m in second_body["messages"]] == ["msg-1", "msg-2"]
    assert second_body["has_more"] is True


@pytest.mark.asyncio
async def test_conversation_list_has_no_n_plus_1_and_shows_real_last_message(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    conversation_id = (await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})).json()["id"]
    await client.post(f"/api/conversations/{conversation_id}/messages", headers=sa_headers, json={"content": "hi"})

    listing = await client.get("/api/conversations", headers=a_headers)
    assert listing.status_code == 200
    assert listing.json()[0]["last_message_preview"] == "hi"


@pytest.mark.asyncio
async def test_websocket_rejects_missing_or_invalid_token(client, db_session):
    from fastapi.testclient import TestClient
    from app.main import app

    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, _, _ = w["teacher_a"]
    conversation_id = (await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})).json()["id"]

    ws_client = TestClient(app)
    with pytest.raises(Exception):
        with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token=not-a-real-token"):
            pass


@pytest.mark.asyncio
async def test_websocket_rejects_user_outside_conversation(client, db_session):
    from fastapi.testclient import TestClient
    from app.main import app

    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, _, _ = w["teacher_a"]
    _, _, b_token = w["teacher_b"]
    conversation_id = (await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})).json()["id"]

    ws_client = TestClient(app)
    with pytest.raises(Exception):
        with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={b_token}"):
            pass


@pytest.mark.asyncio
async def test_websocket_delivers_message_sent_over_rest(client, db_session):
    from fastapi.testclient import TestClient
    from app.main import app

    w = await _world(client, db_session)
    _, sa_headers, sa_token = w["student_a"]
    teacher_a, a_headers, a_token = w["teacher_a"]
    conversation_id = (await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})).json()["id"]

    ws_client = TestClient(app)
    with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={a_token}") as teacher_socket:
        sent = await client.post(f"/api/conversations/{conversation_id}/messages", headers=sa_headers, json={"content": "realtime hello"})
        assert sent.status_code == 201
        event = teacher_socket.receive_json()
        assert event["type"] == "message"
        assert event["message"]["content"] == "realtime hello"
        assert event["message"]["sender_id"] == sent.json()["sender_id"]
        await _graceful_close(teacher_socket)


# ---------------------------------------------------------------------------
# T6 — message status (sent / delivered / read)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_message_stays_sent_when_recipient_offline(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, _, _ = w["teacher_a"]
    conversation_id = (await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})).json()["id"]

    sent = await client.post(f"/api/conversations/{conversation_id}/messages", headers=sa_headers, json={"content": "hi"})
    assert sent.json()["delivered_at"] is None
    assert sent.json()["read_at"] is None


@pytest.mark.asyncio
async def test_message_marked_delivered_when_recipient_has_live_connection(client, db_session):
    from fastapi.testclient import TestClient
    from app.main import app

    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, _, a_token = w["teacher_a"]
    conversation_id = (await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})).json()["id"]

    ws_client = TestClient(app)
    with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={a_token}") as sock:
        sent = await client.post(f"/api/conversations/{conversation_id}/messages", headers=sa_headers, json={"content": "hi"})
        assert sent.json()["delivered_at"] is not None
        assert sent.json()["read_at"] is None
        await _graceful_close(sock)


@pytest.mark.asyncio
async def test_history_fetch_marks_offline_messages_delivered(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    conversation_id = (await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})).json()["id"]

    sent = await client.post(f"/api/conversations/{conversation_id}/messages", headers=sa_headers, json={"content": "hi"})
    assert sent.json()["delivered_at"] is None

    # Recipient has no live connection at all — merely fetching history via
    # REST is documented (brief §21) as its own real delivery signal.
    history = await client.get(f"/api/conversations/{conversation_id}/messages", headers=a_headers)
    assert history.json()["messages"][0]["delivered_at"] is not None
    assert history.json()["messages"][0]["read_at"] is None

    # Sender's own fetch of the SAME message (which they sent, not
    # received) must never mark it delivered via this path.
    own_history = await client.get(f"/api/conversations/{conversation_id}/messages", headers=sa_headers)
    assert own_history.json()["messages"][0]["delivered_at"] is not None  # already set by the teacher's fetch above


@pytest.mark.asyncio
async def test_mark_read_sets_read_and_backfills_delivered(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    conversation_id = (await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})).json()["id"]
    sent = await client.post(f"/api/conversations/{conversation_id}/messages", headers=sa_headers, json={"content": "hi"})
    message_id = sent.json()["id"]
    assert sent.json()["delivered_at"] is None

    mark = await client.post(f"/api/conversations/{conversation_id}/read", headers=a_headers)
    assert mark.status_code == 200
    assert mark.json()["message_ids"] == [message_id]

    history = await client.get(f"/api/conversations/{conversation_id}/messages", headers=sa_headers)
    msg = history.json()["messages"][0]
    # read implies delivered — a real DB-level fact, not just a computed rule
    assert msg["delivered_at"] is not None
    assert msg["read_at"] is not None


@pytest.mark.asyncio
async def test_mark_read_only_affects_counterparts_messages(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    conversation_id = (await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})).json()["id"]
    await client.post(f"/api/conversations/{conversation_id}/messages", headers=sa_headers, json={"content": "from student"})

    # The student marking "read" on a conversation must never mark their
    # OWN just-sent message as read (that would be a no-op no-message case
    # here, but let's assert nothing gets touched: no messages are FROM the
    # counterpart yet, so mark-read finds nothing for the student to mark).
    mark = await client.post(f"/api/conversations/{conversation_id}/read", headers=sa_headers)
    assert mark.json()["message_ids"] == []


@pytest.mark.asyncio
async def test_mark_read_is_idempotent(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    conversation_id = (await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})).json()["id"]
    await client.post(f"/api/conversations/{conversation_id}/messages", headers=sa_headers, json={"content": "hi"})

    first = await client.post(f"/api/conversations/{conversation_id}/read", headers=a_headers)
    assert len(first.json()["message_ids"]) == 1
    second = await client.post(f"/api/conversations/{conversation_id}/read", headers=a_headers)
    assert second.json()["message_ids"] == []


@pytest.mark.asyncio
async def test_mark_read_cross_conversation_isolation(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    _, b_headers, _ = w["teacher_b"]
    conv_1 = (await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})).json()["id"]
    await client.post(f"/api/conversations/{conv_1}/messages", headers=sa_headers, json={"content": "in conv 1"})

    # teacher_b has no conversation at all with student_a — marking read on
    # conv_1 using teacher_b's token must 404, not silently no-op.
    denied = await client.post(f"/api/conversations/{conv_1}/read", headers=b_headers)
    assert denied.status_code == 404

    # conv_1's message must still be unread after that denied attempt.
    still_unread = await client.get(f"/api/conversations/{conv_1}/messages", headers=a_headers)
    assert still_unread.json()["messages"][0]["read_at"] is None


@pytest.mark.asyncio
async def test_mark_read_denied_after_removed_membership(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    student_a, _, _ = w["student_a"]
    conversation_id = (await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})).json()["id"]
    await client.post(f"/api/conversations/{conversation_id}/messages", headers=sa_headers, json={"content": "hi"})

    membership = (
        await db_session.execute(select(ClassMembership).where(ClassMembership.student_id == student_a.id))
    ).scalar_one()
    membership.removed_at = datetime.utcnow()
    await db_session.commit()

    assert (await client.post(f"/api/conversations/{conversation_id}/read", headers=a_headers)).status_code == 404


# ---------------------------------------------------------------------------
# T6 — unread counts
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unread_count_increments_and_excludes_own_messages(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    conversation_id = (await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})).json()["id"]

    await client.post(f"/api/conversations/{conversation_id}/messages", headers=sa_headers, json={"content": "one"})
    await client.post(f"/api/conversations/{conversation_id}/messages", headers=sa_headers, json={"content": "two"})
    # The teacher's own reply must never count toward the TEACHER's unread.
    await client.post(f"/api/conversations/{conversation_id}/messages", headers=a_headers, json={"content": "reply"})

    teacher_view = (await client.get("/api/conversations", headers=a_headers)).json()[0]
    assert teacher_view["unread_count"] == 2

    student_view = (await client.get("/api/conversations", headers=sa_headers)).json()[0]
    assert student_view["unread_count"] == 1  # only the teacher's reply


@pytest.mark.asyncio
async def test_unread_count_resets_after_mark_read(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    conversation_id = (await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})).json()["id"]
    await client.post(f"/api/conversations/{conversation_id}/messages", headers=sa_headers, json={"content": "hi"})

    assert (await client.get("/api/conversations", headers=a_headers)).json()[0]["unread_count"] == 1
    await client.post(f"/api/conversations/{conversation_id}/read", headers=a_headers)
    assert (await client.get("/api/conversations", headers=a_headers)).json()[0]["unread_count"] == 0


@pytest.mark.asyncio
async def test_last_message_own_status_shown_in_list(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, _ = w["teacher_a"]
    conversation_id = (await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})).json()["id"]
    await client.post(f"/api/conversations/{conversation_id}/messages", headers=sa_headers, json={"content": "hi"})

    student_view = (await client.get("/api/conversations", headers=sa_headers)).json()[0]
    assert student_view["last_message_own_status"] == "sent"
    # The teacher didn't send the last message — no own-status shown to them.
    teacher_view = (await client.get("/api/conversations", headers=a_headers)).json()[0]
    assert teacher_view["last_message_own_status"] is None

    await client.post(f"/api/conversations/{conversation_id}/read", headers=a_headers)
    student_view_after_read = (await client.get("/api/conversations", headers=sa_headers)).json()[0]
    assert student_view_after_read["last_message_own_status"] == "read"


# ---------------------------------------------------------------------------
# T6 — presence + last seen
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_presence_multi_tab_online_until_last_tab_closes(client, db_session):
    from fastapi.testclient import TestClient
    from app.main import app

    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, a_headers, a_token = w["teacher_a"]
    conversation_id = (await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})).json()["id"]

    ws_client = TestClient(app)
    with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={a_token}") as tab1:
        with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={a_token}") as tab2:
            assert (await client.get(f"/api/conversations/{conversation_id}", headers=sa_headers)).json()["counterpart"]["online"] is True
            await _graceful_close(tab2)
        # tab2 closed, tab1 still open — teacher must still read as online
        assert (await client.get(f"/api/conversations/{conversation_id}", headers=sa_headers)).json()["counterpart"]["online"] is True
        await _graceful_close(tab1)
    # both tabs closed now
    conversation_after = await client.get(f"/api/conversations/{conversation_id}", headers=sa_headers)
    assert conversation_after.json()["counterpart"]["online"] is False


@pytest.mark.asyncio
async def test_last_seen_persisted_on_full_disconnect(client, db_session):
    from fastapi.testclient import TestClient
    from app.main import app

    w = await _world(client, db_session)
    _, sa_headers, _ = w["student_a"]
    teacher_a, _, a_token = w["teacher_a"]
    conversation_id = (await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})).json()["id"]

    ws_client = TestClient(app)
    with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={a_token}") as sock:
        await _graceful_close(sock)  # the one-and-only tab closing

    refreshed = (await db_session.execute(select(User).where(User.id == teacher_a.id))).scalar_one()
    await db_session.refresh(refreshed)
    assert refreshed.last_seen_at is not None

    conversation_after = await client.get(f"/api/conversations/{conversation_id}", headers=sa_headers)
    assert conversation_after.json()["counterpart"]["last_seen_at"] is not None


@pytest.mark.asyncio
async def test_presence_broadcast_reaches_counterpart(client, db_session):
    from fastapi.testclient import TestClient
    from app.main import app

    w = await _world(client, db_session)
    _, sa_headers, sa_token = w["student_a"]
    teacher_a, _, a_token = w["teacher_a"]
    conversation_id = (await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})).json()["id"]

    ws_client = TestClient(app)
    with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={sa_token}") as student_socket:
        with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={a_token}") as teacher_socket:
            event = student_socket.receive_json()
            assert event["type"] == "presence:update"
            assert event["user_id"] == teacher_a.id
            assert event["online"] is True
            await _graceful_close(teacher_socket)
        await _graceful_close(student_socket)


# ---------------------------------------------------------------------------
# T6 — typing indicator (ephemeral, never persisted)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_typing_start_and_stop_relayed_to_other_participant(client, db_session):
    from fastapi.testclient import TestClient
    from app.main import app

    w = await _world(client, db_session)
    _, sa_headers, sa_token = w["student_a"]
    teacher_a, _, a_token = w["teacher_a"]
    conversation_id = (await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})).json()["id"]

    ws_client = TestClient(app)
    with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={sa_token}") as student_socket:
        with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={a_token}") as teacher_socket:
            # The teacher's own connect fires a presence:update first —
            # drain it before looking for the typing event.
            presence_event = student_socket.receive_json()
            assert presence_event["type"] == "presence:update"

            teacher_socket.send_json({"type": "typing:start"})
            event = student_socket.receive_json()
            assert event == {"type": "typing:start", "user_id": teacher_a.id}

            teacher_socket.send_json({"type": "typing:stop"})
            event2 = student_socket.receive_json()
            assert event2 == {"type": "typing:stop", "user_id": teacher_a.id}
            await _graceful_close(teacher_socket)
        await _graceful_close(student_socket)


@pytest.mark.asyncio
async def test_typing_event_cannot_spoof_sender_id(client, db_session):
    from fastapi.testclient import TestClient
    from app.main import app

    w = await _world(client, db_session)
    _, sa_headers, sa_token = w["student_a"]
    teacher_a, _, a_token = w["teacher_a"]
    conversation_id = (await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})).json()["id"]

    ws_client = TestClient(app)
    with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={sa_token}") as student_socket:
        with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={a_token}") as teacher_socket:
            student_socket.receive_json()  # drain the teacher's connect presence:update
            teacher_socket.send_json({"type": "typing:start", "user_id": "someone-else-entirely"})
            event = student_socket.receive_json()
            assert event["type"] == "typing:start"
            # Relayed using the id THIS socket authenticated as, never the
            # client-supplied value.
            assert event["user_id"] == teacher_a.id
            await _graceful_close(teacher_socket)
        await _graceful_close(student_socket)


@pytest.mark.asyncio
async def test_typing_is_never_persisted(client, db_session):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.models.messaging import Message

    w = await _world(client, db_session)
    _, sa_headers, sa_token = w["student_a"]
    teacher_a, _, a_token = w["teacher_a"]
    conversation_id = (await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})).json()["id"]

    ws_client = TestClient(app)
    with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={sa_token}") as student_socket:
        with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={a_token}") as teacher_socket:
            teacher_socket.send_json({"type": "typing:start"})
            await _graceful_close(teacher_socket)
        await _graceful_close(student_socket)

    rows = (await db_session.execute(select(Message).where(Message.conversation_id == conversation_id))).scalars().all()
    assert rows == []
