from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.ai_log import AILog
from app.models.lab_result import LabResult
from app.models.simulation import Simulation
from app.models.user import User, UserRole
from app.schemas.ai import GradeRequest, GradeResponse, HintRequest, HintResponse
from app.services.ai_service import get_grading_feedback, get_hint
from app.services.grader_service import build_grading_context

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/hint", response_model=HintResponse)
async def ask_hint(
    payload: HintRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    simulation = db.query(Simulation).filter(Simulation.id == payload.simulation_id).first()
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
    db.commit()

    return HintResponse(hint=hint_text)


@router.post("/grade", response_model=GradeResponse)
async def grade_lab_result(
    payload: GradeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lab_result = db.query(LabResult).filter(LabResult.id == payload.lab_result_id).first()
    if lab_result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Результат не найден")

    if lab_result.user_id != current_user.id and current_user.role == UserRole.STUDENT:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к этому результату")

    simulation = db.query(Simulation).filter(Simulation.id == lab_result.simulation_id).first()

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
    db.commit()

    return GradeResponse(score=lab_result.score or 0.0, feedback=feedback_text)


@router.get("/logs/{simulation_id}", response_model=list[dict])
def get_ai_logs(
    simulation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(AILog).filter(AILog.simulation_id == simulation_id)
    if current_user.role == UserRole.STUDENT:
        query = query.filter(AILog.user_id == current_user.id)

    logs = query.all()
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
