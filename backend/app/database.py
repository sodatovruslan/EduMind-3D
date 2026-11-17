"""
Настройка async SQLAlchemy engine/session (asyncpg в проде).

connect_args нужен только для SQLite (используется тестами через aiosqlite):
разрешает работу из разных потоков, т.к. FastAPI может дергать сессию не
из того же треда, где создан engine.
"""
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base

from app.config import settings

if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
elif settings.is_ssl_required:
    # Managed-Postgres (Neon, Supabase, Render) требует TLS. asyncpg задаёт его
    # аргументом ssl, а не параметром sslmode в URL — тот из строки вырезан,
    # иначе драйвер падает ещё до первого подключения.
    connect_args = {"ssl": "require"}
else:
    connect_args = {}

engine = create_async_engine(settings.database_url_async, connect_args=connect_args)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, autocommit=False, autoflush=False, expire_on_commit=False)

Base = declarative_base()


async def get_db():
    """Dependency для роутеров: выдает async-сессию и гарантированно закрывает её."""
    async with SessionLocal() as db:
        yield db


def get_session_factory():
    """T6 — yields the session FACTORY (not an active session). Used by
    routers/ws_messaging.py's disconnect-time last_seen write: that write
    happens after the connection's own request-scoped session may already
    be winding down (a client-initiated close races the server task's own
    cancellation), so it needs a genuinely independent session rather than
    reusing `db` from `Depends(get_db)`. Overridden in tests the same way
    `get_db` is, so the independent session still lands in the test
    database instead of the real one."""
    return SessionLocal
