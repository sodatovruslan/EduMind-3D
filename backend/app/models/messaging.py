"""
T5 — Student ↔ Teacher human messaging (NOT the AI Teacher/AI Assistant
chat — those are stateless-per-session LLM calls logged in `AILog`, a
completely different concern from a real conversation between two real
users). One Conversation per (teacher_id, student_id) PAIR, never per
Classroom — a student sharing several classes with the same teacher still
gets exactly one conversation (documented decision, see
EDUMIND_DESIGN_SYSTEM_V2.md / roadmap T5 notes). Authorization (can this
teacher/student pair message at all) is enforced at the API layer via
app/core/classroom_scope.py, re-checked on every read/write — not encoded
as a DB constraint here, since classroom membership can change after a
conversation already exists.
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base

MESSAGE_MAX_LENGTH = 4000


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (
        UniqueConstraint("teacher_id", "student_id", name="uq_conversations_teacher_student"),
        Index("ix_conversations_teacher", "teacher_id"),
        Index("ix_conversations_student", "student_id"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    teacher_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    student_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    # Денормализовано намеренно: список бесед — частый запрос, и без этого
    # пришлось бы делать отдельный подзапрос "последнее сообщение" на каждую
    # беседу (см. явный запрет на N+1 в брифе T5). Обновляется в одной
    # транзакции с созданием сообщения (messaging_service.py).
    last_message_at = Column(DateTime, nullable=True)
    last_message_preview = Column(String(200), nullable=True)

    teacher = relationship("User", foreign_keys=[teacher_id], back_populates="conversations_as_teacher")
    student = relationship("User", foreign_keys=[student_id], back_populates="conversations_as_student")
    messages = relationship(
        "Message", back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at"
    )


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (Index("ix_messages_conversation_created", "conversation_id", "created_at"),)

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id = Column(String(36), ForeignKey("conversations.id"), nullable=False)
    sender_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    content = Column(String(MESSAGE_MAX_LENGTH), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    conversation = relationship("Conversation", back_populates="messages")
    sender = relationship("User")
