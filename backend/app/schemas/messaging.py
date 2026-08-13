from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.messaging import MESSAGE_MAX_LENGTH


class ConversationParticipant(BaseModel):
    id: str
    full_name: str


class ConversationCreate(BaseModel):
    # the OTHER user in the conversation — a teacher_id if the caller is a
    # student, a student_id if the caller is a teacher; which one is
    # resolved server-side from the caller's own role, see routers/messaging.py
    counterpart_id: str


class ConversationRead(BaseModel):
    id: str
    counterpart: ConversationParticipant
    created_at: datetime
    last_message_at: datetime | None
    last_message_preview: str | None


class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=MESSAGE_MAX_LENGTH)

    @field_validator("content")
    @classmethod
    def not_blank(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Message content cannot be empty")
        return trimmed


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    conversation_id: str
    sender_id: str
    content: str
    created_at: datetime


class MessagePage(BaseModel):
    messages: list[MessageRead]
    has_more: bool
