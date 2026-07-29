from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import ai, auth, results, simulations, users

app = FastAPI(title=settings.PROJECT_NAME)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(simulations.router)
app.include_router(results.router)
app.include_router(ai.router)


# простая проверка что сервер жив, для докера/аптайм-мониторинга
@app.get("/health")
def health_check():
    return {"status": "ok"}
