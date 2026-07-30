"""
Progress Service (Stage 4) — вся арифметика Learning Profile. Ничего не
придумывает: каждое число либо берется напрямую из события, которое
прислал фронтенд (уже посчитанное Task Validator состояние — completed,
mistakes, hints_used, attempts), либо агрегируется из истории
LearningEvent (accuracy/средние/темы/серия/рекомендация). AI Teacher
сюда не имеет доступа "на запись" — только читает то, что здесь посчитано.
"""
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.learning_event import LearningEvent
from app.models.learning_profile import LearningProfile
from app.models.user import User
from app.schemas.progress import LabCompletedRequest, TaskEventRequest

# id задачи (task-engine.ts TASKS) -> человекочитаемая тема, для
# strongTopics/weakTopics. Список задач фиксирован (см. frontend/lib/
# task-engine.ts) — обновлять здесь при добавлении новых задач.
TASK_TOPICS: dict[str, str] = {
    "task-1-close-loop": "Базовые цепи",
    "task-2-ammeter-series": "Амперметр",
    "task-3-voltmeter-parallel": "Вольтметр",
    "task-4-target-current": "Закон Ома",
    "task-5-find-break": "Диагностика обрывов",
    "task-6-fix-short": "Короткое замыкание",
}

XP_ACHIEVEMENTS: list[tuple[str, int]] = [
    ("electrician_beginner", 25),
    ("electrician_intermediate", 60),
    ("electrician_advanced", 95),
]

STRONG_TOPIC_MAX_AVG_MISTAKES = 0.01
WEAK_TOPIC_MIN_AVG_MISTAKES = 2.0


def level_for_xp(xp: int) -> int:
    return 1 + xp // 50


async def _get_or_create_profile(db: AsyncSession, user: User) -> LearningProfile:
    result = await db.execute(select(LearningProfile).where(LearningProfile.user_id == user.id))
    profile = result.scalar_one_or_none()
    if profile is None:
        profile = LearningProfile(user_id=user.id, level=1, xp=0, completed_tasks=[], completed_labs=0, achievements=[])
        db.add(profile)
        await db.flush()
    return profile


async def _get_events(db: AsyncSession, user: User) -> list[LearningEvent]:
    result = await db.execute(
        select(LearningEvent).where(LearningEvent.user_id == user.id).order_by(LearningEvent.created_at.asc())
    )
    return list(result.scalars().all())


def compute_derived_stats(events: list[LearningEvent]) -> dict:
    """
    events — в хронологическом порядке (старые -> новые). Все поля
    пересчитываются заново от истории, а не хранятся как "бегущее
    среднее" — так они не могут разъехаться с реальностью.
    """
    task_completions = [e for e in events if e.event_type == "task_completed"]
    mistake_events = [e for e in events if e.event_type == "mistake"]

    total = len(task_completions)
    if total == 0:
        return {
            "accuracy": 0.0,
            "average_hints": 0.0,
            "average_attempts": 0.0,
            "strong_topics": [],
            "weak_topics": [],
            "recent_mistakes": [m.payload.get("code", "") for m in mistake_events[-10:]][::-1],
            "current_streak": 0,
            "recommended_difficulty": "easy",
        }

    perfect = sum(1 for e in task_completions if e.payload.get("mistakes_count", 0) == 0)
    accuracy = round(perfect / total * 100, 1)
    average_hints = round(sum(e.payload.get("hints_used", 0) for e in task_completions) / total, 2)
    average_attempts = round(sum(e.payload.get("attempts", 0) for e in task_completions) / total, 2)

    per_topic_mistakes: dict[str, list[int]] = {}
    for e in task_completions:
        topic = TASK_TOPICS.get(e.payload.get("task_id", ""))
        if not topic:
            continue
        per_topic_mistakes.setdefault(topic, []).append(e.payload.get("mistakes_count", 0))

    strong_topics = [
        topic for topic, counts in per_topic_mistakes.items() if sum(counts) / len(counts) <= STRONG_TOPIC_MAX_AVG_MISTAKES
    ]
    weak_topics = [
        topic for topic, counts in per_topic_mistakes.items() if sum(counts) / len(counts) >= WEAK_TOPIC_MIN_AVG_MISTAKES
    ]

    current_streak = 0
    for e in reversed(task_completions):
        if e.payload.get("mistakes_count", 0) == 0:
            current_streak += 1
        else:
            break

    if accuracy >= 80 and average_attempts <= 3:
        recommended_difficulty = "hard"
    elif accuracy < 50 or average_attempts > 6:
        recommended_difficulty = "easy"
    else:
        recommended_difficulty = "medium"

    recent_mistakes = [m.payload.get("code", "") for m in mistake_events[-10:]][::-1]

    return {
        "accuracy": accuracy,
        "average_hints": average_hints,
        "average_attempts": average_attempts,
        "strong_topics": strong_topics,
        "weak_topics": weak_topics,
        "recent_mistakes": recent_mistakes,
        "current_streak": current_streak,
        "recommended_difficulty": recommended_difficulty,
    }


def detect_repeated_mistake(events: list[LearningEvent]) -> str | None:
    """Три последние (по времени) ошибки — один и тот же код => AI должен это заметить."""
    mistake_events = [e for e in events if e.event_type == "mistake"]
    if len(mistake_events) < 3:
        return None
    last_three = mistake_events[-3:]
    codes = {e.payload.get("code") for e in last_three}
    if len(codes) == 1:
        return last_three[-1].payload.get("code")
    return None


def profile_to_dict(profile: LearningProfile, stats: dict) -> dict:
    return {
        "level": profile.level,
        "xp": profile.xp,
        "completed_tasks": profile.completed_tasks or [],
        "completed_labs": profile.completed_labs,
        "accuracy": stats["accuracy"],
        "average_hints": stats["average_hints"],
        "average_attempts": stats["average_attempts"],
        "strong_topics": stats["strong_topics"],
        "weak_topics": stats["weak_topics"],
        "recent_mistakes": stats["recent_mistakes"],
        "recommended_difficulty": stats["recommended_difficulty"],
        "last_completed_lab": profile.last_completed_lab,
        "achievements": profile.achievements or [],
        "current_streak": stats["current_streak"],
    }


async def get_profile_with_stats(db: AsyncSession, user: User) -> tuple[LearningProfile, dict]:
    profile = await _get_or_create_profile(db, user)
    events = await _get_events(db, user)
    stats = compute_derived_stats(events)
    return profile, stats


async def record_task_event(db: AsyncSession, user: User, payload: TaskEventRequest) -> tuple[dict, list[str], str | None]:
    profile = await _get_or_create_profile(db, user)

    mistakes_count = len(payload.mistakes)
    event_type = "task_completed" if payload.completed else "task_attempt"
    db.add(
        LearningEvent(
            user_id=user.id,
            event_type=event_type,
            payload={
                "task_id": payload.task_id,
                "difficulty": payload.difficulty,
                "xp_reward": payload.xp_reward,
                "hints_used": payload.hints_used,
                "attempts": payload.attempts,
                "mistakes_count": mistakes_count,
                "simulation_id": payload.simulation_id,
            },
        )
    )
    for m in payload.mistakes:
        db.add(
            LearningEvent(
                user_id=user.id,
                event_type="mistake",
                payload={"task_id": payload.task_id, "code": m.code},
            )
        )

    new_achievements: list[str] = []
    if payload.completed and payload.task_id not in (profile.completed_tasks or []):
        profile.completed_tasks = [*(profile.completed_tasks or []), payload.task_id]
        profile.xp += payload.xp_reward
        profile.level = level_for_xp(profile.xp)

        if payload.task_id == "task-1-close-loop" and "first_circuit" not in (profile.achievements or []):
            new_achievements.append("first_circuit")

        for code, threshold in XP_ACHIEVEMENTS:
            if profile.xp >= threshold and code not in (profile.achievements or []):
                new_achievements.append(code)

    await db.flush()

    if new_achievements:
        profile.achievements = [*(profile.achievements or []), *new_achievements]
        for code in new_achievements:
            db.add(LearningEvent(user_id=user.id, event_type="achievement_earned", payload={"code": code}))

    await db.commit()
    await db.refresh(profile)

    events = await _get_events(db, user)
    stats = compute_derived_stats(events)
    repeated = detect_repeated_mistake(events)

    return profile_to_dict(profile, stats), new_achievements, repeated


async def record_lab_completed(db: AsyncSession, user: User, payload: LabCompletedRequest) -> tuple[dict, list[str]]:
    profile = await _get_or_create_profile(db, user)

    profile.completed_labs += 1
    profile.last_completed_lab = payload.simulation_id

    db.add(
        LearningEvent(
            user_id=user.id,
            event_type="lab_completed",
            payload={
                "simulation_id": payload.simulation_id,
                "tasks_completed": payload.tasks_completed,
                "total_mistakes": payload.total_mistakes,
                "total_hints": payload.total_hints,
                "total_attempts": payload.total_attempts,
            },
        )
    )

    new_achievements: list[str] = []
    if profile.completed_labs >= 5 and "five_labs_completed" not in (profile.achievements or []):
        new_achievements.append("five_labs_completed")
    if payload.total_mistakes == 0 and "first_perfect_lab" not in (profile.achievements or []):
        new_achievements.append("first_perfect_lab")
    if payload.total_hints == 0 and "no_hints_used" not in (profile.achievements or []):
        new_achievements.append("no_hints_used")
    if (
        payload.tasks_completed >= 6
        and payload.total_attempts <= payload.tasks_completed * 2
        and "fast_learner" not in (profile.achievements or [])
    ):
        new_achievements.append("fast_learner")

    if new_achievements:
        profile.achievements = [*(profile.achievements or []), *new_achievements]
        for code in new_achievements:
            db.add(LearningEvent(user_id=user.id, event_type="achievement_earned", payload={"code": code}))

    await db.commit()
    await db.refresh(profile)

    events = await _get_events(db, user)
    stats = compute_derived_stats(events)

    return profile_to_dict(profile, stats), new_achievements
