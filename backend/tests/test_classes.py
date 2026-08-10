import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.classroom_scope import accessible_student_ids, teacher_has_student_access
from app.models.classroom import ClassMembership, Classroom
from app.models.user import User, UserRole


async def _register(client, db, email: str, role: UserRole, name: str):
    password = "supersecret123"
    response = await client.post("/api/auth/register", json={"email": email, "password": password, "full_name": name})
    assert response.status_code == 201
    user = (await db.execute(select(User).where(User.email == email))).scalar_one()
    user.role = role
    await db.commit()
    login = await client.post("/api/auth/login", data={"username": email, "password": password})
    return user, {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _world(client, db):
    teacher_a, a = await _register(client, db, "class-teacher-a@example.com", UserRole.TEACHER, "Teacher A")
    teacher_b, b = await _register(client, db, "class-teacher-b@example.com", UserRole.TEACHER, "Teacher B")
    student_a, sa = await _register(client, db, "class-student-a@example.com", UserRole.STUDENT, "Student A")
    student_b, sb = await _register(client, db, "class-student-b@example.com", UserRole.STUDENT, "Student B")
    admin, admin_h = await _register(client, db, "class-admin@example.com", UserRole.ADMIN, "Admin")
    return teacher_a, a, teacher_b, b, student_a, sa, student_b, sb, admin, admin_h


async def _create(client, headers, name="Class A", **extra):
    response = await client.post("/api/classes", headers=headers, json={"name": name, **extra})
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
async def test_teacher_creates_and_only_lists_own_classrooms(client, db_session):
    ta, a, tb, b, *_ = await _world(client, db_session)
    class_a = await _create(client, a)
    class_b = await _create(client, b, "Class B")
    assert class_a["teacher_id"] == ta.id
    assert [c["id"] for c in (await client.get("/api/classes", headers=a)).json()] == [class_a["id"]]
    assert [c["id"] for c in (await client.get("/api/classes", headers=b)).json()] == [class_b["id"]]


@pytest.mark.asyncio
async def test_student_cannot_create_or_manage_classrooms(client, db_session):
    *_, student, student_h, admin, admin_h = await _world(client, db_session)
    assert (await client.post("/api/classes", headers=student_h, json={"name": "No"})).status_code == 403
    assert (await client.get("/api/classes", headers=student_h)).status_code == 403


@pytest.mark.asyncio
async def test_teacher_cannot_choose_another_owner(client, db_session):
    ta, a, tb, *_ = await _world(client, db_session)
    response = await client.post("/api/classes", headers=a, json={"name": "No", "teacher_id": tb.id})
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_owner_reads_updates_and_other_teacher_cannot_obtain_class(client, db_session):
    ta, a, tb, b, *_ = await _world(client, db_session)
    classroom = await _create(client, a)
    assert (await client.get(f"/api/classes/{classroom['id']}", headers=a)).status_code == 200
    assert (await client.get(f"/api/classes/{classroom['id']}", headers=b)).status_code == 404
    assert (await client.patch(f"/api/classes/{classroom['id']}", headers=b, json={"name": "Hijacked"})).status_code == 404
    renamed = await client.patch(f"/api/classes/{classroom['id']}", headers=a, json={"name": "Renamed"})
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Renamed"


@pytest.mark.asyncio
async def test_admin_has_global_access_but_must_assign_teacher_owner(client, db_session):
    ta, a, tb, b, sa, sah, sb, sbh, admin, admin_h = await _world(client, db_session)
    class_a = await _create(client, a)
    assert (await client.get(f"/api/classes/{class_a['id']}", headers=admin_h)).status_code == 200
    assert len((await client.get("/api/classes", headers=admin_h)).json()) == 1
    assert (await client.post("/api/classes", headers=admin_h, json={"name": "Ownerless"})).status_code == 422
    owned = await _create(client, admin_h, "Admin-created", teacher_id=tb.id)
    assert owned["teacher_id"] == tb.id
    assert (await client.post("/api/classes", headers=admin_h, json={"name": "Bad", "teacher_id": admin.id})).status_code == 422


@pytest.mark.asyncio
async def test_add_list_remove_and_reactivate_student_without_deleting_user(client, db_session):
    ta, a, tb, b, student, *_ = await _world(client, db_session)
    classroom = await _create(client, a)
    added = await client.post(f"/api/classes/{classroom['id']}/students", headers=a, json={"student_id": student.id})
    assert added.status_code == 201
    students = (await client.get(f"/api/classes/{classroom['id']}/students", headers=a)).json()
    assert [s["id"] for s in students] == [student.id]
    removed = await client.delete(f"/api/classes/{classroom['id']}/students/{student.id}", headers=a)
    assert removed.status_code == 204
    assert (await db_session.execute(select(User).where(User.id == student.id))).scalar_one() is not None
    assert (await client.get(f"/api/classes/{classroom['id']}/students", headers=a)).json() == []
    assert (await client.post(f"/api/classes/{classroom['id']}/students", headers=a, json={"student_id": student.id})).status_code == 201
    rows = (await db_session.execute(select(ClassMembership).where(ClassMembership.class_id == classroom["id"]))).scalars().all()
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_reject_non_student_members_and_duplicate_membership(client, db_session):
    ta, a, tb, b, student, student_h, sb, sbh, admin, admin_h = await _world(client, db_session)
    classroom = await _create(client, a)
    url = f"/api/classes/{classroom['id']}/students"
    assert (await client.post(url, headers=a, json={"student_id": ta.id})).status_code == 422
    assert (await client.post(url, headers=a, json={"student_id": admin.id})).status_code == 422
    assert (await client.post(url, headers=a, json={"student_id": student.id})).status_code == 201
    assert (await client.post(url, headers=a, json={"student_id": student.id})).status_code == 409


@pytest.mark.asyncio
async def test_cross_teacher_cannot_manage_membership_or_gain_student_by_id(client, db_session):
    ta, a, tb, b, student_a, sah, student_b, sbh, *_ = await _world(client, db_session)
    class_a = await _create(client, a)
    class_b = await _create(client, b, "Class B")
    assert (await client.post(f"/api/classes/{class_a['id']}/students", headers=a, json={"student_id": student_a.id})).status_code == 201
    assert (await client.post(f"/api/classes/{class_b['id']}/students", headers=b, json={"student_id": student_b.id})).status_code == 201
    assert (await client.get(f"/api/classes/{class_b['id']}/students", headers=a)).status_code == 404
    assert (await client.post(f"/api/classes/{class_b['id']}/students", headers=a, json={"student_id": student_b.id})).status_code == 404
    assert (await client.delete(f"/api/classes/{class_b['id']}/students/{student_b.id}", headers=a)).status_code == 404


@pytest.mark.asyncio
async def test_archived_class_is_readable_but_membership_is_immutable(client, db_session):
    ta, a, tb, b, student, *_ = await _world(client, db_session)
    classroom = await _create(client, a)
    archived = await client.patch(f"/api/classes/{classroom['id']}", headers=a, json={"status": "archived"})
    assert archived.status_code == 200
    assert (await client.get(f"/api/classes/{classroom['id']}", headers=a)).status_code == 200
    assert (await client.post(f"/api/classes/{classroom['id']}/students", headers=a, json={"student_id": student.id})).status_code == 409


@pytest.mark.asyncio
async def test_database_unique_constraint_guards_membership_races(db_session):
    teacher = User(email="race-t@example.com", hashed_password="x", full_name="T", role=UserRole.TEACHER)
    student = User(email="race-s@example.com", hashed_password="x", full_name="S", role=UserRole.STUDENT)
    db_session.add_all([teacher, student])
    await db_session.flush()
    classroom = Classroom(teacher_id=teacher.id, name="Race")
    db_session.add(classroom)
    await db_session.flush()
    db_session.add_all([
        ClassMembership(class_id=classroom.id, student_id=student.id),
        ClassMembership(class_id=classroom.id, student_id=student.id),
    ])
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_reusable_student_scope_is_membership_bound_and_admin_is_global(db_session):
    teacher_a = User(email="scope-a@example.com", hashed_password="x", full_name="A", role=UserRole.TEACHER)
    teacher_b = User(email="scope-b@example.com", hashed_password="x", full_name="B", role=UserRole.TEACHER)
    student_a = User(email="scope-sa@example.com", hashed_password="x", full_name="SA", role=UserRole.STUDENT)
    student_b = User(email="scope-sb@example.com", hashed_password="x", full_name="SB", role=UserRole.STUDENT)
    admin = User(email="scope-admin@example.com", hashed_password="x", full_name="Admin", role=UserRole.ADMIN)
    db_session.add_all([teacher_a, teacher_b, student_a, student_b, admin])
    await db_session.flush()
    class_a = Classroom(teacher_id=teacher_a.id, name="A")
    class_b = Classroom(teacher_id=teacher_b.id, name="B")
    db_session.add_all([class_a, class_b])
    await db_session.flush()
    db_session.add_all([
        ClassMembership(class_id=class_a.id, student_id=student_a.id),
        ClassMembership(class_id=class_b.id, student_id=student_b.id),
    ])
    await db_session.commit()

    assert await accessible_student_ids(db_session, teacher_a) == {student_a.id}
    assert await teacher_has_student_access(db_session, teacher_a, student_a.id)
    assert not await teacher_has_student_access(db_session, teacher_a, student_b.id)
    assert await accessible_student_ids(db_session, admin) is None
    assert await teacher_has_student_access(db_session, admin, student_b.id)
