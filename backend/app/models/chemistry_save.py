import uuid
from datetime import datetime

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship

from app.database import Base


class ChemistrySave(Base):
    __tablename__ = "chemistry_saves"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    simulation_id = Column(String(36), ForeignKey("simulations.id"), nullable=True, index=True)
    experiment_id = Column(String(100), nullable=True, index=True)

    schema_version = Column(String(20), nullable=False, default="1.0")
    revision = Column(Integer, nullable=False, default=1)
    status = Column(String(20), nullable=False, default="active", index=True)
    idempotency_key = Column(String(64), nullable=True, unique=True, index=True)

    snapshot = Column(JSON, nullable=False, default=dict)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False, index=True)
    last_autosaved_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="chemistry_saves")
