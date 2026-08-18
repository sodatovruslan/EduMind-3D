import asyncio
import smtplib
from email.message import EmailMessage

from app.config import settings

class EmailDeliveryError(RuntimeError):
    pass

def _send(email: str, code: str) -> None:
    if not settings.EMAIL_HOST_USER or not settings.EMAIL_HOST_PASSWORD:
        raise EmailDeliveryError("SMTP is not configured")
    message = EmailMessage()
    message["Subject"] = "EduMind verification code"
    message["From"] = settings.DEFAULT_FROM_EMAIL or settings.EMAIL_HOST_USER
    message["To"] = email
    message.set_content(f"Your verification code is:\n\n{code}\n\nCode expires in {settings.EMAIL_VERIFICATION_EXPIRE_MINUTES} minutes.")
    try:
        with smtplib.SMTP(settings.EMAIL_HOST, settings.EMAIL_PORT, timeout=15) as smtp:
            smtp.ehlo()
            if settings.EMAIL_USE_TLS:
                smtp.starttls()
                smtp.ehlo()
            smtp.login(settings.EMAIL_HOST_USER, settings.EMAIL_HOST_PASSWORD)
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException) as exc:
        raise EmailDeliveryError("Verification email delivery failed") from exc

async def send_verification_email(email: str, code: str) -> None:
    await asyncio.to_thread(_send, email, code)
