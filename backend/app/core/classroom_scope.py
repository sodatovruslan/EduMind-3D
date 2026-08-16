from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.classroom import ClassMembership, Classroom
from app.models.user import User, UserRole


def require_class_manager(user: User) -> None:
    if user.role not in (UserRole.TEACHER, UserRole.ADMIN):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Class management access required")


async def get_accessible_classroom(db: AsyncSession, user: User, classroom_id: str) -> Classroom:
    """Return a class in the caller's scope; hide other teachers' classes as not found."""
    require_class_manager(user)
    query = select(Classroom).where(Classroom.id == classroom_id)
    if user.role != UserRole.ADMIN:
        query = query.where(Classroom.teacher_id == user.id)
    classroom = (await db.execute(query)).scalar_one_or_none()
    if classroom is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classroom not found")
    return classroom


async def accessible_student_ids(
    db: AsyncSession, user: User, classroom_id: str | None = None
) -> set[str] | None:
    """Return active-member IDs in scope; None denotes unfiltered admin scope.

    A class filter is authorized through the same classroom ownership helper
    used by class management. Archived classrooms remain readable in T2/T3,
    so their non-removed memberships remain an analytics scope as well.
    """
    require_class_manager(user)
    if classroom_id is None and user.role == UserRole.ADMIN:
        return None
    if classroom_id is not None:
        await get_accessible_classroom(db, user, classroom_id)
    query = (
        select(ClassMembership.student_id)
        .join(Classroom, Classroom.id == ClassMembership.class_id)
        .where(ClassMembership.removed_at.is_(None))
        .distinct()
    )
    if classroom_id is not None:
        query = query.where(ClassMembership.class_id == classroom_id)
    elif user.role != UserRole.ADMIN:
        query = query.where(Classroom.teacher_id == user.id)
    rows = await db.execute(query)
    return set(rows.scalars().all())


async def teacher_has_student_access(db: AsyncSession, user: User, student_id: str) -> bool:
    ids = await accessible_student_ids(db, user)
    return ids is None or student_id in ids


async def require_student_access(db: AsyncSession, user: User, student_id: str) -> None:
    if not await teacher_has_student_access(db, user, student_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found in teacher scope")


async def classroom_link_exists(db: AsyncSession, teacher_id: str, student_id: str) -> bool:
    """True if `student_id` has an active membership in any classroom `teacher_id` owns.

    T5 — the one symmetric primitive human messaging authorization is built
    on: unlike `teacher_has_student_access` (which assumes the CALLER is the
    teacher), this takes both ids explicitly so it works whichever side of
    the pair initiates (teacher opening a student's conversation, or a
    student opening their teacher's) without a second, parallel
    authorization mechanism. Deliberately does not distinguish "teacher
    doesn't exist" / "student doesn't exist" / "no shared active
    classroom" — callers should treat every negative the same way callers
    of `get_accessible_classroom` already do (404, not "forbidden"), so a
    guess at another user's id can't be used to probe who exists.
    """
    query = (
        select(ClassMembership.id)
        .join(Classroom, Classroom.id == ClassMembership.class_id)
        .where(
            Classroom.teacher_id == teacher_id,
            ClassMembership.student_id == student_id,
            ClassMembership.removed_at.is_(None),
        )
        .limit(1)
    )
    return (await db.execute(query)).scalar_one_or_none() is not None
