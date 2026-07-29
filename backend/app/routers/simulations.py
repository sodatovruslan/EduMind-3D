from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
from app.services.geography_engine import (
    classify_continent,
    evaluate_climate_scenario,
    get_continent_info,
    get_layer_info,
)
from app.services.grader_service import compute_score
from app.services.simulation_engine import compute_reaction

router = APIRouter(prefix="/api/simulations", tags=["simulations"])


@router.get("/", response_model=list[SimulationRead])
async def list_simulations(
    module: SimulationModule | None = None,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    query = select(Simulation)
    if module:
        query = query.where(Simulation.module == module)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{simulation_id}", response_model=SimulationRead)
async def get_simulation(
    simulation_id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Simulation).where(Simulation.id == simulation_id))
    simulation = result.scalar_one_or_none()
    if simulation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Симуляция не найдена")
    return simulation


@router.post("/{simulation_id}/action", response_model=SimulationActionResponse)
async def run_action(
    simulation_id: str,
    action: SimulationActionRequest,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """
    Единая точка входа для действий во всех 3D-модулях: клиент шлет
    action_type + payload, бэкенд считает результат по формулам и
    возвращает JSON — сам 3D-рендер этого результата целиком на фронтенде.
    """
    result = await db.execute(select(Simulation).where(Simulation.id == simulation_id))
    simulation = result.scalar_one_or_none()
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

    if simulation.module == SimulationModule.GEO3D and action.action_type == "explore_continent":
        lat = action.payload.get("lat")
        lng = action.payload.get("lng")
        if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Нужны координаты lat/lng")

        continent_key = classify_continent(lat, lng)
        if continent_key is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Здесь океан — суши нет")

        continent = get_continent_info(continent_key)
        return SimulationActionResponse(
            action_type=action.action_type,
            result={
                "continent": continent_key,
                "name": continent.name,
                "area_million_km2": continent.area_million_km2,
                "population_millions": continent.population_millions,
                "fact": continent.fact,
            },
        )

    if simulation.module == SimulationModule.GEO3D and action.action_type == "trigger_climate_scenario":
        anomaly = action.payload.get("temperature_anomaly")
        if not isinstance(anomaly, (int, float)):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Нужно значение temperature_anomaly")

        event = evaluate_climate_scenario(anomaly)
        return SimulationActionResponse(
            action_type=action.action_type,
            result={
                "triggered": event is not None,
                "location": event.location if event else None,
                "phenomenon": event.phenomenon if event else None,
                "description": (
                    event.description
                    if event
                    else "Пока стабильно — повышай температуру, чтобы увидеть последствия таяния ледников."
                ),
            },
        )

    if simulation.module == SimulationModule.GEO3D and action.action_type == "explore_layer":
        layer_key = action.payload.get("layer")
        layer = get_layer_info(layer_key)
        if layer is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Неизвестный слой Земли")
        return SimulationActionResponse(
            action_type=action.action_type,
            result={
                "layer": layer_key,
                "name": layer.name,
                "depth_km": layer.depth_km,
                "temperature_c": layer.temperature_c,
                "state": layer.state,
                "composition": layer.composition,
            },
        )

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Действие не поддерживается для этой симуляции",
    )


@router.post("/{simulation_id}/complete", response_model=LabResultRead, status_code=status.HTTP_201_CREATED)
async def complete_simulation(
    simulation_id: str,
    payload: SimulationCompleteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Завершение сессии: считаем объективный score (без LLM) и сохраняем
    LabResult. Текстовый AI-фидбек по этому результату запрашивается
    отдельно через POST /api/ai/grade — так генерация фидбека не блокирует
    сохранение результата, если LLM недоступна/медленная.
    """
    result = await db.execute(select(Simulation).where(Simulation.id == simulation_id))
    simulation = result.scalar_one_or_none()
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
    # simulation уже загружена выше — присваиваем в память, чтобы
    # LabResultRead.simulation_title не дергал ленивую (недопустимую
    # в async-сессии без await) подгрузку связи при сериализации ответа
    lab_result.simulation = simulation

    db.add(lab_result)
    await db.commit()
    # id/completed_at — Python-side defaults (не server-generated), а сессия
    # с expire_on_commit=False — поэтому refresh() не нужен, атрибуты и так
    # на месте, включая вручную выставленный simulation
    return lab_result
