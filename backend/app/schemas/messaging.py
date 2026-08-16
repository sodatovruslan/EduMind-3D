from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.messaging import MESSAGE_MAX_LENGTH


class ConversationParticipant(BaseModel):
    id: str
    full_name: str
    # T6 — presence, scoped by construction to users you already have a
    # classroom-derived conversation with (see messaging_service.
    # conversation_to_read); there is no standalone "look up anyone's
    # presence" endpoint.
    online: bool = False
    last_seen_at: datetime | None = None


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
    # T6 — real backend-computed unread count (see messaging_service.
    # get_unread_counts, one grouped query for the whole list, no N+1).
    unread_count: int = 0
    # T6 — "sent" | "delivered" | "read", set ONLY when the conversation's
    # newest message was sent BY the current user (the small check-status
    # indicator next to your own last message in the conversation list);
    # null when the newest message is from the counterpart, or there is no
    # message yet.
    last_message_own_status: str | None = None


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
    # T6 — status is derived client-side from these two ("sent" if both
    # null, "delivered" if delivered_at set, "read" if read_at set); see
    # Message's own docstring for exactly when each is set.
    delivered_at: datetime | None = None
    read_at: datetime | None = None


class MessagePage(BaseModel):
    messages: list[MessageRead]
    has_more: bool


class MarkReadResult(BaseModel):
    message_ids: list[str]
