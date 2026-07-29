"""
Настройка async SQLAlchemy engine/session (asyncpg в проде).

connect_args нужен только для SQLite (используется тестами через aiosqlite):
разрешает работу из разных потоков, т.к. FastAPI может дергать сессию не
из того же треда, где создан engine.
"""
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base

from app.config import settings

connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}

engine = create_async_engine(settings.DATABASE_URL, connect_args=connect_args)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, autocommit=False, autoflush=False, expire_on_commit=False)

Base = declarative_base()


async def get_db():
    """Dependency для роутеров: выдает async-сессию и гарантированно закрывает её."""
    async with SessionLocal() as db:
        yield db
