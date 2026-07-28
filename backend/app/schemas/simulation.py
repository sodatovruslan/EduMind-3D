from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.simulation import SimulationModule


class SimulationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    module: SimulationModule
    subject: str
    config: dict
    difficulty: int
    created_at: datetime


class SimulationActionRequest(BaseModel):
    action_type: str
    payload: dict = {}


class SimulationActionResponse(BaseModel):
    action_type: str
    result: dict


class SimulationCompleteRequest(BaseModel):
    actions_log: list[dict]
    duration_seconds: int
