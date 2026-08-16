import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base


class Classroom(Base):
    __tablename__ = "classrooms"
    __table_args__ = (
        CheckConstraint("status IN ('active', 'archived')", name="ck_classrooms_status"),
        Index("ix_classrooms_teacher_status", "teacher_id", "status"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    teacher_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    status = Column(String(20), nullable=False, default="active")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    teacher = relationship("User", back_populates="owned_classrooms", foreign_keys=[teacher_id])
    memberships = relationship("ClassMembership", back_populates="classroom", cascade="all, delete-orphan")


class ClassMembership(Base):
    __tablename__ = "class_memberships"
    __table_args__ = (
        UniqueConstraint("class_id", "student_id", name="uq_class_memberships_class_student"),
        Index("ix_class_memberships_class_active", "class_id", "removed_at"),
        Index("ix_class_memberships_student_active", "student_id", "removed_at"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    class_id = Column(String(36), ForeignKey("classrooms.id"), nullable=False)
    student_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    joined_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    removed_at = Column(DateTime, nullable=True)

    classroom = relationship("Classroom", back_populates="memberships")
    student = relationship("User", back_populates="class_memberships", foreign_keys=[student_id])
