import math

import pytest

from app.services.geo3d_engine import compute_shape_metrics


def test_cube_metrics():
    metrics = compute_shape_metrics("cube", side=2)
    assert metrics["area"] == 24
    assert metrics["volume"] == 8


def test_sphere_metrics():
    metrics = compute_shape_metrics("sphere", radius=3)
    assert metrics["area"] == pytest.approx(4 * math.pi * 9)
    assert metrics["volume"] == pytest.approx((4 / 3) * math.pi * 27)


def test_cylinder_metrics():
    metrics = compute_shape_metrics("cylinder", radius=2, height=5)
    assert metrics["volume"] == pytest.approx(math.pi * 4 * 5)


def test_cone_metrics():
    metrics = compute_shape_metrics("cone", radius=3, height=4)
    # классический прямоугольный треугольник 3-4-5 для образующей конуса
    assert metrics["area"] == pytest.approx(math.pi * 3 * (3 + 5))


def test_pyramid_metrics():
    metrics = compute_shape_metrics("pyramid", base_side=4, height=3)
    assert metrics["volume"] == pytest.approx((1 / 3) * 16 * 3)


def test_unknown_shape_raises_value_error():
    with pytest.raises(ValueError):
        compute_shape_metrics("dodecahedron", side=1)
