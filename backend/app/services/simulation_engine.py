"""
Физико-химическое ядро SimLab 3D.

REACTION_TABLE — упрощенная модель школьных реакций: без стехиометрии
и концентраций, но достаточная для образовательной 3D-демонстрации на
MVP-этапе. Расширяется добавлением записей в таблицу без изменения
логики compute_reaction.
"""
import math
from dataclasses import dataclass

GAS_CONSTANT_L_ATM = 0.0821  # л·атм/(моль·К)


@dataclass(frozen=True)
class ReactionResult:
    product_name: str
    result_color: str          # hex-цвет для 3D-визуализации жидкости
    gas_released: bool
    is_exothermic: bool
    delta_temperature_c: float  # изменение температуры от реакции
    precipitate_formed: bool = False
    precipitate_color: str | None = None  # цвет осадка для 3D-частиц на дне колбы


REACTION_TABLE: dict[frozenset, ReactionResult] = {
    frozenset({"vinegar", "baking_soda"}): ReactionResult(
        product_name="Ацетат натрия + CO2 + H2O",
        result_color="#E8F4EA",
        gas_released=True,
        is_exothermic=False,
        delta_temperature_c=-2.0,
    ),
    frozenset({"hcl", "naoh"}): ReactionResult(
        product_name="NaCl + H2O (нейтрализация)",
        result_color="#F5F5F5",
        gas_released=False,
        is_exothermic=True,
        delta_temperature_c=8.5,
    ),
    frozenset({"copper_sulfate", "iron"}): ReactionResult(
        product_name="Сульфат железа(II) + медь",
        result_color="#B5651D",
        gas_released=False,
        is_exothermic=True,
        delta_temperature_c=3.0,
        precipitate_formed=True,
        precipitate_color="#B87333",  # металлическая медь выпадает на дно
    ),
    frozenset({"phenolphthalein", "naoh"}): ReactionResult(
        product_name="Фенолфталеин в щелочной среде",
        result_color="#FF69B4",
        gas_released=False,
        is_exothermic=False,
        delta_temperature_c=0.0,
    ),
    frozenset({"silver_nitrate", "sodium_chloride"}): ReactionResult(
        product_name="AgCl (хлорид серебра)",
        result_color="#FAFAFA",
        gas_released=False,
        is_exothermic=False,
        delta_temperature_c=0.0,
        precipitate_formed=True,
        precipitate_color="#FFFFFF",
    ),
}


def compute_reaction(reagent_a: str, reagent_b: str) -> ReactionResult | None:
    """Результат реакции для пары реагентов или None, если пара неизвестна."""
    return REACTION_TABLE.get(frozenset({reagent_a, reagent_b}))


def ideal_gas_pressure(moles: float, volume_l: float, temperature_k: float) -> float:
    """P = nRT / V — давление газа в атмосферах."""
    if volume_l <= 0:
        raise ValueError("Объем должен быть положительным")
    if temperature_k <= 0:
        raise ValueError("Температура должна быть в Кельвинах и положительной")
    return (moles * GAS_CONSTANT_L_ATM * temperature_k) / volume_l


def newton_cooling_temperature(
    initial_temp_c: float,
    ambient_temp_c: float,
    elapsed_seconds: float,
    cooling_rate: float = 0.05,
) -> float:
    """
    Закон охлаждения Ньютона: T(t) = T_env + (T0 - T_env) * e^(-k*t).
    Дает физически правдоподобную (экспоненциальную, а не линейную)
    динамику температуры для Slow-Mo визуализации реакции во времени.
    """
    return ambient_temp_c + (initial_temp_c - ambient_temp_c) * math.exp(-cooling_rate * elapsed_seconds)


def slow_mo_progress(elapsed_seconds: float, duration_seconds: float, time_scale: float = 1.0) -> float:
    """
    Прогресс анимации реакции с учетом множителя времени.
    time_scale < 1 — замедление (Slow-Mo), > 1 — ускорение.
    Возвращает значение, зажатое в диапазон [0, 1].
    """
    if duration_seconds <= 0:
        raise ValueError("Длительность должна быть положительной")
    progress = (elapsed_seconds * time_scale) / duration_seconds
    return max(0.0, min(1.0, progress))
