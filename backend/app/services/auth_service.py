"""
Бизнес-логика auth: регистрация и логин.
Роутер вызывает эти функции и просто переводит их результат в HTTP-ответы.
"""
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.models.user import User, UserRole
from app.schemas.user import UserCreate


async def register_user(db: AsyncSession, user_in: UserCreate) -> User:
    existing = (await db.execute(select(User).where(User.email == user_in.email))).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким email уже зарегистрирован",
        )

    user = User(
        email=user_in.email,
        hashed_password=hash_password(user_in.password),
        full_name=user_in.full_name,
        role=UserRole.STUDENT,
    )

    db.add(user)
    try:
        await db.commit()
    except IntegrityError:
        # подстраховка от гонки: два одновременных запроса с одним email
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким email уже зарегистрирован",
        )

    await db.refresh(user)
    return user


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User:
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()

    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user
