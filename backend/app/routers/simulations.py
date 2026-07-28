from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.lab_result import LabResult
from app.models.simulation import Simulation, SimulationModule
from app.models.user import User
from app.schemas.lab_result import LabResultRead
from app.schemas.simulation import (
    SimulationActionRequest,
    SimulationActionResponse,
    SimulationCompleteRequest,
    SimulationRead,
)
from app.services.geo3d_engine import compute_shape_metrics
from app.services.grader_service import compute_score
from app.services.simulation_engine import compute_reaction

router = APIRouter(prefix="/api/simulations", tags=["simulations"])


@router.get("/", response_model=list[SimulationRead])
def list_simulations(
    module: SimulationModule | None = None,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    query = db.query(Simulation)
    if module:
        query = query.filter(Simulation.module == module)
    return query.all()


@router.get("/{simulation_id}", response_model=SimulationRead)
def get_simulation(
    simulation_id: str,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    simulation = db.query(Simulation).filter(Simulation.id == simulation_id).first()
    if simulation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Симуляция не найдена")
    return simulation


@router.post("/{simulation_id}/action", response_model=SimulationActionResponse)
def run_action(
    simulation_id: str,
    action: SimulationActionRequest,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """
    Единая точка входа для действий во всех 3D-модулях: клиент шлет
    action_type + payload, бэкенд считает результат по формулам и
    возвращает JSON — сам 3D-рендер этого результата целиком на фронтенде.
    """
    simulation = db.query(Simulation).filter(Simulation.id == simulation_id).first()
    if simulation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Симуляция не найдена")

    if simulation.module == SimulationModule.SIMLAB and action.action_type == "mix_reagents":
        reagent_a = action.payload.get("reagent_a")
        reagent_b = action.payload.get("reagent_b")
        reaction = compute_reaction(reagent_a, reagent_b)
        if reaction is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Неизвестная пара реагентов")
        return SimulationActionResponse(
            action_type=action.action_type,
            result={
                "product_name": reaction.product_name,
                "result_color": reaction.result_color,
                "gas_released": reaction.gas_released,
                "is_exothermic": reaction.is_exothermic,
                "delta_temperature_c": reaction.delta_temperature_c,
                "precipitate_formed": reaction.precipitate_formed,
                "precipitate_color": reaction.precipitate_color,
            },
        )

    if simulation.module == SimulationModule.GEO3D and action.action_type == "compute_metrics":
        shape = action.payload.get("shape")
        shape_params = {key: value for key, value in action.payload.items() if key != "shape"}
        try:
            metrics = compute_shape_metrics(shape, **shape_params)
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
        return SimulationActionResponse(action_type=action.action_type, result=metrics)

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Действие не поддерживается для этой симуляции",
    )


@router.post("/{simulation_id}/complete", response_model=LabResultRead, status_code=status.HTTP_201_CREATED)
def complete_simulation(
    simulation_id: str,
    payload: SimulationCompleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Завершение сессии: считаем объективный score (без LLM) и сохраняем
    LabResult. Текстовый AI-фидбек по этому результату запрашивается
    отдельно через POST /api/ai/grade — так генерация фидбека не блокирует
    сохранение результата, если LLM недоступна/медленная.
    """
    simulation = db.query(Simulation).filter(Simulation.id == simulation_id).first()
    if simulation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Симуляция не найдена")

    expected_steps = simulation.config.get("expected_steps", [])
    score = compute_score(payload.actions_log, expected_steps)

    lab_result = LabResult(
        user_id=current_user.id,
        simulation_id=simulation.id,
        actions_log=payload.actions_log,
        score=score,
        duration_seconds=payload.duration_seconds,
    )
    db.add(lab_result)
    db.commit()
    db.refresh(lab_result)
    return lab_result
