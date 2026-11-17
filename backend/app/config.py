"""
Конфигурация приложения через Pydantic Settings.
Значения подтягиваются из .env, с дефолтами для локальной разработки.
"""
from pydantic import field_validator

# Параметры строки подключения, которые понимает только libpq (psycopg2),
# но не asyncpg — на них он падает, поэтому для async-движка они вырезаются.
_LIBPQ_ONLY_PARAMS = {"sslmode", "channel_binding", "gssencmode", "target_session_attrs"}
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
        psycopg2 понимает sslmode/channel_binding в строке, поэтому параметры
        тут сохраняются как есть.
        """
        return self.DATABASE_URL.replace("+asyncpg", "+psycopg2")

    @property
    def database_url_async(self) -> str:
        """
        То же подключение, но пригодное для asyncpg: он не понимает libpq-шные
        sslmode и channel_binding и падает на них с TypeError, а именно их
        дописывают к строке Neon и Supabase. Выкусываем их здесь, а сам TLS
        включается через connect_args (см. database.py и is_ssl_required).
        """
        base, _, query = self.DATABASE_URL.partition("?")
        if not query:
            return base
        kept = [p for p in query.split("&") if p.split("=")[0] not in _LIBPQ_ONLY_PARAMS]
        return base + ("?" + "&".join(kept) if kept else "")

    @property
    def is_ssl_required(self) -> bool:
        """TLS нужен, если его требовала исходная строка подключения."""
        return "sslmode=require" in self.DATABASE_URL or "sslmode=verify" in self.DATABASE_URL


settings = Settings()
