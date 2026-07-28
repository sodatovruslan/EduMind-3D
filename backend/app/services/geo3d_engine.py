"""
Геометрическое ядро Geo3D: формулы площади поверхности и объема
для базовых тел школьной стереометрии.
"""
import math


def cube_metrics(side: float) -> dict:
    return {"area": 6 * side ** 2, "volume": side ** 3}


def sphere_metrics(radius: float) -> dict:
    return {"area": 4 * math.pi * radius ** 2, "volume": (4 / 3) * math.pi * radius ** 3}


def cylinder_metrics(radius: float, height: float) -> dict:
    lateral = 2 * math.pi * radius * height
    bases = 2 * math.pi * radius ** 2
    return {"area": lateral + bases, "volume": math.pi * radius ** 2 * height}


def cone_metrics(radius: float, height: float) -> dict:
    slant_height = math.sqrt(radius ** 2 + height ** 2)
    area = math.pi * radius * (radius + slant_height)
    volume = (1 / 3) * math.pi * radius ** 2 * height
    return {"area": area, "volume": volume}


def pyramid_metrics(base_side: float, height: float) -> dict:
    """Правильная четырехугольная пирамида (квадрат в основании)."""
    base_area = base_side ** 2
    slant_height = math.sqrt(height ** 2 + (base_side / 2) ** 2)
    lateral_area = 2 * base_side * slant_height
    volume = (1 / 3) * base_area * height
    return {"area": base_area + lateral_area, "volume": volume}


SHAPE_CALCULATORS = {
    "cube": cube_metrics,
    "sphere": sphere_metrics,
    "cylinder": cylinder_metrics,
    "cone": cone_metrics,
    "pyramid": pyramid_metrics,
}


def compute_shape_metrics(shape: str, **params) -> dict:
    calculator = SHAPE_CALCULATORS.get(shape)
    if calculator is None:
        raise ValueError(f"Неизвестная фигура: {shape}")
    return calculator(**params)
