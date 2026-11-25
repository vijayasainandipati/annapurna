import os
import secrets
from typing import List
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Annapurna — Order-to-Audit System"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    APP_ENV: str = os.getenv("APP_ENV", "development")

    # Database
    DB_HOST: str = os.getenv("DB_HOST", "127.0.0.1")
    DB_PORT: int = int(os.getenv("DB_PORT", "5433"))
    DB_USER: str = os.getenv("DB_USER", "postgres")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "")
    DB_NAME: str = os.getenv("DB_NAME", "annapurna")

    @property
    def DATABASE_URL(self) -> str:
        override = os.getenv("DATABASE_URL")
        if override:
            return override
        pwd = f":{self.DB_PASSWORD}" if self.DB_PASSWORD else ""
        return f"postgresql+asyncpg://{self.DB_USER}{pwd}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    @property
    def DATABASE_URL_SYNC(self) -> str:
        pwd = f":{self.DB_PASSWORD}" if self.DB_PASSWORD else ""
        return f"postgresql+psycopg2://{self.DB_USER}{pwd}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    # Security: explicit env var required in production; ephemeral key generated for local dev/test
    SECRET_KEY: str = os.getenv("SECRET_KEY", "")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    @model_validator(mode="after")
    def validate_secret_key(self) -> "Settings":
        if not self.SECRET_KEY:
            if self.APP_ENV.lower() == "production":
                raise ValueError("SECRET_KEY environment variable must be set when APP_ENV=production")
            self.SECRET_KEY = secrets.token_urlsafe(32)
        return self

    # Redis
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]

    model_config = SettingsConfigDict(env_file=".env", extra="allow")


settings = Settings()
