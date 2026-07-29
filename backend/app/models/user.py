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

from sqlalchemy import Column, String, Enum, DateTime
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

    lab_results = relationship("LabResult", back_populates="user", cascade="all, delete-orphan")
    ai_logs = relationship("AILog", back_populates="user", cascade="all, delete-orphan")
