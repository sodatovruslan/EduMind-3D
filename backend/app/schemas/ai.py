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
