"""
Тестовая БД — отдельная in-memory SQLite (через aiosqlite), чтобы тесты не
трогали дев-базу Postgres и не зависели друг от друга по состоянию.
StaticPool нужен, потому что ":memory:" по умолчанию живет только в рамках
одного соединения, а несколько запросов внутри теста иначе получали бы
разные пустые базы.
"""
import pytest_asyncio
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db, get_session_factory
from app.main import app
from app.routers import auth as auth_router
from app.services.auth_service import find_user_by_email

engine = create_async_engine(
    "sqlite+aiosqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = async_sessionmaker(engine, autocommit=False, autoflush=False, expire_on_commit=False)


@pytest.fixture(autouse=True)
def capture_verification_email(monkeypatch, db_session):
    """Keep legacy API tests authenticated without sending real email.

    Auth-specific tests shadow this fixture and exercise the unverified state.
    """
    sent = {}
    authenticate = auth_router.authenticate_user

    async def fake_send(email, code):
        sent[email] = code

    async def authenticate_legacy_test_user(db, email, password):
        user = await find_user_by_email(db_session, email)
        if user:
            user.email_verified = True
            await db_session.commit()
        return await authenticate(db, email, password)

    monkeypatch.setattr(auth_router, "send_verification_email", fake_send)
    monkeypatch.setattr(auth_router, "authenticate_user", authenticate_legacy_test_user)
    return sent


@pytest_asyncio.fixture()
async def db_session():
    """
    Отдает ту же сессию, что использует API внутри теста — это позволяет
    сидировать данные (например, Simulation) прямо в теле теста и сразу
    видеть их через HTTP-запросы клиента, без плясок с commit/refresh
    между независимыми сессиями.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session = TestingSessionLocal()
    try:
        yield session
    finally:
        await session.close()
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture()
async def client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_session_factory] = lambda: TestingSessionLocal
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
