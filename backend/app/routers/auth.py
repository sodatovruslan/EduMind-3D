"""
Роутер аутентификации: /register, /login, /refresh, /me.

Для /login используем стандартную FastAPI-форму OAuth2PasswordRequestForm
(поле "username" в форме = наш email) — это дает бесплатную совместимость
с кнопкой "Authorize" в Swagger UI (/docs), т.к. она ожидает именно
grant_type=password form-data, а не произвольный JSON.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.database import get_db
from app.models.user import User
from app.schemas.auth import RefreshRequest, Token
from app.schemas.user import UserCreate, UserRead
from app.services.auth_service import authenticate_user, register_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _issue_tokens(user_id: str) -> Token:
    return Token(
        access_token=create_access_token(user_id),
        refresh_token=create_refresh_token(user_id),
    )


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    user = await register_user(db, user_in)
    return user


@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    user = await authenticate_user(db, email=form_data.username, password=form_data.password)
    return _issue_tokens(user.id)


@router.post("/refresh", response_model=Token)
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        user_id = decode_token(payload.refresh_token, expected_type="refresh")
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Невалидный или просроченный refresh-токен",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Пользователь не найден")

    return _issue_tokens(user.id)


@router.get("/me", response_model=UserRead)
async def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user
