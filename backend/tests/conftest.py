"""
Тестовая БД — отдельная in-memory SQLite, чтобы тесты не трогали
дев-базу edumind.db и не зависели друг от друга по состоянию.
StaticPool нужен, потому что ":memory:" по умолчанию живет только
в рамках одного соединения, а TestClient дергает несколько.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture()
def db_session():
    """
    Отдает ту же сессию, что использует API внутри теста — это позволяет
    сидировать данные (например, Simulation) прямо в теле теста и сразу
    видеть их через HTTP-запросы клиента, без плясок с commit/refresh
    между независимыми сессиями.
    """
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
