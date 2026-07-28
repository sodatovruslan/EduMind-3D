from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_role
from app.database import get_db
from app.models.user import User, UserRole
from app.schemas.user import UserRead, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/", response_model=list[UserRead])
def list_users(
    db: Session = Depends(get_db),
    _teacher: User = Depends(require_role(UserRole.TEACHER, UserRole.ADMIN)),
):
    # TODO: добавить пагинацию (limit/offset) и фильтр по классу, когда появится сущность Class
    return db.query(User).filter(User.role == UserRole.STUDENT).all()


@router.get("/{user_id}", response_model=UserRead)
def get_user(user_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # ученик может смотреть только себя, учитель/админ — любого
    if current_user.id != user_id and current_user.role == UserRole.STUDENT:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к этому профилю")

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    return user


@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: str,
    user_update: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.id != user_id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к этому профилю")

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    # простой partial update — обновляем только присланные поля
    if user_update.full_name is not None:
        user.full_name = user_update.full_name

    db.commit()
    db.refresh(user)
    return user
