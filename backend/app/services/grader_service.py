"""
Auto-Grader: сравнивает лог действий ученика с эталонным сценарием
симуляции и считает объективный числовой score.

Числовая оценка НЕ зависит от LLM и считается этим модулем детерминированно;
текстовый фидбек поверх нее уже генерирует AI (см. ai_service.get_grading_feedback),
чтобы итоговая оценка не могла "поплыть" от галлюцинаций модели.
"""
from app.models.simulation import Simulation


def compute_score(actions_log: list[dict], expected_steps: list[str]) -> float:
    """
    Находим по порядку, сколько ожидаемых шагов встретилось в логе ученика
    (не обязательно подряд, но с сохранением относительного порядка).
    score = (совпавшие шаги / всего ожидаемых шагов) * 100.
    Лишние действия сверх эталонных на MVP-этапе не штрафуются.
    """
    if not expected_steps:
        return 0.0

    performed_actions = [action.get("action_type") for action in actions_log]

    matched = 0
    search_from = 0
    for expected_step in expected_steps:
        found_at = _find_from(performed_actions, expected_step, search_from)
        if found_at is not None:
            matched += 1
            search_from = found_at + 1

    return round((matched / len(expected_steps)) * 100, 2)


def _find_from(items: list, target, start: int) -> int | None:
    for index in range(start, len(items)):
        if items[index] == target:
            return index
    return None


def build_grading_context(simulation: Simulation, actions_log: list[dict], score: float) -> str:
    """Готовит текстовое описание для LLM, чтобы она сформулировала фидбек ученику."""
    expected_steps = simulation.config.get("expected_steps", [])
    performed_actions = [action.get("action_type") for action in actions_log]

    return (
        f"Симуляция: {simulation.title} ({simulation.subject}).\n"
        f"Эталонные шаги: {expected_steps}.\n"
        f"Действия ученика: {performed_actions}.\n"
        f"Объективная числовая оценка (уже посчитана): {score}/100.\n"
        f"Сформулируй короткий фидбек ученику на русском языке."
    )
