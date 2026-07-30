"""
Learning Profile (Stage 4) — персональный прогресс ученика. Хранятся
только "необратимые" факты прогресса (XP/уровень/список пройденных
задач/лабораторных/ачивок) — статистика (accuracy, средние по
подсказкам/попыткам, сильные/слабые темы, серия без ошибок) каждый раз
пересчитывается заново из LearningEvent в progress_service.py, чтобы не
плодить рассинхронизирующиеся "средние по среднему" поля.
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship

from app.database import Base


class LearningProfile(Base):
    __tablename__ = "learning_profiles"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, unique=True)

    level = Column(Integer, nullable=False, default=1)
    xp = Column(Integer, nullable=False, default=0)
    completed_tasks = Column(JSON, nullable=False, default=list)  # уникальные task_id, когда-либо пройденные
    completed_labs = Column(Integer, nullable=False, default=0)
    last_completed_lab = Column(String(36), nullable=True)  # simulation_id
    achievements = Column(JSON, nullable=False, default=list)  # разблокированные коды ачивок
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="learning_profile")
