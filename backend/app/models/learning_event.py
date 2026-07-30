"""
Learning Event (Stage 4) — append-only история обучения: завершенные
задачи, конкретные ошибки, завершенные лабораторные, разблокированные
ачивки. Это единственный источник правды для всей статистики Learning
Profile (accuracy, средние, сильные/слабые темы, серии) — ничего не
пересчитывается "на глаз", только запросами к этой таблице.
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship

from app.database import Base


class LearningEvent(Base):
    __tablename__ = "learning_events"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    # task_completed | task_attempt | mistake | lab_completed | achievement_earned
    event_type = Column(String(30), nullable=False)
    payload = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="learning_events")
