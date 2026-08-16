"""
Бизнес-логика auth: регистрация и логин.
Роутер вызывает эти функции и просто переводит их результат в HTTP-ответы.
"""
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

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


async def cleanup_test_students(db: AsyncSession) -> int:
    """
    Dev-only: purges disposable @example.com student accounts that E2E specs
    create via POST /register and never delete themselves (see
    frontend/e2e/**). Scoped to role=STUDENT + "@example.com" only — every
    real account in this app uses a different domain, so this can never
    remove a genuine user. Deletes via ORM session.delete() (not raw SQL) so
    the cascade="all, delete-orphan" relationships on User are honored.
    """
    result = await db.execute(
        select(User)
        .options(
            selectinload(User.lab_results),
            selectinload(User.ai_logs),
            selectinload(User.learning_profile),
            selectinload(User.learning_events),
            selectinload(User.chemistry_saves),
        )
        .where(User.role == UserRole.STUDENT, User.email.like("%@example.com"))
    )
    students = result.scalars().all()
    for student in students:
        await db.delete(student)
    await db.commit()
    return len(students)


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User:
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()

    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user
