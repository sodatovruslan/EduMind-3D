#!/usr/bin/env sh
# Прогон миграций перед стартом веб-процесса: на managed-хостинге нет отдельного
# release-шага, а база при первом деплое пустая. Alembic идемпотентен — на
# последующих рестартах upgrade head просто ничего не делает.
set -e

echo "[start] alembic upgrade head"
alembic upgrade head

echo "[start] uvicorn on 0.0.0.0:${PORT:-8000}"
# Один воркер сознательно: реестр WS-соединений (app/core/ws_manager.py)
# не разделяется между процессами, на двух воркерах часть сообщений и
# presence-событий не доедет до получателя.
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
