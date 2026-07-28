import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Integer, DateTime, Enum, JSON
from sqlalchemy.orm import relationship

from app.database import Base


class SimulationModule(str, enum.Enum):
    SIMLAB = "simlab"
    BIOBODY = "biobody"
    GEO3D = "geo3d"


class Simulation(Base):
    __tablename__ = "simulations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(255), nullable=False)
    module = Column(Enum(SimulationModule), nullable=False)
    subject = Column(String(100), nullable=False)
    # config хранит сценарий: эталонные шаги для Auto-Grader (expected_steps),
    # параметры сцены для фронтенда и т.д. — гибкая JSON-структура,
    # т.к. набор полей сильно отличается между simlab/biobody/geo3d.
    config = Column(JSON, nullable=False, default=dict)
    difficulty = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    lab_results = relationship("LabResult", back_populates="simulation", cascade="all, delete-orphan")
    ai_logs = relationship("AILog", back_populates="simulation", cascade="all, delete-orphan")
