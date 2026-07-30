import json

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.learning_event import LearningEvent
from app.models.user import User
from app.schemas.progress import (
    LabCompletedRequest,
    LabCompletedResponse,
    ProgressHistoryOut,
    TaskEventRequest,
    TaskEventResponse,
)
from app.services.ai_service import get_lab_summary
from app.services.progress_service import get_profile_with_stats, profile_to_dict, record_lab_completed, record_task_event

router = APIRouter(prefix="/api/progress", tags=["progress"])


@router.get("/me", response_model=ProgressHistoryOut)
async def get_my_progress(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile, stats = await get_profile_with_stats(db, current_user)

    result = await db.execute(
        select(LearningEvent)
        .where(LearningEvent.user_id == current_user.id)
        .order_by(LearningEvent.created_at.desc())
        .limit(50)
    )
    events = result.scalars().all()

    return ProgressHistoryOut(
        profile=profile_to_dict(profile, stats),
        events=[{"event_type": e.event_type, "payload": e.payload, "created_at": e.created_at} for e in events],
    )


@router.post("/task-event", response_model=TaskEventResponse)
async def submit_task_event(
    payload: TaskEventRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile_out, new_achievements, repeated = await record_task_event(db, current_user, payload)
    return TaskEventResponse(profile=profile_out, new_achievements=new_achievements, repeated_mistake_code=repeated)


@router.post("/lab-completed", response_model=LabCompletedResponse)
async def submit_lab_completed(
    payload: LabCompletedRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile_out, new_achievements = await record_lab_completed(db, current_user, payload)

    summary_context = json.dumps(
        {
            "lab_result": {
                "tasks_completed": payload.tasks_completed,
                "total_mistakes": payload.total_mistakes,
                "total_hints": payload.total_hints,
                "total_attempts": payload.total_attempts,
            },
            "learning_profile": profile_out,
            "new_achievements": new_achievements,
        },
        ensure_ascii=False,
    )
    ai_result = await get_lab_summary(summary_context)

    return LabCompletedResponse(
        profile=profile_out,
        new_achievements=new_achievements,
        summary=ai_result["summary"],
        recommended_next=ai_result["recommended_next"],
        teacher_note=ai_result["note"],
    )
