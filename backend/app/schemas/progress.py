from datetime import datetime

from pydantic import BaseModel


class TaskMistake(BaseModel):
    code: str


class TaskEventRequest(BaseModel):
    simulation_id: str
    task_id: str
    difficulty: str  # easy | medium | hard — из TaskDefinition.difficulty (task-engine.ts)
    xp_reward: int
    completed: bool
    # реальные счетчики поведения ученика на этой задаче: hints_used — число
    # сообщений AI-преподавателю за время работы над задачей, attempts —
    # число изменений схемы (добавлен/убран провод) до результата
    hints_used: int = 0
    attempts: int = 0
    mistakes: list[TaskMistake] = []


class LabCompletedRequest(BaseModel):
    simulation_id: str
    # агрегаты по только что завершенной лабораторной — считаются на
    # фронтенде из реальных per-task событий этой же сессии
    tasks_completed: int
    total_mistakes: int
    total_hints: int
    total_attempts: int


class LearningProfileOut(BaseModel):
    level: int
    xp: int
    completed_tasks: list[str]
    completed_labs: int
    accuracy: float
    average_hints: float
    average_attempts: float
    strong_topics: list[str]
    weak_topics: list[str]
    recent_mistakes: list[str]
    recommended_difficulty: str
    last_completed_lab: str | None
    achievements: list[str]
    current_streak: int


class TaskEventResponse(BaseModel):
    profile: LearningProfileOut
    new_achievements: list[str]
    repeated_mistake_code: str | None


class LabCompletedResponse(BaseModel):
    profile: LearningProfileOut
    new_achievements: list[str]
    summary: str
    recommended_next: str
    teacher_note: str | None


class LearningEventOut(BaseModel):
    event_type: str
    payload: dict
    created_at: datetime


class ProgressHistoryOut(BaseModel):
    profile: LearningProfileOut
    events: list[LearningEventOut]
