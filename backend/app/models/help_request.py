"""
T10 — Student -> Teacher CONTEXTUAL HELP requests ("Ask Teacher" from
inside a lab). Always scoped to an existing, classroom-authorized
Conversation (same pairing messaging/calls already use — never an
arbitrary student/teacher pair, see routers/help.py).

This is a request-for-help lifecycle, NOT a second messaging system and
NOT a helpdesk/ticketing subsystem: no priorities, no queues, no
assignment routing — one student, their own teacher, one lab moment.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Index, JSON, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class HelpRequestStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    RESOLVED = "resolved"
    CANCELLED = "cancelled"


# The two statuses that count as "this student already has a live help
# request for this conversation+world" — mirrors Call's own
# ACTIVE_CALL_STATUSES (models/call.py) exactly: a request stays "in the
# way" of a new one while it's still awaiting a teacher's action OR while
# help is actively in progress, only clearing once genuinely closed out.
ACTIVE_HELP_STATUSES = (HelpRequestStatus.PENDING, HelpRequestStatus.ACCEPTED)

# Allowed status transitions — enforced server-side in help_service.py,
# never trusted from the client (same explicit-actions-only philosophy as
# ALLOWED_TRANSITIONS in models/call.py — no generic PATCH {status: ...}).
ALLOWED_HELP_TRANSITIONS: dict[HelpRequestStatus, set[HelpRequestStatus]] = {
    HelpRequestStatus.PENDING: {HelpRequestStatus.ACCEPTED, HelpRequestStatus.DECLINED, HelpRequestStatus.CANCELLED},
    HelpRequestStatus.ACCEPTED: {HelpRequestStatus.RESOLVED},
}


class HelpRequest(Base):
    __tablename__ = "help_requests"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id = Column(String(36), ForeignKey("conversations.id"), nullable=False)
    student_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    teacher_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    # Free-form but backend-whitelisted world slug (see schemas/help.py's
    # HelpWorld literal) — kept as a plain string column (not a DB enum)
    # since new worlds are expected to be added over time and a DB enum
    # would need its own migration for that; the Pydantic schema is what
    # actually constrains the allowed values at the API boundary.
    world = Column(String(20), nullable=False)
    # Typed, size-bounded, whitelisted-field JSON — see schemas/help.py's
    # HelpContextSnapshot, which is what actually validates this before it
    # ever reaches here. A REQUEST-TIME snapshot (brief §15): frozen at
    # creation, never silently overwritten by a later "current state".
    context_snapshot = Column(JSON, nullable=False)
    student_message = Column(Text, nullable=True)
    status = Column(Enum(HelpRequestStatus), nullable=False, default=HelpRequestStatus.PENDING)
    # Optional link to the EXISTING T7/T8/T9 call flow (brief §17/§18) —
    # set once the teacher starts (or joins) a call for this request; the
    # call itself remains fully owned by calls.py/call_service.py, this is
    # just a pointer for the request's own history view.
    call_id = Column(String(36), ForeignKey("calls.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    accepted_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    # At most one ACTIVE (pending/accepted) help request per
    # (conversation, world) — the exact same portable nullable-unique-
    # column race guard as Call.active_conversation_id (see that model's
    # own docstring for why this isn't a dialect-specific partial index).
    # Set to "{conversation_id}:{world}" while active, cleared to NULL on
    # any terminal transition.
    active_key = Column(String(64), nullable=True, unique=True)

    conversation = relationship("Conversation", foreign_keys=[conversation_id])
    student = relationship("User", foreign_keys=[student_id])
    teacher = relationship("User", foreign_keys=[teacher_id])
    call = relationship("Call", foreign_keys=[call_id])

    __table_args__ = (
        Index("ix_help_requests_conversation_created", "conversation_id", "created_at"),
        Index("ix_help_requests_teacher_status", "teacher_id", "status"),
        Index("ix_help_requests_student_status", "student_id", "status"),
    )
