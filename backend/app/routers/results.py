from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user, require_role
from app.database import get_db
from app.models.lab_result import LabResult
from app.models.simulation import Simulation
from app.models.user import User, UserRole
from app.schemas.lab_result import ClassStats, LabResultRead

router = APIRouter(prefix="/api/results", tags=["results"])


@router.get("/me", response_model=list[LabResultRead])
async def my_results(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(
        select(LabResult).options(selectinload(LabResult.simulation)).where(LabResult.user_id == current_user.id)
    )
    return result.scalars().all()


@router.get("/student/{user_id}", response_model=list[LabResultRead])
async def student_results(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _teacher: User = Depends(require_role(UserRole.TEACHER, UserRole.ADMIN)),
):
    result = await db.execute(
        select(LabResult).options(selectinload(LabResult.simulation)).where(LabResult.user_id == user_id)
    )
    return result.scalars().all()


@router.get("/stats", response_model=ClassStats)
async def class_stats(
    db: AsyncSession = Depends(get_db),
    _teacher: User = Depends(require_role(UserRole.TEACHER, UserRole.ADMIN)),
):
    """
    Агрегированная статистика для дашборда учителя. Считается напрямую из
    LabResults/Users — без отдельной таблицы "классов", т.к. в MVP один
    учитель видит всех учеников (модели "класс/группа" пока нет).
    """
    total_students = (
        await db.execute(select(func.count()).select_from(User).where(User.role == UserRole.STUDENT))
    ).scalar_one()
    total_simulations = (await db.execute(select(func.count()).select_from(Simulation))).scalar_one()

    average_score = (
        await db.execute(select(func.avg(LabResult.score)).where(LabResult.score.isnot(None)))
    ).scalar()
    active_students = (await db.execute(select(func.count(func.distinct(LabResult.user_id))))).scalar() or 0

    # уникальные пары (ученик, симуляция) — через distinct на нескольких колонках,
    # без func.concat (тот не работает на SQLite, только на Postgres)
    distinct_pairs = select(LabResult.user_id, LabResult.simulation_id).distinct().subquery()
    completed_pairs = (await db.execute(select(func.count()).select_from(distinct_pairs))).scalar_one()

    possible_pairs = total_students * total_simulations
    completion_rate = round((completed_pairs / possible_pairs) * 100, 1) if possible_pairs > 0 else 0.0

    return ClassStats(
        average_score=round(average_score, 1) if average_score is not None else None,
        completion_rate=completion_rate,
        active_students=active_students,
        total_students=total_students,
    )


@router.get("/{result_id}", response_model=LabResultRead)
async def get_result(
    result_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(LabResult).options(selectinload(LabResult.simulation)).where(LabResult.id == result_id)
    )
    lab_result = result.scalar_one_or_none()
    if lab_result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Результат не найден")

    if lab_result.user_id != current_user.id and current_user.role == UserRole.STUDENT:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к этому результату")

    return lab_result
