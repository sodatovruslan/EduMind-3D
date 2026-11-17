# Образ бэкенда EduMind 3D для Railway/любого хостинга с долгоживущими
# процессами. Serverless (Vercel Functions и аналоги) не подходит: в
# app/core/ws_manager.py реестр WebSocket-соединений живёт в памяти процесса.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Отдельным слоем, чтобы правки кода не инвалидировали кэш установки зависимостей
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Хостинг сам назначает порт через $PORT; 8000 — дефолт для локального запуска
ENV PORT=8000
EXPOSE 8000

CMD ["./start.sh"]
