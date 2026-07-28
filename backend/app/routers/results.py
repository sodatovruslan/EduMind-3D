from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_role
from app.database import get_db
from app.models.lab_result import LabResult
from app.models.user import User, UserRole
from app.schemas.lab_result import LabResultRead

router = APIRouter(prefix="/api/results", tags=["results"])


@router.get("/me", response_model=list[LabResultRead])
def my_results(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(LabResult).filter(LabResult.user_id == current_user.id).all()


@router.get("/student/{user_id}", response_model=list[LabResultRead])
def student_results(
    user_id: str,
    db: Session = Depends(get_db),
    _teacher: User = Depends(require_role(UserRole.TEACHER, UserRole.ADMIN)),
):
    return db.query(LabResult).filter(LabResult.user_id == user_id).all()


@router.get("/{result_id}", response_model=LabResultRead)
def get_result(
    result_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = db.query(LabResult).filter(LabResult.id == result_id).first()
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Результат не найден")

    if result.user_id != current_user.id and current_user.role == UserRole.STUDENT:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к этому результату")

    return result
