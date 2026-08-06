from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class ChemistrySaveCreate(BaseModel):
    simulation_id: str | None = None
    experiment_id: str | None = None
    schema_version: str = "1.0"
    status: str = "active"
    idempotency_key: str | None = None
    snapshot: dict = Field(default_factory=dict)


class ChemistrySaveUpdate(BaseModel):
    expected_revision: int = Field(..., description="Target revision for optimistic concurrency lock check")
    status: str | None = None
    schema_version: str | None = None
    snapshot: dict | None = None


class ChemistrySaveRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    simulation_id: str | None
    experiment_id: str | None
    schema_version: str
    revision: int
    status: str
    idempotency_key: str | None
    snapshot: dict
    created_at: datetime
    updated_at: datetime
    last_autosaved_at: datetime
