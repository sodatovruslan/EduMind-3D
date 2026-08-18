from pydantic import BaseModel, EmailStr, Field, field_validator


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str

class EmailPayload(BaseModel):
    email: EmailStr
    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()

class VerifyEmailRequest(EmailPayload):
    code: str = Field(pattern=r"^\d{6}$")

class VerificationResponse(BaseModel):
    verified: bool
    message: str
    cooldown_seconds: int = 0
