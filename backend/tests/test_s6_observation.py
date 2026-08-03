import pytest

def test_s6_simulation_completion_schema():
    from app.schemas.simulation import SimulationCompleteRequest

    payload = SimulationCompleteRequest(
        actions_log=[{"event": "task_completed"}],
        duration_seconds=120,
        idempotency_key="idemp-key-999",
        score=95.0,
        assessment_report={"overallScore": 95.0, "isComplete": True},
        assessment_source="client_deterministic_v1",
    )

    assert payload.idempotency_key == "idemp-key-999"
    assert payload.score == 95.0
    assert payload.assessment_source == "client_deterministic_v1"
    assert payload.assessment_report["isComplete"] is True
