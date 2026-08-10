from sqlalchemy import select

from app.models.simulation import Simulation, SimulationModule
from app.models.user import User, UserRole


async def _register_and_login(client, email, full_name="Test Student"):
    await client.post(
        "/api/auth/register",
        json={"email": email, "password": "supersecret123", "full_name": full_name},
    )
    login_resp = await client.post(
        "/api/auth/login",
        data={"username": email, "password": "supersecret123"},
    )
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _promote_to_teacher(db_session, email):
    result = await db_session.execute(select(User).where(User.email == email))
    user = result.scalar_one()
    user.role = UserRole.TEACHER
    await db_session.commit()


async def _seed_simulation(db_session, module: SimulationModule, title: str) -> Simulation:
    simulation = Simulation(
        title=title,
        module=module,
        subject="Физика" if module == SimulationModule.ELECTRICITY_LAB else "Химия",
        config={"expected_steps": ["mix_reagents"]},
        difficulty=1,
    )
    db_session.add(simulation)
    await db_session.commit()
    await db_session.refresh(simulation)
    return simulation


async def _teacher_headers(client, db_session, email="teacher@example.com"):
    headers = await _register_and_login(client, email, full_name="Teacher")
    await _promote_to_teacher(db_session, email)
    return headers


async def test_teacher_endpoints_require_teacher_role(client, db_session):
    student_headers = await _register_and_login(client, "student@example.com")
    for path in [
        "/api/teacher/students-overview",
        "/api/teacher/recent-results",
        "/api/teacher/module-breakdown",
    ]:
        response = await client.get(path, headers=student_headers)
        assert response.status_code == 403


async def test_students_overview_reports_real_level_xp_and_needs_attention(client, db_session):
    healthy_headers = await _register_and_login(client, "healthy@example.com", "Healthy Student")
    await client.post(
        "/api/progress/task-event",
        json={
            "simulation_id": "sim-placeholder",
            "task_id": "task-1-close-loop",
            "difficulty": "easy",
            "xp_reward": 10,
            "completed": True,
            "hints_used": 0,
            "attempts": 1,
            "mistakes": [],
        },
        headers=healthy_headers,
    )

    struggling_headers = await _register_and_login(client, "struggling@example.com", "Struggling Student")
    await client.post(
        "/api/progress/task-event",
        json={
            "simulation_id": "sim-placeholder",
            "task_id": "task-2-ammeter-series",
            "difficulty": "medium",
            "xp_reward": 15,
            "completed": True,
            "hints_used": 3,
            "attempts": 5,
            "mistakes": [{"code": "ammeter_parallel"}, {"code": "ammeter_parallel"}],
        },
        headers=struggling_headers,
    )

    await _register_and_login(client, "no-activity@example.com", "No Activity Student")

    teacher_headers = await _teacher_headers(client, db_session)
    response = await client.get("/api/teacher/students-overview", headers=teacher_headers)
    assert response.status_code == 200
    by_email = {row["email"]: row for row in response.json()}

    assert by_email["healthy@example.com"]["xp"] == 10
    assert by_email["healthy@example.com"]["accuracy"] == 100.0
    assert by_email["healthy@example.com"]["needs_attention"] is False

    assert by_email["struggling@example.com"]["weak_topics"] == ["Амперметр"]
    assert by_email["struggling@example.com"]["needs_attention"] is True

    # ученик без единого завершенного задания не может быть "нуждающимся
    # во внимании" — недостаточно данных, а не 0% успеваемости
    assert by_email["no-activity@example.com"]["needs_attention"] is False
    assert by_email["no-activity@example.com"]["accuracy"] == 0.0


async def test_student_detail_returns_404_for_unknown_student(client, db_session):
    teacher_headers = await _teacher_headers(client, db_session)
    response = await client.get("/api/teacher/student/does-not-exist", headers=teacher_headers)
    assert response.status_code == 404


async def test_student_detail_includes_module_breakdown(client, db_session):
    simulation = await _seed_simulation(client and db_session, SimulationModule.ELECTRICITY_LAB, "Собери цепь")
    student_headers = await _register_and_login(client, "detail-student@example.com", "Detail Student")
    complete_resp = await client.post(
        f"/api/simulations/{simulation.id}/complete",
        json={"actions_log": [{"action_type": "connect_circuit"}], "duration_seconds": 42},
        headers=student_headers,
    )
    assert complete_resp.status_code == 201

    student_id_resp = await client.get("/api/auth/me", headers=student_headers)
    student_id = student_id_resp.json()["id"]

    teacher_headers = await _teacher_headers(client, db_session)
    response = await client.get(f"/api/teacher/student/{student_id}", headers=teacher_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "detail-student@example.com"
    assert body["module_breakdown"] == [
        {"module": "electricity_lab", "average_score": body["module_breakdown"][0]["average_score"], "completed_count": 1}
    ]


async def test_recent_results_and_module_breakdown_omit_modules_without_data(client, db_session):
    electricity_sim = await _seed_simulation(client and db_session, SimulationModule.ELECTRICITY_LAB, "Собери цепь")
    student_headers = await _register_and_login(client, "recent-student@example.com", "Recent Student")
    await client.post(
        f"/api/simulations/{electricity_sim.id}/complete",
        json={"actions_log": [{"action_type": "connect_circuit"}], "duration_seconds": 20},
        headers=student_headers,
    )

    teacher_headers = await _teacher_headers(client, db_session)

    recent_response = await client.get("/api/teacher/recent-results", headers=teacher_headers)
    assert recent_response.status_code == 200
    recent = recent_response.json()
    assert len(recent) == 1
    assert recent[0]["student_name"] == "Recent Student"
    assert recent[0]["module"] == "electricity_lab"
    assert recent[0]["simulation_title"] == "Собери цепь"

    breakdown_response = await client.get("/api/teacher/module-breakdown", headers=teacher_headers)
    assert breakdown_response.status_code == 200
    breakdown = breakdown_response.json()
    modules_present = {row["module"] for row in breakdown}
    # geo3d/chemistry_world/simlab have zero LabResults in this test — must
    # be omitted, never fabricated with a fake 0/None row
    assert modules_present == {"electricity_lab"}
