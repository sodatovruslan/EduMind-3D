from datetime import datetime

from pydantic import BaseModel


class StudentOverview(BaseModel):
    id: str
    full_name: str
    email: str
    level: int
    xp: int
    completed_labs: int
    accuracy: float
    weak_topics: list[str]
    latest_score: float | None
    last_activity_at: datetime | None
    needs_attention: bool


class TeacherStats(BaseModel):
    average_score: float | None
    completion_rate: float
    active_students: int
    total_students: int


class ModuleResultSummary(BaseModel):
    module: str
    average_score: float | None
    completed_count: int


class StudentDetail(BaseModel):
    id: str
    full_name: str
    email: str
    created_at: datetime
    level: int
    xp: int
    completed_labs: int
    accuracy: float
    average_hints: float
    average_attempts: float
    strong_topics: list[str]
    weak_topics: list[str]
    recent_mistakes: list[str]
    achievements: list[str]
    current_streak: int
    last_completed_lab: str | None
    needs_attention: bool
    module_breakdown: list[ModuleResultSummary]


class RecentResult(BaseModel):
    id: str
    student_id: str
    student_name: str
    simulation_id: str
    simulation_title: str
    module: str
    score: float | None
    duration_seconds: int
    completed_at: datetime


class ClassModuleBreakdown(BaseModel):
    module: str
    average_score: float | None
    completed_count: int
    active_students: int
