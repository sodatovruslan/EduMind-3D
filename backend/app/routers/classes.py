from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.classroom_scope import get_accessible_classroom
from app.core.deps import require_role
from app.database import get_db
from app.models.classroom import ClassMembership, Classroom
from app.models.user import User, UserRole
from app.schemas.classroom import AvailableStudentRead, ClassroomCreate, ClassroomRead, ClassroomUpdate, ClassStudentRead, MembershipCreate, MembershipRead
from app.schemas.user import UserRead

router = APIRouter(prefix="/api/classes", tags=["classes"])
_CLASS_MANAGER = require_role(UserRole.TEACHER, UserRole.ADMIN)


async def _resolve_owner(db: AsyncSession, actor: User, requested_teacher_id: str | None) -> User:
    if actor.role == UserRole.TEACHER:
        if requested_teacher_id is not None and requested_teacher_id != actor.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teachers can only own their classes")
        return actor
    if requested_teacher_id is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="teacher_id is required for admin")
    owner = (await db.execute(select(User).where(User.id == requested_teacher_id))).scalar_one_or_none()
    if owner is None or owner.role != UserRole.TEACHER:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Class owner must be a teacher")
    return owner


def _ensure_active(classroom: Classroom) -> None:
    if classroom.status != "active":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Archived classroom membership cannot change")


async def _classroom_read(db: AsyncSession, classroom: Classroom) -> ClassroomRead:
    count = (await db.execute(select(func.count(ClassMembership.id)).where(
        ClassMembership.class_id == classroom.id, ClassMembership.removed_at.is_(None)
    ))).scalar_one()
    return ClassroomRead.model_validate(classroom).model_copy(update={"student_count": count})


@router.post("", response_model=ClassroomRead, status_code=status.HTTP_201_CREATED)
async def create_classroom(payload: ClassroomCreate, db: AsyncSession = Depends(get_db), actor: User = Depends(_CLASS_MANAGER)):
    owner = await _resolve_owner(db, actor, payload.teacher_id)
    classroom = Classroom(teacher_id=owner.id, name=payload.name.strip())
    db.add(classroom)
    await db.commit()
    await db.refresh(classroom)
    return await _classroom_read(db, classroom)


@router.get("", response_model=list[ClassroomRead])
async def list_classrooms(db: AsyncSession = Depends(get_db), actor: User = Depends(_CLASS_MANAGER)):
    query = select(Classroom).order_by(Classroom.created_at.desc())
    if actor.role != UserRole.ADMIN:
        query = query.where(Classroom.teacher_id == actor.id)
    classrooms = (await db.execute(query)).scalars().all()
    if not classrooms:
        return []
    counts = dict((await db.execute(
        select(ClassMembership.class_id, func.count(ClassMembership.id))
        .where(ClassMembership.class_id.in_([c.id for c in classrooms]), ClassMembership.removed_at.is_(None))
        .group_by(ClassMembership.class_id)
    )).all())
    return [ClassroomRead.model_validate(c).model_copy(update={"student_count": counts.get(c.id, 0)}) for c in classrooms]


@router.get("/{classroom_id}", response_model=ClassroomRead)
async def read_classroom(classroom_id: str, db: AsyncSession = Depends(get_db), actor: User = Depends(_CLASS_MANAGER)):
    return await _classroom_read(db, await get_accessible_classroom(db, actor, classroom_id))


@router.patch("/{classroom_id}", response_model=ClassroomRead)
async def update_classroom(classroom_id: str, payload: ClassroomUpdate, db: AsyncSession = Depends(get_db), actor: User = Depends(_CLASS_MANAGER)):
    classroom = await get_accessible_classroom(db, actor, classroom_id)
    if payload.name is not None:
        classroom.name = payload.name.strip()
    if payload.status is not None:
        classroom.status = payload.status
    await db.commit()
    await db.refresh(classroom)
    return await _classroom_read(db, classroom)


@router.get("/{classroom_id}/available-students", response_model=list[AvailableStudentRead])
async def available_students(
    classroom_id: str,
    q: str = Query(min_length=2, max_length=100),
    limit: int = Query(default=20, ge=1, le=25),
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(_CLASS_MANAGER),
):
    await get_accessible_classroom(db, actor, classroom_id)
    active_member = select(ClassMembership.id).where(
        ClassMembership.class_id == classroom_id,
        ClassMembership.student_id == User.id,
        ClassMembership.removed_at.is_(None),
    ).exists()
    term = q.strip()
    if len(term) < 2:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Search requires at least 2 characters")
    return (await db.execute(
        select(User)
        .where(
            User.role == UserRole.STUDENT,
            ~active_member,
            or_(User.full_name.ilike(f"%{term}%"), User.email.ilike(f"%{term}%")),
        )
        .order_by(User.full_name, User.email)
        .limit(limit)
    )).scalars().all()


@router.get("/{classroom_id}/students", response_model=list[ClassStudentRead])
async def list_class_students(classroom_id: str, db: AsyncSession = Depends(get_db), actor: User = Depends(_CLASS_MANAGER)):
    await get_accessible_classroom(db, actor, classroom_id)
    memberships = (await db.execute(
        select(ClassMembership).options(selectinload(ClassMembership.student))
        .where(ClassMembership.class_id == classroom_id, ClassMembership.removed_at.is_(None))
        .order_by(ClassMembership.joined_at)
    )).scalars().all()
    return [
        ClassStudentRead(
            **UserRead.model_validate(m.student).model_dump(),
            membership=MembershipRead.model_validate(m),
        )
        for m in memberships
    ]


@router.post("/{classroom_id}/students", response_model=MembershipRead, status_code=status.HTTP_201_CREATED)
async def add_class_student(classroom_id: str, payload: MembershipCreate, db: AsyncSession = Depends(get_db), actor: User = Depends(_CLASS_MANAGER)):
    classroom = await get_accessible_classroom(db, actor, classroom_id)
    _ensure_active(classroom)
    student = (await db.execute(select(User).where(User.id == payload.student_id))).scalar_one_or_none()
    if student is None or student.role != UserRole.STUDENT:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Membership user must be a student")
    membership = (await db.execute(select(ClassMembership).where(
        ClassMembership.class_id == classroom_id, ClassMembership.student_id == payload.student_id
    ))).scalar_one_or_none()
    if membership is not None and membership.removed_at is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Student is already a class member")
    if membership is not None:
        membership.removed_at = None
        membership.joined_at = datetime.utcnow()
    else:
        membership = ClassMembership(class_id=classroom_id, student_id=student.id)
        db.add(membership)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Student is already a class member")
    await db.refresh(membership)
    return membership


@router.delete("/{classroom_id}/students/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_class_student(classroom_id: str, student_id: str, db: AsyncSession = Depends(get_db), actor: User = Depends(_CLASS_MANAGER)):
    classroom = await get_accessible_classroom(db, actor, classroom_id)
    _ensure_active(classroom)
    membership = (await db.execute(select(ClassMembership).where(
        ClassMembership.class_id == classroom_id,
        ClassMembership.student_id == student_id,
        ClassMembership.removed_at.is_(None),
    ))).scalar_one_or_none()
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active membership not found")
    membership.removed_at = datetime.utcnow()
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
