import pytest

from app.models.simulation import Simulation, SimulationModule
from app.services.grader_service import build_grading_context, compute_score


def test_compute_score_full_match():
    expected_steps = ["add_reagent_a", "add_reagent_b", "measure_temperature"]
    actions_log = [
        {"action_type": "add_reagent_a"},
        {"action_type": "add_reagent_b"},
        {"action_type": "measure_temperature"},
    ]
    assert compute_score(actions_log, expected_steps) == 100.0


def test_compute_score_partial_match():
    expected_steps = ["add_reagent_a", "add_reagent_b", "measure_temperature"]
    actions_log = [{"action_type": "add_reagent_a"}]
    assert compute_score(actions_log, expected_steps) == pytest.approx(33.33, abs=0.01)


def test_compute_score_ignores_extra_actions_but_keeps_order():
    expected_steps = ["step_a", "step_b"]
    actions_log = [
        {"action_type": "irrelevant_click"},
        {"action_type": "step_a"},
        {"action_type": "irrelevant_click"},
        {"action_type": "step_b"},
    ]
    assert compute_score(actions_log, expected_steps) == 100.0


def test_compute_score_wrong_order_does_not_double_count():
    # step_b раньше step_a в логе — засчитываем только step_b, step_a не находится ПОСЛЕ него
    expected_steps = ["step_a", "step_b"]
    actions_log = [{"action_type": "step_b"}]
    assert compute_score(actions_log, expected_steps) == 50.0


def test_compute_score_no_expected_steps_returns_zero():
    assert compute_score([{"action_type": "anything"}], []) == 0.0


def test_build_grading_context_includes_score_and_steps():
    simulation = Simulation(
        title="Нейтрализация кислоты",
        module=SimulationModule.SIMLAB,
        subject="Химия",
        config={"expected_steps": ["add_hcl", "add_naoh"]},
        difficulty=1,
    )
    context = build_grading_context(simulation, [{"action_type": "add_hcl"}], score=50.0)

    assert "Нейтрализация кислоты" in context
    assert "50.0/100" in context
    assert "add_hcl" in context
