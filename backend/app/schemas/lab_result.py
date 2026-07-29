from datetime import datetime

from pydantic import BaseModel, ConfigDict


class LabResultRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    simulation_id: str
    simulation_title: str
    actions_log: list[dict]
    score: float | None
    feedback: dict | None
    duration_seconds: int
    completed_at: datetime


class ClassStats(BaseModel):
    average_score: float | None
    completion_rate: float
    active_students: int
    total_students: int
