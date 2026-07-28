from datetime import datetime

from pydantic import BaseModel, ConfigDict


class LabResultRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    simulation_id: str
    actions_log: list[dict]
    score: float | None
    feedback: dict | None
    duration_seconds: int
    completed_at: datetime
