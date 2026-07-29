import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.ai_log import AILog
from app.models.lab_result import LabResult
from app.models.simulation import Simulation
from app.models.user import User, UserRole
from app.schemas.ai import (
    GradeRequest,
    GradeResponse,
    HintRequest,
    HintResponse,
    TeacherChatRequest,
    TeacherChatResponse,
)
from app.services.ai_service import get_grading_feedback, get_hint, get_teacher_response
from app.services.grader_service import build_grading_context

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/hint", response_model=HintResponse)
async def ask_hint(
    payload: HintRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Simulation).where(Simulation.id == payload.simulation_id))
    simulation = result.scalar_one_or_none()
    if simulation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Симуляция не найдена")

    hint_text = await get_hint(payload.scene_state)

    db.add(
        AILog(
            user_id=current_user.id,
            simulation_id=simulation.id,
            prompt=payload.scene_state,
            response=hint_text,
            log_type="hint",
        )
    )
    await db.commit()

    return HintResponse(hint=hint_text)


@router.post("/grade", response_model=GradeResponse)
async def grade_lab_result(
    payload: GradeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(LabResult).where(LabResult.id == payload.lab_result_id))
    lab_result = result.scalar_one_or_none()
    if lab_result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Результат не найден")

    if lab_result.user_id != current_user.id and current_user.role == UserRole.STUDENT:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к этому результату")

    sim_result = await db.execute(select(Simulation).where(Simulation.id == lab_result.simulation_id))
    simulation = sim_result.scalar_one_or_none()

    context = build_grading_context(simulation, lab_result.actions_log, lab_result.score or 0.0)
    feedback_text = await get_grading_feedback(context)

    lab_result.feedback = {"text": feedback_text}
    db.add(
        AILog(
            user_id=current_user.id,
            simulation_id=simulation.id,
            prompt=context,
            response=feedback_text,
            log_type="grading",
        )
    )
    await db.commit()

    return GradeResponse(score=lab_result.score or 0.0, feedback=feedback_text)


@router.post("/teacher", response_model=TeacherChatResponse)
async def ask_teacher(
    payload: TeacherChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    AI Teacher (Stage 3): в отличие от /hint, принимает не текстовое
    описание сцены, а уже собранный AI Context Builder JSON-объект
    (physics/validation/task/xp) — тот же принцип "AI не считает физику
    сам", просто с более строгой структурой данных и teacher-промптом.
    """
    result = await db.execute(select(Simulation).where(Simulation.id == payload.simulation_id))
    simulation = result.scalar_one_or_none()
    if simulation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Симуляция не найдена")

    context_json = json.dumps(payload.context, ensure_ascii=False)
    history_payload = [{"role": m.role, "text": m.text} for m in payload.history]
    reply_text = await get_teacher_response(context_json, payload.student_message, history_payload)

    db.add(
        AILog(
            user_id=current_user.id,
            simulation_id=simulation.id,
            prompt=f"{context_json}\n\nВопрос: {payload.student_message}",
            response=reply_text,
            log_type="teacher_chat",
        )
    )
    await db.commit()

    return TeacherChatResponse(reply=reply_text)


@router.get("/logs/{simulation_id}", response_model=list[dict])
async def get_ai_logs(
    simulation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(AILog).where(AILog.simulation_id == simulation_id)
    if current_user.role == UserRole.STUDENT:
        query = query.where(AILog.user_id == current_user.id)

    result = await db.execute(query)
    logs = result.scalars().all()
    return [
        {
            "id": log.id,
            "prompt": log.prompt,
            "response": log.response,
            "log_type": log.log_type,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]
