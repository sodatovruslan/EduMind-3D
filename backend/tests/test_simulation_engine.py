import math

import pytest

from app.services.simulation_engine import (
    compute_reaction,
    ideal_gas_pressure,
    newton_cooling_temperature,
    slow_mo_progress,
)


def test_known_reaction_returns_result():
    reaction = compute_reaction("vinegar", "baking_soda")
    assert reaction is not None
    assert reaction.gas_released is True
    assert reaction.is_exothermic is False


def test_reaction_with_precipitate_marks_precipitate_formed():
    reaction = compute_reaction("silver_nitrate", "sodium_chloride")
    assert reaction is not None
    assert reaction.precipitate_formed is True
    assert reaction.precipitate_color == "#FFFFFF"


def test_reaction_without_precipitate_defaults_to_false():
    reaction = compute_reaction("hcl", "naoh")
    assert reaction is not None
    assert reaction.precipitate_formed is False
    assert reaction.precipitate_color is None


def test_reaction_order_does_not_matter():
    a = compute_reaction("hcl", "naoh")
    b = compute_reaction("naoh", "hcl")
    assert a == b


def test_unknown_reagents_return_none():
    assert compute_reaction("water", "sand") is None


def test_ideal_gas_pressure_matches_formula():
    # P = nRT/V, при n=1 моль, T=273.15K (0°C), V=22.4л -> ~1 атм (классика из школьной химии)
    pressure = ideal_gas_pressure(moles=1, volume_l=22.4, temperature_k=273.15)
    assert pressure == pytest.approx(1.0, abs=0.02)


def test_ideal_gas_pressure_rejects_non_positive_volume():
    with pytest.raises(ValueError):
        ideal_gas_pressure(moles=1, volume_l=0, temperature_k=300)


def test_newton_cooling_approaches_ambient_over_time():
    temp_at_start = newton_cooling_temperature(initial_temp_c=100, ambient_temp_c=20, elapsed_seconds=0)
    temp_much_later = newton_cooling_temperature(initial_temp_c=100, ambient_temp_c=20, elapsed_seconds=10_000)

    assert temp_at_start == pytest.approx(100.0)
    assert temp_much_later == pytest.approx(20.0, abs=0.5)


def test_slow_mo_progress_is_clamped_to_0_1():
    assert slow_mo_progress(elapsed_seconds=0, duration_seconds=10) == 0.0
    assert slow_mo_progress(elapsed_seconds=10, duration_seconds=10) == 1.0
    assert slow_mo_progress(elapsed_seconds=1000, duration_seconds=10) == 1.0


def test_slow_mo_progress_respects_time_scale():
    # при time_scale=0.5 (Slow-Mo) прогресс идет вдвое медленнее
    half_speed = slow_mo_progress(elapsed_seconds=5, duration_seconds=10, time_scale=0.5)
    normal_speed = slow_mo_progress(elapsed_seconds=5, duration_seconds=10, time_scale=1.0)
    assert half_speed == pytest.approx(0.25)
    assert normal_speed == pytest.approx(0.5)
