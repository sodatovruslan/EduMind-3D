"""
Конфигурация приложения через Pydantic Settings.
Значения подтягиваются из .env, с дефолтами для локальной разработки.
"""
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

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

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
