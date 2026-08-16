"""
T7 — Student <-> Teacher call SIGNALING foundation. This is lifecycle
state only (ringing/accepted/declined/...) — no WebRTC, no SDP/ICE, no
media of any kind. That's explicitly out of scope for T7 (future T8).

One Call per attempt, scoped to a Conversation (same pairing messaging
already uses — a call is always between the two participants of an
existing, classroom-authorized Conversation, never an arbitrary pair).
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Index, String
from sqlalchemy.orm import relationship

from app.database import Base


class CallType(str, enum.Enum):
    AUDIO = "audio"
    VIDEO = "video"


class CallStatus(str, enum.Enum):
    RINGING = "ringing"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    CANCELLED = "cancelled"
    MISSED = "missed"
    ENDED = "ended"


# The only two statuses that count as "this call currently occupies its
# participants' one-active-call slot" — see Call.active_conversation_id.
ACTIVE_CALL_STATUSES = (CallStatus.RINGING, CallStatus.ACCEPTED)

# Allowed status transitions — enforced server-side in call_service.py,
# never trusted from the client. Deliberately NOT a generic
# PATCH-any-status endpoint (brief §24): each transition has its own
# explicit action/endpoint, this table is what those actions are allowed
# to produce.
ALLOWED_TRANSITIONS: dict[CallStatus, set[CallStatus]] = {
    CallStatus.RINGING: {CallStatus.ACCEPTED, CallStatus.DECLINED, CallStatus.CANCELLED, CallStatus.MISSED},
    CallStatus.ACCEPTED: {CallStatus.ENDED},
}


class Call(Base):
    __tablename__ = "calls"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id = Column(String(36), ForeignKey("conversations.id"), nullable=False)
    caller_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    callee_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    call_type = Column(Enum(CallType), nullable=False)
    status = Column(Enum(CallStatus), nullable=False, default=CallStatus.RINGING)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    answered_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    # Race-safe "at most one active (ringing/accepted) call per
    # conversation" — set to `conversation_id` while RINGING or ACCEPTED,
    # cleared to NULL on any terminal transition. A plain UNIQUE
    # constraint on a nullable column is the portable way to express a
    # partial-uniqueness rule identically on Postgres AND SQLite (both
    # treat multiple NULLs as non-conflicting) — deliberately NOT a
    # dialect-specific partial index with a raw `status IN (...)` WHERE
    # clause, since SQLAlchemy's `Enum` stores the Python member NAME
    # ("RINGING"), not `.value` ("ringing"), and hardcoding that
    # representation into a raw SQL fragment is exactly the kind of thing
    # that quietly breaks if the enum ever changes.
    active_conversation_id = Column(String(36), ForeignKey("conversations.id"), nullable=True, unique=True)

    conversation = relationship("Conversation", foreign_keys=[conversation_id])
    caller = relationship("User", foreign_keys=[caller_id])
    callee = relationship("User", foreign_keys=[callee_id])

    __table_args__ = (
        Index("ix_calls_conversation_created", "conversation_id", "created_at"),
        Index("ix_calls_caller", "caller_id"),
        Index("ix_calls_callee", "callee_id"),
    )
