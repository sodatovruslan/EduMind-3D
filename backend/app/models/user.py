"""
Модель User.

UUID хранится как String(36), а не через Postgres-специфичный UUID тип —
так модель остается портируемой между SQLite (dev) и Postgres (prod)
без двух веток кода. Цена — небольшая потеря производительности индекса,
для MVP-масштаба это несущественно.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, String, Enum, DateTime, Integer
from sqlalchemy.orm import relationship

from app.database import Base


class UserRole(str, enum.Enum):
    STUDENT = "student"
    TEACHER = "teacher"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.STUDENT)
    created_at = Column(DateTime, default=datetime.utcnow)
    email_verified = Column(Boolean, nullable=False, default=False, server_default="false")
    email_verification_code_hash = Column(String(64), nullable=True)
    email_verification_expires_at = Column(DateTime, nullable=True)
    email_verification_sent_at = Column(DateTime, nullable=True)
    email_verification_attempts = Column(Integer, nullable=False, default=0, server_default="0")
    # T6 — persisted presence: written ONLY on the online->offline transition
    # (last WebSocket connection for this user closing), never on a timer
    # and never per-connection-open, so this survives a backend restart
    # without turning into a per-second write. While the user has at least
    # one open connection, presence is "online" (derived live from
    # app.core.ws_manager.presence, not from this column) and this value is
    # simply stale-but-harmless, since the frontend only displays it when
    # the user is currently offline.
    last_seen_at = Column(DateTime, nullable=True)

    lab_results = relationship("LabResult", back_populates="user", cascade="all, delete-orphan")
    ai_logs = relationship("AILog", back_populates="user", cascade="all, delete-orphan")
    learning_profile = relationship(
        "LearningProfile", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    learning_events = relationship("LearningEvent", back_populates="user", cascade="all, delete-orphan")
    chemistry_saves = relationship("ChemistrySave", back_populates="user", cascade="all, delete-orphan")
    owned_classrooms = relationship(
        "Classroom", back_populates="teacher", foreign_keys="Classroom.teacher_id"
    )
    class_memberships = relationship(
        "ClassMembership", back_populates="student", foreign_keys="ClassMembership.student_id"
    )
    conversations_as_teacher = relationship(
        "Conversation", back_populates="teacher", foreign_keys="Conversation.teacher_id", cascade="all, delete-orphan"
    )
    conversations_as_student = relationship(
        "Conversation", back_populates="student", foreign_keys="Conversation.student_id", cascade="all, delete-orphan"
    )
