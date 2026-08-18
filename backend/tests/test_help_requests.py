import pytest
from sqlalchemy import select

from app.models.classroom import ClassMembership, Classroom
from app.models.help_request import HelpRequest
from app.models.user import User, UserRole


async def _register(client, db, email: str, role: UserRole, name: str):
    password = "supersecret123"
    response = await client.post("/api/auth/register", json={"email": email, "password": password, "full_name": name})
    assert response.status_code == 201
    user = (await db.execute(select(User).where(User.email == email))).scalar_one()
    user.role = role
    await db.commit()
    login = await client.post("/api/auth/login", data={"username": email, "password": password})
    token = login.json()["access_token"]
    return user, {"Authorization": f"Bearer {token}"}


async def _world(client, db):
    """Teacher A owns a class with Student A as an active member. Teacher B
    and Student B exist but share no classroom with Teacher A / Student A."""
    teacher_a, a = await _register(client, db, "help-teacher-a@example.com", UserRole.TEACHER, "Teacher A")
    teacher_b, b = await _register(client, db, "help-teacher-b@example.com", UserRole.TEACHER, "Teacher B")
    student_a, sa = await _register(client, db, "help-student-a@example.com", UserRole.STUDENT, "Student A")
    student_b, sb = await _register(client, db, "help-student-b@example.com", UserRole.STUDENT, "Student B")
    admin, admin_h = await _register(client, db, "help-admin@example.com", UserRole.ADMIN, "Admin")

    classroom = Classroom(teacher_id=teacher_a.id, name="Class A")
    db.add(classroom)
    await db.flush()
    membership = ClassMembership(class_id=classroom.id, student_id=student_a.id)
    db.add(membership)
    await db.commit()

    return {
        "teacher_a": (teacher_a, a),
        "teacher_b": (teacher_b, b),
        "student_a": (student_a, sa),
        "student_b": (student_b, sb),
        "admin": (admin, admin_h),
        "classroom": classroom,
        "membership": membership,
    }


async def _open_conversation(client, headers, counterpart_id: str) -> str:
    response = await client.post("/api/conversations", headers=headers, json={"counterpart_id": counterpart_id})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _electricity_context(**overrides) -> dict:
    payload = {
        "world": "electricity",
        "context_version": 1,
        "simulation_id": "sim-electricity-1",
        "experiment_id": "ohms-law",
        "task_id": "ohms-law-task-1",
        "task_title": "Ohm's Law",
        "current_step": "Measure current",
        "progress": 40,
        "selected_object": "resistor (resistor-220)",
        "safety_state": "normal",
        "measurements": {"voltage_v": "9", "current_a": "0"},
        "extra": {"multimeter_mode": "current"},
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# Authorization (brief §49)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_student_can_request_help_from_own_teacher(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers = w["student_a"]
    teacher_a, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)

    response = await client.post(
        "/api/help-requests",
        headers=sa_headers,
        json={"conversation_id": conversation_id, "context": _electricity_context(), "student_message": "Лампа не горит"},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "pending"
    assert body["world"] == "electricity"
    assert body["student"]["id"] == w["student_a"][0].id
    assert body["teacher"]["id"] == teacher_a.id
    assert body["student_message"] == "Лампа не горит"


@pytest.mark.asyncio
async def test_student_cannot_request_help_from_unrelated_teacher(client, db_session):
    w = await _world(client, db_session)
    _, sb_headers = w["student_b"]
    teacher_a, _ = w["teacher_a"]

    # student_b has no classroom with teacher_a, so opening a conversation
    # itself must already fail — there's no way to even reach the
    # help-request endpoint with a conversation_id in that scenario.
    response = await client.post("/api/conversations", headers=sb_headers, json={"counterpart_id": teacher_a.id})
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_teacher_can_read_own_students_help_request(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers = w["student_a"]
    teacher_a, a_headers = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    create = await client.post(
        "/api/help-requests", headers=sa_headers, json={"conversation_id": conversation_id, "context": _electricity_context()}
    )
    help_request_id = create.json()["id"]

    response = await client.get(f"/api/help-requests/{help_request_id}", headers=a_headers)
    assert response.status_code == 200
    assert response.json()["id"] == help_request_id


@pytest.mark.asyncio
async def test_teacher_cannot_read_unrelated_help_request(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers = w["student_a"]
    teacher_a, _ = w["teacher_a"]
    _, b_headers = w["teacher_b"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    create = await client.post(
        "/api/help-requests", headers=sa_headers, json={"conversation_id": conversation_id, "context": _electricity_context()}
    )
    help_request_id = create.json()["id"]

    response = await client.get(f"/api/help-requests/{help_request_id}", headers=b_headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_admin_is_not_automatically_a_participant(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers = w["student_a"]
    teacher_a, _ = w["teacher_a"]
    _, admin_headers = w["admin"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    create = await client.post(
        "/api/help-requests", headers=sa_headers, json={"conversation_id": conversation_id, "context": _electricity_context()}
    )
    help_request_id = create.json()["id"]

    response = await client.get(f"/api/help-requests/{help_request_id}", headers=admin_headers)
    assert response.status_code == 404
    # And admin cannot list "their own" requests either — they have none.
    listing = await client.get("/api/help-requests", headers=admin_headers)
    assert listing.status_code == 200
    assert listing.json() == []


@pytest.mark.asyncio
async def test_only_students_can_create_help_requests(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers = w["student_a"]
    teacher_a, a_headers = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)

    response = await client.post(
        "/api/help-requests", headers=a_headers, json={"conversation_id": conversation_id, "context": _electricity_context()}
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_removed_membership_denies_new_requests(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers = w["student_a"]
    teacher_a, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)

    from datetime import datetime

    w["membership"].removed_at = datetime.utcnow()
    await db_session.commit()

    response = await client.post(
        "/api/help-requests", headers=sa_headers, json={"conversation_id": conversation_id, "context": _electricity_context()}
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_removed_membership_reconciles_an_existing_pending_request_to_cancelled(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers = w["student_a"]
    teacher_a, a_headers = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    create = await client.post(
        "/api/help-requests", headers=sa_headers, json={"conversation_id": conversation_id, "context": _electricity_context()}
    )
    help_request_id = create.json()["id"]

    from datetime import datetime

    w["membership"].removed_at = datetime.utcnow()
    await db_session.commit()

    # The teacher's own access to the now-orphaned request lazily
    # reconciles it — same pattern as reconcile_timeout for calls — rather
    # than granting a live PENDING/ACCEPTED action against a relationship
    # that no longer exists.
    response = await client.get(f"/api/help-requests/{help_request_id}", headers=a_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"


# ---------------------------------------------------------------------------
# State machine (brief §50)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pending_to_accepted_by_teacher(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers = w["student_a"]
    teacher_a, a_headers = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    create = await client.post(
        "/api/help-requests", headers=sa_headers, json={"conversation_id": conversation_id, "context": _electricity_context()}
    )
    help_request_id = create.json()["id"]

    response = await client.post(f"/api/help-requests/{help_request_id}/accept", headers=a_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "accepted"
    assert body["accepted_at"] is not None


@pytest.mark.asyncio
async def test_pending_to_declined_by_teacher(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers = w["student_a"]
    teacher_a, a_headers = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    create = await client.post(
        "/api/help-requests", headers=sa_headers, json={"conversation_id": conversation_id, "context": _electricity_context()}
    )
    help_request_id = create.json()["id"]

    response = await client.post(f"/api/help-requests/{help_request_id}/decline", headers=a_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "declined"


@pytest.mark.asyncio
async def test_pending_to_cancelled_by_student(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers = w["student_a"]
    teacher_a, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    create = await client.post(
        "/api/help-requests", headers=sa_headers, json={"conversation_id": conversation_id, "context": _electricity_context()}
    )
    help_request_id = create.json()["id"]

    response = await client.post(f"/api/help-requests/{help_request_id}/cancel", headers=sa_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"


@pytest.mark.asyncio
async def test_accepted_to_resolved_by_either_party(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers = w["student_a"]
    teacher_a, a_headers = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    create = await client.post(
        "/api/help-requests", headers=sa_headers, json={"conversation_id": conversation_id, "context": _electricity_context()}
    )
    help_request_id = create.json()["id"]
    await client.post(f"/api/help-requests/{help_request_id}/accept", headers=a_headers)

    # Student resolves — allowed, not just the teacher.
    response = await client.post(f"/api/help-requests/{help_request_id}/resolve", headers=sa_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "resolved"
    assert body["resolved_at"] is not None


@pytest.mark.asyncio
async def test_student_cannot_accept_own_request(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers = w["student_a"]
    teacher_a, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    create = await client.post(
        "/api/help-requests", headers=sa_headers, json={"conversation_id": conversation_id, "context": _electricity_context()}
    )
    help_request_id = create.json()["id"]

    response = await client.post(f"/api/help-requests/{help_request_id}/accept", headers=sa_headers)
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_teacher_cannot_cancel_a_request(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers = w["student_a"]
    teacher_a, a_headers = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    create = await client.post(
        "/api/help-requests", headers=sa_headers, json={"conversation_id": conversation_id, "context": _electricity_context()}
    )
    help_request_id = create.json()["id"]

    response = await client.post(f"/api/help-requests/{help_request_id}/cancel", headers=a_headers)
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_cannot_resolve_a_still_pending_request(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers = w["student_a"]
    teacher_a, a_headers = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    create = await client.post(
        "/api/help-requests", headers=sa_headers, json={"conversation_id": conversation_id, "context": _electricity_context()}
    )
    help_request_id = create.json()["id"]

    response = await client.post(f"/api/help-requests/{help_request_id}/resolve", headers=a_headers)
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_cannot_accept_an_already_declined_request(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers = w["student_a"]
    teacher_a, a_headers = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    create = await client.post(
        "/api/help-requests", headers=sa_headers, json={"conversation_id": conversation_id, "context": _electricity_context()}
    )
    help_request_id = create.json()["id"]
    await client.post(f"/api/help-requests/{help_request_id}/decline", headers=a_headers)

    response = await client.post(f"/api/help-requests/{help_request_id}/accept", headers=a_headers)
    assert response.status_code == 409


# ---------------------------------------------------------------------------
# Context validation (brief §51)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_context_snapshot_stores_correct_semantic_ids(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers = w["student_a"]
    teacher_a, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)

    response = await client.post(
        "/api/help-requests",
        headers=sa_headers,
        json={"conversation_id": conversation_id, "context": _electricity_context(experiment_id="ohms-law", selected_object="resistor (resistor-220)")},
    )
    assert response.status_code == 201, response.text
    snapshot = response.json()["context_snapshot"]
    assert snapshot["experiment_id"] == "ohms-law"
    assert snapshot["selected_object"] == "resistor (resistor-220)"
    assert snapshot["context_version"] == 1
    # No raw renderer objects, no huge graph — just the whitelisted fields.
    assert set(snapshot.keys()) <= {
        "world",
        "context_version",
        "simulation_id",
        "experiment_id",
        "task_id",
        "task_title",
        "current_step",
        "progress",
        "selected_object",
        "safety_state",
        "measurements",
        "extra",
    }


@pytest.mark.asyncio
async def test_unknown_context_fields_are_ignored_not_rejected(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers = w["student_a"]
    teacher_a, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)

    context = _electricity_context()
    context["threeScene"] = {"children": ["huge raw renderer tree"]}
    context["meshUuid"] = "abc-123-not-educational"

    response = await client.post("/api/help-requests", headers=sa_headers, json={"conversation_id": conversation_id, "context": context})
    assert response.status_code == 201, response.text
    snapshot = response.json()["context_snapshot"]
    assert "threeScene" not in snapshot
    assert "meshUuid" not in snapshot


@pytest.mark.asyncio
async def test_oversized_measurements_bag_is_rejected(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers = w["student_a"]
    teacher_a, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)

    context = _electricity_context(measurements={f"key_{i}": "value" for i in range(50)})
    response = await client.post("/api/help-requests", headers=sa_headers, json={"conversation_id": conversation_id, "context": context})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_oversized_measurement_value_is_rejected(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers = w["student_a"]
    teacher_a, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)

    context = _electricity_context(measurements={"note": "x" * 1000})
    response = await client.post("/api/help-requests", headers=sa_headers, json={"conversation_id": conversation_id, "context": context})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_invalid_world_is_rejected(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers = w["student_a"]
    teacher_a, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)

    context = _electricity_context(world="not-a-real-world")
    response = await client.post("/api/help-requests", headers=sa_headers, json={"conversation_id": conversation_id, "context": context})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_oversized_student_message_is_rejected(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers = w["student_a"]
    teacher_a, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)

    response = await client.post(
        "/api/help-requests",
        headers=sa_headers,
        json={"conversation_id": conversation_id, "context": _electricity_context(), "student_message": "x" * 5000},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_chemistry_and_geo_contexts_are_accepted(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers = w["student_a"]
    teacher_a, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)

    chemistry_context = {
        "world": "chemistry",
        "context_version": 1,
        "experiment_id": "acid-base-titration",
        "task_title": "Acid-Base Titration",
        "safety_state": "warning",
        "measurements": {"temperature_c": "24"},
    }
    response = await client.post("/api/help-requests", headers=sa_headers, json={"conversation_id": conversation_id, "context": chemistry_context})
    assert response.status_code == 201, response.text
    assert response.json()["world"] == "chemistry"

    # Different world -> different dedup key, so a SEPARATE active request
    # is allowed even though student_a/teacher_a already has one open
    # from the electricity test above.
    geo_context = {
        "world": "geo",
        "context_version": 1,
        "task_title": "Earth Structure",
        "selected_object": "earth-layer: mantle",
        "extra": {"active_layers": "tectonics,volcanoes"},
    }
    response = await client.post("/api/help-requests", headers=sa_headers, json={"conversation_id": conversation_id, "context": geo_context})
    assert response.status_code == 201, response.text
    assert response.json()["world"] == "geo"


# ---------------------------------------------------------------------------
# Duplicate / dedup (brief §23/§52)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_repeated_ask_teacher_does_not_create_a_duplicate_pending_request(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers = w["student_a"]
    teacher_a, _ = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)

    first = await client.post("/api/help-requests", headers=sa_headers, json={"conversation_id": conversation_id, "context": _electricity_context()})
    second = await client.post("/api/help-requests", headers=sa_headers, json={"conversation_id": conversation_id, "context": _electricity_context()})
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] == second.json()["id"]

    count = (
        await db_session.execute(select(HelpRequest).where(HelpRequest.conversation_id == conversation_id))
    ).scalars().all()
    assert len(count) == 1


@pytest.mark.asyncio
async def test_a_new_request_can_be_created_after_the_previous_one_resolves(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers = w["student_a"]
    teacher_a, a_headers = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)

    first = await client.post("/api/help-requests", headers=sa_headers, json={"conversation_id": conversation_id, "context": _electricity_context()})
    first_id = first.json()["id"]
    await client.post(f"/api/help-requests/{first_id}/decline", headers=a_headers)

    second = await client.post("/api/help-requests", headers=sa_headers, json={"conversation_id": conversation_id, "context": _electricity_context()})
    assert second.status_code == 201
    assert second.json()["id"] != first_id


# ---------------------------------------------------------------------------
# Call linking + conversation history (brief §18/§22)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_teacher_can_start_and_link_an_existing_call_flow(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers = w["student_a"]
    teacher_a, a_headers = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    create = await client.post(
        "/api/help-requests", headers=sa_headers, json={"conversation_id": conversation_id, "context": _electricity_context()}
    )
    help_request_id = create.json()["id"]
    await client.post(f"/api/help-requests/{help_request_id}/accept", headers=a_headers)

    call = await client.post("/api/calls", headers=a_headers, json={"conversation_id": conversation_id, "call_type": "audio"})
    assert call.status_code == 201
    call_id = call.json()["id"]

    link = await client.post(f"/api/help-requests/{help_request_id}/link-call", headers=a_headers, json={"call_id": call_id})
    assert link.status_code == 200
    assert link.json()["call_id"] == call_id


@pytest.mark.asyncio
async def test_conversation_help_request_history_is_visible_to_both_parties(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers = w["student_a"]
    teacher_a, a_headers = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    await client.post("/api/help-requests", headers=sa_headers, json={"conversation_id": conversation_id, "context": _electricity_context()})

    student_view = await client.get(f"/api/conversations/{conversation_id}/help-requests", headers=sa_headers)
    teacher_view = await client.get(f"/api/conversations/{conversation_id}/help-requests", headers=a_headers)
    assert student_view.status_code == 200
    assert teacher_view.status_code == 200
    assert len(student_view.json()) == 1
    assert len(teacher_view.json()) == 1


@pytest.mark.asyncio
async def test_teacher_dashboard_listing_shows_pending_requests(client, db_session):
    w = await _world(client, db_session)
    _, sa_headers = w["student_a"]
    teacher_a, a_headers = w["teacher_a"]
    conversation_id = await _open_conversation(client, sa_headers, teacher_a.id)
    await client.post("/api/help-requests", headers=sa_headers, json={"conversation_id": conversation_id, "context": _electricity_context()})

    response = await client.get("/api/help-requests", headers=a_headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["status"] == "pending"
