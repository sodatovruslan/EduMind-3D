"""
Обертка над LLM, асинхронная — вызовы к внешнему API не должны блокировать
event loop, особенно когда несколько учеников одновременно просят подсказку
у AI Assistant. Поддерживает Gemini (Google Generative Language API) и
OpenAI Chat Completions — используется тот провайдер, чей ключ настроен
(GEMINI_API_KEY имеет приоритет, если задан оба).

Без реального ключа (типичная ситуация в dev/CI) сервис не падает, а
возвращает детерминированный mock-ответ — так весь пайплайн
(эндпоинт -> AI_Log -> фронтенд) можно тестировать без сетевых вызовов
и без траты денег на реальный API.
"""
import httpx

from app.config import settings

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
GEMINI_CHAT_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
DEFAULT_GEMINI_MODEL = "gemini-flash-latest"
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

# AI Teacher (Electricity Lab, Stage 3) — намеренно намного более строгий и
# специфичный промпт, чем общие SYSTEM_PROMPT_HINT/GRADE выше. Ключевое
# правило: модель не считает физику и не придумывает ошибки сама — весь
# JSON-контекст (physics/validation), который ей передают, уже целиком
# посчитан Physics/Circuit Engine и Task Validator на фронтенде.
SYSTEM_PROMPT_TEACHER = (
    "Ты — виртуальный преподаватель физики в лаборатории EduMind 3D Electricity Lab. "
    "Ты спокойный, дружелюбный, терпеливый, объясняешь простыми словами и никогда не "
    "критикуешь ученика.\n\n"
    "КРИТИЧЕСКИ ВАЖНЫЕ ПРАВИЛА:\n"
    "1. Ты НИКОГДА не вычисляешь физику сам, не анализируешь схему и не придумываешь "
    "ошибки. Все факты о состоянии лаборатории ты получаешь ИСКЛЮЧИТЕЛЬНО из "
    "JSON-объекта 'Состояние лаборатории', который прикреплён к сообщению — это "
    "единственный источник правды, уже посчитанный Physics Engine, Circuit Engine и "
    "Task Validator.\n"
    "2. Если поле validation.errors в этом JSON пустое — не выдумывай ошибку, которой "
    "там нет.\n"
    "3. Если validation.completed = true — обязательно похвали ученика и предложи "
    "перейти к следующему заданию.\n"
    "4. Если ученик просит 'сделай за меня' или прямой готовый ответ — НЕ давай "
    "готовое решение, вместо этого дай наводящую подсказку (например, предложи "
    "проверить конкретный аспект схемы из контекста).\n"
    "5. Если вопрос ученика не относится к физике и текущему эксперименту — вежливо "
    "верни разговор к теме лаборатории.\n"
    "6. Отвечай кратко (2-4 предложения), простыми словами, без формул, если ученик "
    "явно не просит формулу.\n"
    "7. Используй числа (ток, напряжение) из physics только если они реально нужны "
    "для ответа на конкретный вопрос."
)


async def _openai_chat_completion(system_prompt: str, user_prompt: str) -> str:
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
        response = await client.post(
            OPENAI_CHAT_URL,
            headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
            json={
                "model": DEFAULT_OPENAI_MODEL,
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


async def _gemini_chat_completion(system_prompt: str, user_prompt: str) -> str:
    url = GEMINI_CHAT_URL.format(model=DEFAULT_GEMINI_MODEL)
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
        response = await client.post(
            url,
            params={"key": settings.GEMINI_API_KEY},
            json={
                "system_instruction": {"parts": [{"text": system_prompt}]},
                "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
                "generationConfig": {"temperature": 0.4},
            },
        )
        response.raise_for_status()
        data = response.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]


async def _chat_completion(system_prompt: str, user_prompt: str) -> str:
    if settings.GEMINI_API_KEY:
        return await _gemini_chat_completion(system_prompt, user_prompt)
    if settings.OPENAI_API_KEY:
        return await _openai_chat_completion(system_prompt, user_prompt)
    return f"[mock-ai] {user_prompt[:160]}"


async def get_hint(scene_state_description: str) -> str:
    return await _chat_completion(SYSTEM_PROMPT_HINT, scene_state_description)


async def get_grading_feedback(context_description: str) -> str:
    return await _chat_completion(SYSTEM_PROMPT_GRADE, context_description)


async def get_teacher_response(context_json: str, student_message: str, history: list[dict]) -> str:
    history_text = "\n".join(f"{h['role']}: {h['text']}" for h in history[-10:])
    user_prompt = (
        f"Состояние лаборатории (JSON, единственный источник фактов):\n{context_json}\n\n"
        + (f"История разговора:\n{history_text}\n\n" if history_text else "")
        + f"Вопрос ученика: {student_message}"
    )
    return await _chat_completion(SYSTEM_PROMPT_TEACHER, user_prompt)
