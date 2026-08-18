from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.help_request import HelpRequestStatus

# T10 §32 — context snapshots arrive partly from the frontend, so they are
# never trusted as arbitrary JSON: a fixed, small set of top-level fields
# (a real whitelist, not "whatever the client sends"), each individually
# length-bounded, plus two small bounded key/value bags for the
# world-specific nuance (brief §5/§6/§7's per-world field lists) that
# don't need a rigid per-world schema of their own. Unknown top-level
# fields are silently ignored (`extra="ignore"`) — the one consistent
# policy brief §51 asks for, chosen over a hard 422 so a frontend adapter
# a half-step ahead of this schema's `context_version` never blocks a
# student from asking for help.
HelpWorld = Literal["electricity", "chemistry", "geo"]

_MAX_ID_LEN = 100
_MAX_TEXT_LEN = 300
_MAX_QUESTION_LEN = 500
_MAX_KV_ENTRIES = 12
_MAX_KV_KEY_LEN = 40
_MAX_KV_VALUE_LEN = 120
CONTEXT_SCHEMA_VERSION = 1


class HelpContextSnapshot(BaseModel):
    model_config = ConfigDict(extra="ignore")

    world: HelpWorld
    context_version: int = CONTEXT_SCHEMA_VERSION
    simulation_id: str | None = Field(default=None, max_length=_MAX_ID_LEN)
    experiment_id: str | None = Field(default=None, max_length=_MAX_ID_LEN)
    task_id: str | None = Field(default=None, max_length=_MAX_ID_LEN)
    task_title: str | None = Field(default=None, max_length=_MAX_TEXT_LEN)
    current_step: str | None = Field(default=None, max_length=_MAX_TEXT_LEN)
    progress: float | None = Field(default=None, ge=0, le=100)
    selected_object: str | None = Field(default=None, max_length=_MAX_TEXT_LEN)
    safety_state: str | None = Field(default=None, max_length=_MAX_TEXT_LEN)
    # Small, bounded key/value bags — never a raw renderer object, never a
    # full inventory/scene graph (brief §4/§32/§33). `measurements` for
    # numeric-ish readings, `extra` for everything else world-specific
    # (e.g. multimeter mode, hazard level, active GeoWorld layers).
    measurements: dict[str, str] | None = None
    extra: dict[str, str] | None = None

    @field_validator("measurements", "extra")
    @classmethod
    def _bound_kv(cls, value: dict[str, str] | None) -> dict[str, str] | None:
        if value is None:
            return value
        if len(value) > _MAX_KV_ENTRIES:
            raise ValueError(f"at most {_MAX_KV_ENTRIES} entries")
        for key, entry in value.items():
            if len(key) > _MAX_KV_KEY_LEN or len(str(entry)) > _MAX_KV_VALUE_LEN:
                raise ValueError("entry too long")
        return value


class HelpRequestCreate(BaseModel):
    conversation_id: str
    context: HelpContextSnapshot
    student_message: str | None = Field(default=None, max_length=_MAX_QUESTION_LEN)


class HelpParticipant(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    full_name: str


class HelpRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    conversation_id: str
    student: HelpParticipant
    teacher: HelpParticipant
    world: str
    context_snapshot: dict
    student_message: str | None
    status: HelpRequestStatus
    call_id: str | None
    created_at: datetime
    accepted_at: datetime | None
    resolved_at: datetime | None


class HelpCallLink(BaseModel):
    call_id: str
