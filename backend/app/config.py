"""
Конфигурация приложения через Pydantic Settings.
Значения подтягиваются из .env, с дефолтами для локальной разработки.
"""
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "EduMind 3D"
    ENVIRONMENT: str = "development"

    # async-драйвер (asyncpg) для рантайма приложения
    DATABASE_URL: str = "postgresql+asyncpg://postgres:2211@localhost:5432/edumind"

    SECRET_KEY: str = "change-me-in-prod-please"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    CORS_ORIGINS: str = "http://localhost:3000"

    OPENAI_API_KEY: str | None = None
    GEMINI_API_KEY: str | None = None
    EMAIL_HOST: str = "smtp.gmail.com"
    EMAIL_PORT: int = 587
    EMAIL_USE_TLS: bool = True
    EMAIL_HOST_USER: str | None = None
    EMAIL_HOST_PASSWORD: str | None = None
    DEFAULT_FROM_EMAIL: str | None = None
    EMAIL_VERIFICATION_EXPIRE_MINUTES: int = 10
    EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS: int = 60
    EMAIL_VERIFICATION_MAX_ATTEMPTS: int = 5
    # Демо-режим: новые аккаунты создаются сразу подтверждёнными, без кода
    # на почту. Нужен только там, где SMTP не подключен (пилот/демо-стенд) —
    # в реальном проде это должно быть false, иначе регистрация никак не
    # доказывает, что человек владеет указанным email.
    AUTO_VERIFY_EMAIL: bool = False

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @field_validator("DATABASE_URL", mode="after")
    @classmethod
    def ensure_async_driver(cls, value: str) -> str:
        """
        Managed-хостинги (Railway, Render, Heroku) прокидывают DATABASE_URL
        в виде postgres:// или postgresql:// — без драйвера. create_async_engine
        на такой строке падает, т.к. по умолчанию берёт синхронный psycopg2.
        Дописываем +asyncpg сами, чтобы деплой не требовал ручной правки
        переменной (её значение подставляется хостингом автоматически).
        """
        if value.startswith("postgres://"):
            return "postgresql+asyncpg://" + value[len("postgres://"):]
        if value.startswith("postgresql://"):
            return "postgresql+asyncpg://" + value[len("postgresql://"):]
        return value

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def database_url_sync(self) -> str:
        """
        Alembic-миграции гоняются синхронно (это норма даже для async-приложений —
        миграциям не нужен event loop), поэтому им нужен sync-драйвер, а не asyncpg.
        """
        return self.DATABASE_URL.replace("+asyncpg", "+psycopg2")


settings = Settings()
