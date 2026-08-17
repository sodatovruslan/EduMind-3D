import asyncio

import pytest
from sqlalchemy import select

from app.models.classroom import ClassMembership, Classroom
from app.models.user import User, UserRole


async def _graceful_close(sock, settle_iterations: int = 25) -> None:
    """See test_messaging.py's own copy for the full explanation —
    Starlette TestClient races a client-initiated close against forcibly
    cancelling the server task driving the WS handler; closing explicitly
    and settling here avoids that race (a TestClient-only concern)."""
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
    teacher_a, a, a_tok = await _register(client, db, "sig-teacher-a@example.com", UserRole.TEACHER, "Teacher A")
    teacher_b, b, b_tok = await _register(client, db, "sig-teacher-b@example.com", UserRole.TEACHER, "Teacher B")
    student_a, sa, sa_tok = await _register(client, db, "sig-student-a@example.com", UserRole.STUDENT, "Student A")
    admin, admin_h, admin_tok = await _register(client, db, "sig-admin@example.com", UserRole.ADMIN, "Admin")

    classroom = Classroom(teacher_id=teacher_a.id, name="Class A")
    db.add(classroom)
    await db.flush()
    db.add(ClassMembership(class_id=classroom.id, student_id=student_a.id))
    await db.commit()

    return {
        "teacher_a": (teacher_a, a, a_tok),
        "teacher_b": (teacher_b, b, b_tok),
        "student_a": (student_a, sa, sa_tok),
        "admin": (admin, admin_h, admin_tok),
    }


async def _accepted_call(client, sa_headers, a_headers, teacher_a_id):
    conv = await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a_id})
    conversation_id = conv.json()["id"]
    call = (
        await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "video"})
    ).json()
    await client.post(f"/api/calls/{call['id']}/accept", headers=a_headers)
    return call["id"], conversation_id


@pytest.mark.asyncio
async def test_offer_and_answer_relay_between_accepted_call_participants(client, db_session):
    from fastapi.testclient import TestClient
    from app.main import app

    w = await _world(client, db_session)
    _, sa_headers, sa_token = w["student_a"]
    teacher_a, a_headers, a_token = w["teacher_a"]
    call_id, conversation_id = await _accepted_call(client, sa_headers, a_headers, teacher_a.id)

    ws_client = TestClient(app)
    with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={sa_token}") as student_socket:
        with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={a_token}") as teacher_socket:
            # The teacher's own connect fires a presence:update to
            # student_socket first — drain it before looking for signaling.
            student_socket.receive_json()

            student_socket.send_json({"type": "webrtc:offer", "call_id": call_id, "sdp": "v=0\r\no=- fake sdp offer"})
            offer_event = teacher_socket.receive_json()
            assert offer_event["type"] == "webrtc:offer"
            assert offer_event["call_id"] == call_id
            assert offer_event["user_id"] == w["student_a"][0].id
            assert offer_event["sdp"] == "v=0\r\no=- fake sdp offer"

            teacher_socket.send_json({"type": "webrtc:answer", "call_id": call_id, "sdp": "v=0\r\no=- fake sdp answer"})
            answer_event = student_socket.receive_json()
            assert answer_event["type"] == "webrtc:answer"
            assert answer_event["user_id"] == teacher_a.id

            await _graceful_close(teacher_socket)
        await _graceful_close(student_socket)


@pytest.mark.asyncio
async def test_ice_candidate_relay_allowed_for_participants(client, db_session):
    from fastapi.testclient import TestClient
    from app.main import app

    w = await _world(client, db_session)
    _, sa_headers, sa_token = w["student_a"]
    teacher_a, a_headers, a_token = w["teacher_a"]
    call_id, conversation_id = await _accepted_call(client, sa_headers, a_headers, teacher_a.id)

    ws_client = TestClient(app)
    with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={sa_token}") as student_socket:
        with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={a_token}") as teacher_socket:
            candidate = {"candidate": "candidate:1 1 UDP 2122252543 10.0.0.1 54321 typ host", "sdpMid": "0", "sdpMLineIndex": 0}
            student_socket.send_json({"type": "webrtc:ice-candidate", "call_id": call_id, "candidate": candidate})
            event = teacher_socket.receive_json()
            assert event["type"] == "webrtc:ice-candidate"
            assert event["candidate"] == candidate
            assert event["user_id"] == w["student_a"][0].id

            await _graceful_close(teacher_socket)
        await _graceful_close(student_socket)


@pytest.mark.asyncio
async def test_media_state_relay_reflects_authenticated_sender(client, db_session):
    from fastapi.testclient import TestClient
    from app.main import app

    w = await _world(client, db_session)
    _, sa_headers, sa_token = w["student_a"]
    teacher_a, a_headers, a_token = w["teacher_a"]
    call_id, conversation_id = await _accepted_call(client, sa_headers, a_headers, teacher_a.id)

    ws_client = TestClient(app)
    with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={sa_token}") as student_socket:
        with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={a_token}") as teacher_socket:
            student_socket.receive_json()  # drain the teacher's connect presence:update
            teacher_socket.send_json(
                {"type": "media:state", "call_id": call_id, "audio_muted": True, "video_disabled": False, "user_id": "spoofed"}
            )
            event = student_socket.receive_json()
            assert event["type"] == "media:state"
            assert event["user_id"] == teacher_a.id  # never the spoofed value
            assert event["audio_muted"] is True
            assert event["video_disabled"] is False

            await _graceful_close(teacher_socket)
        await _graceful_close(student_socket)


@pytest.mark.asyncio
async def test_authenticated_user_cannot_relay_signaling_for_someone_elses_call(client, db_session):
    """teacher_b is a real, authenticated, legitimately-connected user —
    just not a participant of student_a/teacher_a's call. Proves the
    call_id-scoped participant check, not just the conversation-connect
    check (which a genuinely unrelated user would fail even earlier)."""
    from fastapi.testclient import TestClient
    from app.main import app

    w = await _world(client, db_session)
    _, sa_headers, sa_token = w["student_a"]
    teacher_a, a_headers, a_token = w["teacher_a"]
    teacher_b, b_headers, b_token = w["teacher_b"]
    call_id, conversation_id = await _accepted_call(client, sa_headers, a_headers, teacher_a.id)

    # Give teacher_b their own legitimate, unrelated, ACCEPTED call so
    # they have a real, authorized socket connected somewhere in the system.
    other_student, other_headers, _ = await _register(client, db_session, "sig-student-c@example.com", UserRole.STUDENT, "Student C")
    other_classroom = Classroom(teacher_id=teacher_b.id, name="Class B")
    db_session.add(other_classroom)
    await db_session.flush()
    db_session.add(ClassMembership(class_id=other_classroom.id, student_id=other_student.id))
    await db_session.commit()
    _, other_conversation_id = await _accepted_call(client, other_headers, b_headers, teacher_b.id)

    ws_client = TestClient(app)
    with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={sa_token}") as student_socket:
        with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={a_token}") as teacher_a_socket:
            with ws_client.websocket_connect(f"/ws/conversations/{other_conversation_id}?token={b_token}") as teacher_b_socket:
                # teacher_b tries to inject signaling into student_a /
                # teacher_a's call using ITS call_id — must be dropped.
                teacher_b_socket.send_json({"type": "webrtc:offer", "call_id": call_id, "sdp": "v=0\r\nintruder offer"})
                await _graceful_close(teacher_b_socket)

            # Prove teacher_a's socket only ever sees the REAL offer, never
            # the intruder's — send the legitimate one now and check it's
            # the only thing delivered.
            student_socket.send_json({"type": "webrtc:offer", "call_id": call_id, "sdp": "v=0\r\nreal offer"})
            event = teacher_a_socket.receive_json()
            assert event["sdp"] == "v=0\r\nreal offer"

            await _graceful_close(teacher_a_socket)
        await _graceful_close(student_socket)


@pytest.mark.asyncio
async def test_signaling_denied_for_call_still_ringing(client, db_session):
    from fastapi.testclient import TestClient
    from app.main import app

    w = await _world(client, db_session)
    _, sa_headers, sa_token = w["student_a"]
    teacher_a, a_headers, a_token = w["teacher_a"]
    conv = await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})
    conversation_id = conv.json()["id"]
    call = (
        await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "audio"})
    ).json()
    # deliberately NOT accepted — still ringing

    ws_client = TestClient(app)
    with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={sa_token}") as student_socket:
        with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={a_token}") as teacher_socket:
            # Both sockets connect AFTER the REST call already happened, so
            # there's no queued call:ringing broadcast to drain here — it
            # was sent (and went nowhere) at POST /api/calls time, before
            # either socket existed.
            student_socket.send_json({"type": "webrtc:offer", "call_id": call["id"], "sdp": "v=0\r\ntoo early"})
            # Nothing should arrive — send a harmless typing event right
            # after to get a receive_json() call to synchronize against
            # without hanging forever on an event that will never come.
            student_socket.send_json({"type": "typing:start"})
            event = teacher_socket.receive_json()
            assert event["type"] == "typing:start"  # NOT the offer — it was dropped

            await _graceful_close(teacher_socket)
        await _graceful_close(student_socket)


@pytest.mark.asyncio
async def test_signaling_denied_after_call_ends(client, db_session):
    from fastapi.testclient import TestClient
    from app.main import app

    w = await _world(client, db_session)
    _, sa_headers, sa_token = w["student_a"]
    teacher_a, a_headers, a_token = w["teacher_a"]
    call_id, conversation_id = await _accepted_call(client, sa_headers, a_headers, teacher_a.id)
    await client.post(f"/api/calls/{call_id}/end", headers=sa_headers)

    ws_client = TestClient(app)
    with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={sa_token}") as student_socket:
        with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={a_token}") as teacher_socket:
            student_socket.send_json({"type": "webrtc:offer", "call_id": call_id, "sdp": "v=0\r\ntoo late"})
            student_socket.send_json({"type": "typing:start"})
            event = teacher_socket.receive_json()
            assert event["type"] == "typing:start"

            await _graceful_close(teacher_socket)
        await _graceful_close(student_socket)


@pytest.mark.asyncio
async def test_oversized_sdp_is_rejected(client, db_session):
    from fastapi.testclient import TestClient
    from app.main import app

    w = await _world(client, db_session)
    _, sa_headers, sa_token = w["student_a"]
    teacher_a, a_headers, a_token = w["teacher_a"]
    call_id, conversation_id = await _accepted_call(client, sa_headers, a_headers, teacher_a.id)

    ws_client = TestClient(app)
    with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={sa_token}") as student_socket:
        with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={a_token}") as teacher_socket:
            student_socket.send_json({"type": "webrtc:offer", "call_id": call_id, "sdp": "x" * 30_000})
            student_socket.send_json({"type": "typing:start"})
            event = teacher_socket.receive_json()
            assert event["type"] == "typing:start"

            await _graceful_close(teacher_socket)
        await _graceful_close(student_socket)


@pytest.mark.asyncio
async def test_oversized_ice_candidate_is_rejected(client, db_session):
    from fastapi.testclient import TestClient
    from app.main import app

    w = await _world(client, db_session)
    _, sa_headers, sa_token = w["student_a"]
    teacher_a, a_headers, a_token = w["teacher_a"]
    call_id, conversation_id = await _accepted_call(client, sa_headers, a_headers, teacher_a.id)

    ws_client = TestClient(app)
    with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={sa_token}") as student_socket:
        with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={a_token}") as teacher_socket:
            student_socket.send_json(
                {"type": "webrtc:ice-candidate", "call_id": call_id, "candidate": {"candidate": "x" * 5000}}
            )
            student_socket.send_json({"type": "typing:start"})
            event = teacher_socket.receive_json()
            assert event["type"] == "typing:start"

            await _graceful_close(teacher_socket)
        await _graceful_close(student_socket)


@pytest.mark.asyncio
async def test_malformed_signaling_payload_is_ignored(client, db_session):
    from fastapi.testclient import TestClient
    from app.main import app

    w = await _world(client, db_session)
    _, sa_headers, sa_token = w["student_a"]
    teacher_a, a_headers, a_token = w["teacher_a"]
    call_id, conversation_id = await _accepted_call(client, sa_headers, a_headers, teacher_a.id)

    ws_client = TestClient(app)
    with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={sa_token}") as student_socket:
        with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={a_token}") as teacher_socket:
            # missing call_id entirely
            student_socket.send_json({"type": "webrtc:offer", "sdp": "v=0"})
            # call_id present but wrong type
            student_socket.send_json({"type": "webrtc:offer", "call_id": 12345, "sdp": "v=0"})
            # sdp missing
            student_socket.send_json({"type": "webrtc:offer", "call_id": call_id})
            student_socket.send_json({"type": "typing:start"})
            event = teacher_socket.receive_json()
            assert event["type"] == "typing:start"

            await _graceful_close(teacher_socket)
        await _graceful_close(student_socket)


@pytest.mark.asyncio
async def test_screen_share_started_and_stopped_relay_between_accepted_call_participants(client, db_session):
    """T9 — same relay path as webrtc:offer/answer, no new access-control
    primitive: screen-share:started/stopped just need to reach the OTHER
    participant of an ACCEPTED call, with no extra fields beyond call_id."""
    from fastapi.testclient import TestClient
    from app.main import app

    w = await _world(client, db_session)
    _, sa_headers, sa_token = w["student_a"]
    teacher_a, a_headers, a_token = w["teacher_a"]
    call_id, conversation_id = await _accepted_call(client, sa_headers, a_headers, teacher_a.id)

    ws_client = TestClient(app)
    with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={sa_token}") as student_socket:
        with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={a_token}") as teacher_socket:
            student_socket.receive_json()  # drain the teacher's connect presence:update

            student_socket.send_json({"type": "screen-share:started", "call_id": call_id})
            started_event = teacher_socket.receive_json()
            assert started_event["type"] == "screen-share:started"
            assert started_event["call_id"] == call_id
            assert started_event["user_id"] == w["student_a"][0].id

            student_socket.send_json({"type": "screen-share:stopped", "call_id": call_id})
            stopped_event = teacher_socket.receive_json()
            assert stopped_event["type"] == "screen-share:stopped"
            assert stopped_event["user_id"] == w["student_a"][0].id

            await _graceful_close(teacher_socket)
        await _graceful_close(student_socket)


@pytest.mark.asyncio
async def test_screen_share_relay_uses_authenticated_sender_never_a_spoofed_one(client, db_session):
    from fastapi.testclient import TestClient
    from app.main import app

    w = await _world(client, db_session)
    _, sa_headers, sa_token = w["student_a"]
    teacher_a, a_headers, a_token = w["teacher_a"]
    call_id, conversation_id = await _accepted_call(client, sa_headers, a_headers, teacher_a.id)

    ws_client = TestClient(app)
    with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={sa_token}") as student_socket:
        with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={a_token}") as teacher_socket:
            student_socket.receive_json()
            teacher_socket.send_json({"type": "screen-share:started", "call_id": call_id, "user_id": "spoofed-someone-else"})
            event = student_socket.receive_json()
            assert event["user_id"] == teacher_a.id  # never the spoofed value

            await _graceful_close(teacher_socket)
        await _graceful_close(student_socket)


@pytest.mark.asyncio
async def test_screen_share_denied_for_unrelated_user(client, db_session):
    from fastapi.testclient import TestClient
    from app.main import app

    w = await _world(client, db_session)
    _, sa_headers, sa_token = w["student_a"]
    teacher_a, a_headers, a_token = w["teacher_a"]
    teacher_b, b_headers, b_token = w["teacher_b"]
    call_id, conversation_id = await _accepted_call(client, sa_headers, a_headers, teacher_a.id)

    other_student, other_headers, _ = await _register(client, db_session, "sig-student-d@example.com", UserRole.STUDENT, "Student D")
    other_classroom = Classroom(teacher_id=teacher_b.id, name="Class C")
    db_session.add(other_classroom)
    await db_session.flush()
    db_session.add(ClassMembership(class_id=other_classroom.id, student_id=other_student.id))
    await db_session.commit()
    _, other_conversation_id = await _accepted_call(client, other_headers, b_headers, teacher_b.id)

    ws_client = TestClient(app)
    with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={sa_token}") as student_socket:
        with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={a_token}") as teacher_a_socket:
            with ws_client.websocket_connect(f"/ws/conversations/{other_conversation_id}?token={b_token}") as teacher_b_socket:
                teacher_b_socket.send_json({"type": "screen-share:started", "call_id": call_id})
                await _graceful_close(teacher_b_socket)

            student_socket.send_json({"type": "typing:start"})
            event = teacher_a_socket.receive_json()
            assert event["type"] == "typing:start"  # the intruder's screen-share:started never arrived

            await _graceful_close(teacher_a_socket)
        await _graceful_close(student_socket)


@pytest.mark.asyncio
async def test_screen_share_denied_for_call_still_ringing(client, db_session):
    from fastapi.testclient import TestClient
    from app.main import app

    w = await _world(client, db_session)
    _, sa_headers, sa_token = w["student_a"]
    teacher_a, a_headers, a_token = w["teacher_a"]
    conv = await client.post("/api/conversations", headers=sa_headers, json={"counterpart_id": teacher_a.id})
    conversation_id = conv.json()["id"]
    call = (
        await client.post("/api/calls", headers=sa_headers, json={"conversation_id": conversation_id, "call_type": "audio"})
    ).json()
    # deliberately NOT accepted — still ringing

    ws_client = TestClient(app)
    with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={sa_token}") as student_socket:
        with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={a_token}") as teacher_socket:
            student_socket.send_json({"type": "screen-share:started", "call_id": call["id"]})
            student_socket.send_json({"type": "typing:start"})
            event = teacher_socket.receive_json()
            assert event["type"] == "typing:start"

            await _graceful_close(teacher_socket)
        await _graceful_close(student_socket)


@pytest.mark.asyncio
async def test_screen_share_denied_after_call_ends(client, db_session):
    from fastapi.testclient import TestClient
    from app.main import app

    w = await _world(client, db_session)
    _, sa_headers, sa_token = w["student_a"]
    teacher_a, a_headers, a_token = w["teacher_a"]
    call_id, conversation_id = await _accepted_call(client, sa_headers, a_headers, teacher_a.id)
    await client.post(f"/api/calls/{call_id}/end", headers=sa_headers)

    ws_client = TestClient(app)
    with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={sa_token}") as student_socket:
        with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={a_token}") as teacher_socket:
            student_socket.send_json({"type": "screen-share:started", "call_id": call_id})
            student_socket.send_json({"type": "typing:start"})
            event = teacher_socket.receive_json()
            assert event["type"] == "typing:start"

            await _graceful_close(teacher_socket)
        await _graceful_close(student_socket)


@pytest.mark.asyncio
async def test_screen_share_malformed_payload_is_ignored(client, db_session):
    from fastapi.testclient import TestClient
    from app.main import app

    w = await _world(client, db_session)
    _, sa_headers, sa_token = w["student_a"]
    teacher_a, a_headers, a_token = w["teacher_a"]
    call_id, conversation_id = await _accepted_call(client, sa_headers, a_headers, teacher_a.id)

    ws_client = TestClient(app)
    with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={sa_token}") as student_socket:
        with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={a_token}") as teacher_socket:
            # missing call_id entirely
            student_socket.send_json({"type": "screen-share:started"})
            # call_id present but wrong type
            student_socket.send_json({"type": "screen-share:started", "call_id": 12345})
            student_socket.send_json({"type": "typing:start"})
            event = teacher_socket.receive_json()
            assert event["type"] == "typing:start"

            await _graceful_close(teacher_socket)
        await _graceful_close(student_socket)


@pytest.mark.asyncio
async def test_admin_cannot_relay_signaling_for_a_call_they_are_not_part_of(client, db_session):
    from fastapi.testclient import TestClient
    from app.main import app

    w = await _world(client, db_session)
    _, sa_headers, sa_token = w["student_a"]
    teacher_a, a_headers, a_token = w["teacher_a"]
    _, admin_headers, admin_token = w["admin"]
    call_id, conversation_id = await _accepted_call(client, sa_headers, a_headers, teacher_a.id)

    ws_client = TestClient(app)
    # Admin has no conversation with anyone here at all, so they cannot
    # even open a socket on this conversation_id (same authorization as
    # every other WS connect) — confirming admin never reaches the
    # relay logic in the first place.
    with pytest.raises(Exception):
        with ws_client.websocket_connect(f"/ws/conversations/{conversation_id}?token={admin_token}"):
            pass
