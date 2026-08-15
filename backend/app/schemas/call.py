from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.call import CallStatus, CallType


class CallParticipant(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    full_name: str


class CallCreate(BaseModel):
    conversation_id: str
    call_type: CallType


class CallRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    conversation_id: str
    caller: CallParticipant
    callee: CallParticipant
    call_type: CallType
    status: CallStatus
    created_at: datetime
    answered_at: datetime | None
    ended_at: datetime | None
