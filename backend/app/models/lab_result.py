import uuid
from datetime import datetime

from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship

from app.database import Base


class LabResult(Base):
    __tablename__ = "lab_results"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    simulation_id = Column(String(36), ForeignKey("simulations.id"), nullable=False)
    actions_log = Column(JSON, nullable=False, default=list)
    score = Column(Float, nullable=True)
    feedback = Column(JSON, nullable=True)
    duration_seconds = Column(Integer, nullable=False, default=0)
    completed_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="lab_results")
    simulation = relationship("Simulation", back_populates="lab_results")

    @property
    def simulation_title(self) -> str:
        return self.simulation.title
