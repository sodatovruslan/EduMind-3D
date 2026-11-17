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

from app.config import settings
from app.core.deps import get_current_user
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.database import get_db
from app.models.user import User
from app.schemas.auth import EmailPayload, RefreshRequest, Token, VerificationResponse, VerifyEmailRequest
from app.schemas.user import UserCreate, UserRead
from app.services.auth_service import authenticate_user, cleanup_test_students, find_user_by_email, issue_verification_code, register_user, verify_email_code
from app.services.email_service import EmailDeliveryError, send_verification_email
from datetime import datetime

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _issue_tokens(user_id: str) -> Token:
    return Token(
        access_token=create_access_token(user_id),
        refresh_token=create_refresh_token(user_id),
    )


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    user = await register_user(db, user_in)
    if settings.AUTO_VERIFY_EMAIL:
        # Демо-стенд без SMTP: подтверждаем сразу, иначе /login вернёт 403
        # EMAIL_NOT_VERIFIED и войти будет нельзя вообще никак. Код не
        # выпускаем и письмо не отправляем — подтверждать нечего.
        user.email_verified = True
        await db.commit()
        await db.refresh(user)
        return user
    code = await issue_verification_code(db, user)
    try:
        await send_verification_email(user.email, code)
    except EmailDeliveryError:
        user.email_verification_sent_at = None
        await db.commit()
        raise HTTPException(status_code=503, detail={"code": "VERIFICATION_EMAIL_FAILED", "email": user.email})
    return user

@router.post("/verify-email", response_model=VerificationResponse)
async def verify_email(payload: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    user = await verify_email_code(db, payload.email, payload.code)
    return VerificationResponse(verified=user.email_verified, message="EMAIL_VERIFIED")

@router.post("/resend-verification", response_model=VerificationResponse)
async def resend_verification(payload: EmailPayload, db: AsyncSession = Depends(get_db)):
    user = await find_user_by_email(db, payload.email)
    if not user or user.email_verified:
        return VerificationResponse(verified=bool(user and user.email_verified), message="VERIFICATION_SENT", cooldown_seconds=settings.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS)
    if user.email_verification_sent_at:
        elapsed = (datetime.utcnow() - user.email_verification_sent_at).total_seconds()
        if elapsed < settings.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS:
            raise HTTPException(status_code=429, detail={"code": "RESEND_COOLDOWN", "retry_after": int(settings.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS - elapsed) + 1})
    code = await issue_verification_code(db, user)
    try:
        await send_verification_email(user.email, code)
    except EmailDeliveryError:
        user.email_verification_sent_at = None
        await db.commit()
        raise HTTPException(status_code=503, detail={"code": "VERIFICATION_EMAIL_FAILED"})
    return VerificationResponse(verified=False, message="VERIFICATION_SENT", cooldown_seconds=settings.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS)


@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    user = await authenticate_user(db, email=form_data.username, password=form_data.password)
    if not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "EMAIL_NOT_VERIFIED", "email": user.email},
        )

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
    if not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "EMAIL_NOT_VERIFIED", "email": user.email},
        )

    return _issue_tokens(user.id)


@router.get("/me", response_model=UserRead)
async def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/dev/cleanup-test-users")
async def cleanup_test_users(db: AsyncSession = Depends(get_db)):
    """
    Dev-only. 404s outside ENVIRONMENT=development so this never exists as
    an attack surface in prod. Called by Playwright's global teardown
    (frontend/e2e/global-teardown.ts) after each E2E run so throwaway
    @example.com accounts stop accumulating in the dev database (see D7
    stage A cleanup — 407 such accounts had built up before this existed).
    """
    if settings.ENVIRONMENT != "development":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    deleted = await cleanup_test_students(db)
    return {"deleted": deleted}
