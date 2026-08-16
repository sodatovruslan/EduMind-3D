from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import ai, auth, calls, chemistry_saves, classes, messaging, progress, results, simulations, teacher, users, ws_messaging

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
app.include_router(progress.router)
app.include_router(chemistry_saves.router)
app.include_router(teacher.router)
app.include_router(classes.router)
app.include_router(messaging.router)
app.include_router(ws_messaging.router)
app.include_router(calls.router)



# простая проверка что сервер жив, для докера/аптайм-мониторинга
@app.get("/health")
def health_check():
    return {"status": "ok"}
