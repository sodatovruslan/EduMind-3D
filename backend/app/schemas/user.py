from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, ConfigDict

from app.models.user import UserRole


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=255)
    # role сознательно отсутствует в публичной схеме регистрации:
    # иначе клиент мог бы прислать role="admin" и выдать себе права.
    # Роль всегда проставляется сервисом как STUDENT; учителей/админов
    # заводит отдельный привилегированный эндпоинт (вне MVP Дня 1).


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    full_name: str
    role: UserRole
    created_at: datetime


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
