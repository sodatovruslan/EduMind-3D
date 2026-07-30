from pydantic import BaseModel


class HintRequest(BaseModel):
    simulation_id: str
    scene_state: str  # текстовое описание текущего состояния 3D-сцены от фронтенда


class HintResponse(BaseModel):
    hint: str


class GradeRequest(BaseModel):
    lab_result_id: str


class GradeResponse(BaseModel):
    score: float
    feedback: str


class TeacherChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    text: str


class TeacherChatRequest(BaseModel):
    simulation_id: str
    student_message: str
    # Уже собранный на фронтенде AI Context Builder объект (Physics Engine /
    # Circuit Engine / Task Validator state) — единственный источник фактов
    # о лаборатории, который получает AI Teacher. Backend его не пересчитывает.
    context: dict
    history: list[TeacherChatMessage] = []
    # Stage 4, необязательно: уже посчитанный progress_service.py Learning
    # Profile — тоже только готовые числа, backend их не пересчитывает.
    learning_profile: dict | None = None


class TeacherChatResponse(BaseModel):
    reply: str
