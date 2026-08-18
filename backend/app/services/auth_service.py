"""
Бизнес-логика auth: регистрация и логин.
Роутер вызывает эти функции и просто переводит их результат в HTTP-ответы.
"""
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import hash_password, verify_password
from app.models.user import User, UserRole
from app.schemas.user import UserCreate
from app.config import settings
from datetime import datetime, timedelta
import hashlib
import hmac
import secrets


async def register_user(db: AsyncSession, user_in: UserCreate) -> User:
    email = user_in.email.strip().lower()
    existing = (await db.execute(select(User).where(func.lower(User.email) == email))).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким email уже зарегистрирован",
        )

    user = User(
        email=email,
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

def _code_hash(email: str, code: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), f"{email}:{code}".encode(), hashlib.sha256).hexdigest()

async def issue_verification_code(db: AsyncSession, user: User) -> str:
    code = f"{secrets.randbelow(1_000_000):06d}"
    now = datetime.utcnow()
    user.email_verification_code_hash = _code_hash(user.email, code)
    user.email_verification_expires_at = now + timedelta(minutes=settings.EMAIL_VERIFICATION_EXPIRE_MINUTES)
    user.email_verification_sent_at = now
    user.email_verification_attempts = 0
    await db.commit()
    return code

async def find_user_by_email(db: AsyncSession, email: str) -> User | None:
    return (await db.execute(select(User).where(func.lower(User.email) == email.strip().lower()))).scalar_one_or_none()

async def verify_email_code(db: AsyncSession, email: str, code: str) -> User:
    user = await find_user_by_email(db, email)
    if not user:
        raise HTTPException(status_code=400, detail={"code": "INVALID_VERIFICATION_CODE"})
    if user.email_verified:
        return user
    now = datetime.utcnow()
    if not user.email_verification_code_hash or not user.email_verification_expires_at or user.email_verification_expires_at < now:
        raise HTTPException(status_code=400, detail={"code": "VERIFICATION_CODE_EXPIRED"})
    if user.email_verification_attempts >= settings.EMAIL_VERIFICATION_MAX_ATTEMPTS:
        user.email_verification_code_hash = None
        await db.commit()
        raise HTTPException(status_code=429, detail={"code": "VERIFICATION_ATTEMPTS_EXCEEDED"})
    if not hmac.compare_digest(user.email_verification_code_hash, _code_hash(user.email, code)):
        user.email_verification_attempts += 1
        if user.email_verification_attempts >= settings.EMAIL_VERIFICATION_MAX_ATTEMPTS:
            user.email_verification_code_hash = None
            await db.commit()
            raise HTTPException(status_code=429, detail={"code": "VERIFICATION_ATTEMPTS_EXCEEDED"})
        await db.commit()
        raise HTTPException(status_code=400, detail={"code": "INVALID_VERIFICATION_CODE"})
    user.email_verified = True
    user.email_verification_code_hash = None
    user.email_verification_expires_at = None
    user.email_verification_attempts = 0
    await db.commit()
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
    user = await find_user_by_email(db, email)

    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.email_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"code": "EMAIL_NOT_VERIFIED", "email": user.email})
    return user
