from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.user import UserRead

ClassroomStatus = Literal["active", "archived"]


class ClassroomCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    teacher_id: str | None = None

    @field_validator("name")
    @classmethod
    def name_is_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Classroom name cannot be blank")
        return value


class ClassroomUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    status: ClassroomStatus | None = None

    @field_validator("name")
    @classmethod
    def name_is_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Classroom name cannot be blank")
        return value

    @model_validator(mode="after")
    def at_least_one_field(self):
        if self.name is None and self.status is None:
            raise ValueError("At least one field must be provided")
        return self


class ClassroomRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    teacher_id: str
    name: str
    status: ClassroomStatus
    created_at: datetime
    updated_at: datetime
    student_count: int = 0


class MembershipCreate(BaseModel):
    student_id: str


class MembershipRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    class_id: str
    student_id: str
    joined_at: datetime
    removed_at: datetime | None


class ClassStudentRead(UserRead):
    membership: MembershipRead


class AvailableStudentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    full_name: str
    email: str
