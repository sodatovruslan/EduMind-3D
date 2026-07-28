"""
Обертка над LLM (OpenAI Chat Completions API), асинхронная — вызовы к
внешнему API не должны блокировать event loop, особенно когда несколько
учеников одновременно просят подсказку у AI Assistant.

Без реального OPENAI_API_KEY (типичная ситуация в dev/CI) сервис не
падает, а возвращает детерминированный mock-ответ — так весь пайплайн
(эндпоинт -> AI_Log -> фронтенд) можно тестировать без сетевых вызовов
и без траты денег на реальный API.
"""
import httpx

from app.config import settings

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_MODEL = "gpt-4o-mini"
REQUEST_TIMEOUT_SECONDS = 20.0

SYSTEM_PROMPT_HINT = (
    "Ты — ИИ-ассистент виртуальной лаборатории EduMind 3D (химия, физика, "
    "биология, геометрия). Ученик выполняет практическое задание в 3D-симуляции. "
    "Дай короткую (2-3 предложения) наводящую подсказку, не раскрывая прямой ответ. "
    "Если видишь ошибку в пропорциях реагентов, температурном режиме или нарушение "
    "техники безопасности сценария — обязательно укажи на это в первую очередь."
)

SYSTEM_PROMPT_GRADE = (
    "Ты — ИИ-ассистент, который проверяет выполнение лабораторной работы. "
    "На основе лога действий ученика, эталонного сценария и уже посчитанной "
    "числовой оценки сформулируй краткий фидбек: что сделано верно, что нет, "
    "и как улучшить результат."
)


async def _chat_completion(system_prompt: str, user_prompt: str) -> str:
    if not settings.OPENAI_API_KEY:
        return f"[mock-ai] {user_prompt[:160]}"

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
        response = await client.post(
            OPENAI_CHAT_URL,
            headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
            json={
                "model": DEFAULT_MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.4,
            },
        )
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]


async def get_hint(scene_state_description: str) -> str:
    return await _chat_completion(SYSTEM_PROMPT_HINT, scene_state_description)


async def get_grading_feedback(context_description: str) -> str:
    return await _chat_completion(SYSTEM_PROMPT_GRADE, context_description)
