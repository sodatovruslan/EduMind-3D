"""
Teacher Learning Analytics Center (Stage D7).

Every number here is either read straight from a table or derived with the
exact same math progress_service.py already uses for the student's own
Learning Profile (accuracy/weak_topics/streak) — nothing here invents a new
scoring model or an AI risk score.

"needs_attention" rule (documented per D7 spec H): a student is flagged when
they have completed at least one task AND (accuracy < 50% OR they have at
least one weak topic — avg mistakes >= progress_service.WEAK_TOPIC_MIN_AVG_MISTAKES
per attempt on some topic). Both thresholds are the same ones already used
for the student-facing profile; no separate/ML scoring involved.
"""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.core.classroom_scope import accessible_student_ids
from app.database import get_db
from app.models.lab_result import LabResult
from app.models.learning_event import LearningEvent
from app.models.learning_profile import LearningProfile
from app.models.simulation import Simulation
from app.models.user import User, UserRole
from app.schemas.teacher import (
    ClassModuleBreakdown,
    ModuleResultSummary,
    RecentResult,
    StudentDetail,
    StudentOverview,
    TeacherStats,
)
from app.services.progress_service import compute_derived_stats

router = APIRouter(prefix="/api/teacher", tags=["teacher"])

_TEACHER_OR_ADMIN = require_role(UserRole.TEACHER, UserRole.ADMIN)


async def _analytics_scope(
    db: AsyncSession, actor: User, classroom_id: str | None
) -> set[str] | None:
    return await accessible_student_ids(db, actor, classroom_id)


def _apply_id_scope(query, student_ids: set[str] | None, column=User.id):
    return query if student_ids is None else query.where(column.in_(student_ids))


def _needs_attention(events: list[LearningEvent], stats: dict) -> bool:
    has_completed_task = any(e.event_type == "task_completed" for e in events)
    if not has_completed_task:
        return False
    return stats["accuracy"] < 50 or len(stats["weak_topics"]) > 0


async def _latest_activity_by_user(db: AsyncSession, student_ids: list[str]) -> dict[str, tuple[float | None, "object"]]:
    if not student_ids:
        return {}
    row_number_col = (
        func.row_number()
        .over(partition_by=LabResult.user_id, order_by=LabResult.completed_at.desc())
        .label("rn")
    )
    latest_subq = (
        select(
            LabResult.user_id.label("user_id"),
            LabResult.score.label("score"),
            LabResult.completed_at.label("completed_at"),
            row_number_col,
        )
        .where(LabResult.user_id.in_(student_ids))
        .subquery()
    )
    result = await db.execute(
        select(latest_subq.c.user_id, latest_subq.c.score, latest_subq.c.completed_at).where(latest_subq.c.rn == 1)
    )
    return {user_id: (score, completed_at) for user_id, score, completed_at in result.all()}


@router.get("/stats", response_model=TeacherStats)
async def teacher_stats(
    class_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(_TEACHER_OR_ADMIN),
):
    student_ids = await _analytics_scope(db, actor, class_id)
    student_query = select(func.count()).select_from(User).where(User.role == UserRole.STUDENT)
    total_students = (await db.execute(_apply_id_scope(student_query, student_ids))).scalar_one()
    total_simulations = (await db.execute(select(func.count()).select_from(Simulation))).scalar_one()

    score_query = select(func.avg(LabResult.score)).where(LabResult.score.isnot(None))
    active_query = select(func.count(func.distinct(LabResult.user_id)))
    pairs_query = select(LabResult.user_id, LabResult.simulation_id).distinct()
    score_query = _apply_id_scope(score_query, student_ids, LabResult.user_id)
    active_query = _apply_id_scope(active_query, student_ids, LabResult.user_id)
    pairs_query = _apply_id_scope(pairs_query, student_ids, LabResult.user_id)
    average_score = (await db.execute(score_query)).scalar()
    active_students = (await db.execute(active_query)).scalar() or 0
    completed_pairs = (await db.execute(select(func.count()).select_from(pairs_query.subquery()))).scalar_one()
    possible_pairs = total_students * total_simulations
    return TeacherStats(
        average_score=round(average_score, 1) if average_score is not None else None,
        completion_rate=round((completed_pairs / possible_pairs) * 100, 1) if possible_pairs else 0.0,
        active_students=active_students,
        total_students=total_students,
    )


@router.get("/students-overview", response_model=list[StudentOverview])
async def students_overview(
    class_id: str | None = None,
    q: str | None = Query(default=None, max_length=100),
    filter: Literal["all", "attention", "active", "inactive"] = "all",
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(_TEACHER_OR_ADMIN),
):
    student_ids = await _analytics_scope(db, actor, class_id)
    query = select(User).where(User.role == UserRole.STUDENT)
    query = _apply_id_scope(query, student_ids)
    if q and (term := q.strip()):
        query = query.where(or_(User.full_name.ilike(f"%{term}%"), User.email.ilike(f"%{term}%")))
    has_result = exists(select(LabResult.id).where(LabResult.user_id == User.id))
    if filter == "active":
        query = query.where(has_result)
    elif filter == "inactive":
        query = query.where(~has_result)
    students = (await db.execute(query.order_by(User.full_name, User.id))).scalars().all()
    if not students:
        return []
    student_ids = [s.id for s in students]

    profiles_by_user = {
        p.user_id: p
        for p in (
            await db.execute(select(LearningProfile).where(LearningProfile.user_id.in_(student_ids)))
        ).scalars().all()
    }

    events_by_user: dict[str, list[LearningEvent]] = {}
    events = (
        (
            await db.execute(
                select(LearningEvent)
                .where(LearningEvent.user_id.in_(student_ids))
                .order_by(LearningEvent.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    for e in events:
        events_by_user.setdefault(e.user_id, []).append(e)

    latest_by_user = await _latest_activity_by_user(db, student_ids)

    overview: list[StudentOverview] = []
    for s in students:
        profile = profiles_by_user.get(s.id)
        student_events = events_by_user.get(s.id, [])
        stats = compute_derived_stats(student_events)
        latest_score, latest_at = latest_by_user.get(s.id, (None, None))
        overview.append(
            StudentOverview(
                id=s.id,
                full_name=s.full_name,
                email=s.email,
                level=profile.level if profile else 1,
                xp=profile.xp if profile else 0,
                completed_labs=profile.completed_labs if profile else 0,
                accuracy=stats["accuracy"],
                weak_topics=stats["weak_topics"],
                latest_score=latest_score,
                last_activity_at=latest_at,
                needs_attention=_needs_attention(student_events, stats),
            )
        )
    if filter == "attention":
        return [student for student in overview if student.needs_attention]
    return overview


@router.get("/student/{user_id}", response_model=StudentDetail)
async def student_detail(
    user_id: str,
    class_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(_TEACHER_OR_ADMIN),
):
    student_ids = await _analytics_scope(db, actor, class_id)
    if student_ids is not None and user_id not in student_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found in teacher scope")
    student = (await db.execute(select(User).where(User.id == user_id, User.role == UserRole.STUDENT))).scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ученик не найден")

    profile = (
        await db.execute(select(LearningProfile).where(LearningProfile.user_id == user_id))
    ).scalar_one_or_none()

    events = (
        (
            await db.execute(
                select(LearningEvent).where(LearningEvent.user_id == user_id).order_by(LearningEvent.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    stats = compute_derived_stats(events)

    module_rows = (
        await db.execute(
            select(Simulation.module, func.avg(LabResult.score), func.count(LabResult.id))
            .join(Simulation, Simulation.id == LabResult.simulation_id)
            .where(LabResult.user_id == user_id)
            .group_by(Simulation.module)
        )
    ).all()
    module_breakdown = [
        ModuleResultSummary(
            module=module.value,
            average_score=round(avg_score, 1) if avg_score is not None else None,
            completed_count=count,
        )
        for module, avg_score, count in module_rows
    ]

    return StudentDetail(
        id=student.id,
        full_name=student.full_name,
        email=student.email,
        created_at=student.created_at,
        level=profile.level if profile else 1,
        xp=profile.xp if profile else 0,
        completed_labs=profile.completed_labs if profile else 0,
        accuracy=stats["accuracy"],
        average_hints=stats["average_hints"],
        average_attempts=stats["average_attempts"],
        strong_topics=stats["strong_topics"],
        weak_topics=stats["weak_topics"],
        recent_mistakes=stats["recent_mistakes"],
        achievements=profile.achievements if profile else [],
        current_streak=stats["current_streak"],
        last_completed_lab=profile.last_completed_lab if profile else None,
        needs_attention=_needs_attention(events, stats),
        module_breakdown=module_breakdown,
    )


@router.get("/recent-results", response_model=list[RecentResult])
async def recent_results(
    limit: int = 20,
    class_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(_TEACHER_OR_ADMIN),
):
    limit = min(max(limit, 1), 100)
    student_ids = await _analytics_scope(db, actor, class_id)
    query = (
        select(LabResult, User.full_name, Simulation.title, Simulation.module)
        .join(User, User.id == LabResult.user_id)
        .join(Simulation, Simulation.id == LabResult.simulation_id)
        .where(User.role == UserRole.STUDENT)
    )
    query = _apply_id_scope(query, student_ids, LabResult.user_id)
    rows = (
        await db.execute(
            query.order_by(LabResult.completed_at.desc()).limit(limit)
        )
    ).all()
    return [
        RecentResult(
            id=lr.id,
            student_id=lr.user_id,
            student_name=full_name,
            simulation_id=lr.simulation_id,
            simulation_title=title,
            module=module.value,
            score=lr.score,
            duration_seconds=lr.duration_seconds,
            completed_at=lr.completed_at,
        )
        for lr, full_name, title, module in rows
    ]


@router.get("/module-breakdown", response_model=list[ClassModuleBreakdown])
async def module_breakdown(
    class_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(_TEACHER_OR_ADMIN),
):
    student_ids = await _analytics_scope(db, actor, class_id)
    query = (
        select(
            Simulation.module,
            func.avg(LabResult.score),
            func.count(LabResult.id),
            func.count(func.distinct(LabResult.user_id)),
        )
        .join(Simulation, Simulation.id == LabResult.simulation_id)
        .join(User, User.id == LabResult.user_id)
        .where(User.role == UserRole.STUDENT)
    )
    query = _apply_id_scope(query, student_ids, LabResult.user_id)
    rows = (
        await db.execute(
            query.group_by(Simulation.module)
        )
    ).all()
    return [
        ClassModuleBreakdown(
            module=module.value,
            average_score=round(avg_score, 1) if avg_score is not None else None,
            completed_count=count,
            active_students=active,
        )
        for module, avg_score, count, active in rows
    ]
