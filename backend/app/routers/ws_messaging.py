"""
T5 — realtime delivery for human messaging over WebSocket. New messages
are broadcast here AFTER `POST /api/conversations/{id}/messages` persists
them (see services/messaging_service.py) — this socket never accepts a
message body itself, only pushes out what the REST endpoint already saved.

T6 adds two more things over the SAME connection: presence (this socket's
open/close lifecycle IS the online/offline signal — see
app.core.ws_manager.presence) and typing indicator relay. Typing events
are the one case where this endpoint DOES read inbound frames for real:
`{"type": "typing:start"}` / `{"type": "typing:stop"}`, relayed to the
OTHER participant's connections on this same conversation using the
sender id THIS SOCKET authenticated as — never a client-supplied id.
Typing state is never written to the database; if a stop event is lost
(tab closed, network died), the receiving frontend clears the indicator
itself after a timeout (see components/messaging/TypingIndicator's
consumer), not the server.

Auth: a `?token=` query param carrying the SAME access token
`POST /api/auth/login` issues, decoded with the same
`app.core.security.decode_token` every REST route uses — not a separate
auth mechanism. Query param (not a header) because browser `WebSocket`
cannot set an `Authorization` header.
"""
import asyncio
import json
from datetime import datetime

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect, status
from jose import JWTError
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.classroom_scope import classroom_link_exists
from app.core.security import decode_token
from app.core.ws_manager import manager, presence
from app.database import get_db, get_session_factory
from app.models.user import User
from app.services import messaging_service

router = APIRouter(tags=["messaging"])

_TYPING_EVENT_TYPES = {"typing:start", "typing:stop"}


async def _broadcast_presence(
    db: AsyncSession, user_id: str, *, online: bool, last_seen_at: datetime | None, exclude: WebSocket | None = None
) -> None:
    conversation_ids = await messaging_service.conversation_ids_for_user(db, user_id)
    payload = {
        "type": "presence:update",
        "user_id": user_id,
        "online": online,
        "last_seen_at": last_seen_at.isoformat() if last_seen_at else None,
    }
    for conversation_id in conversation_ids:
        # `exclude` matters only for the ONE conversation this socket
        # belongs to — passing it unconditionally is harmless for the
        # user's other conversations (this exact WebSocket object simply
        # never appears in those connection sets).
        await manager.broadcast(conversation_id, payload, exclude=exclude)


@router.websocket("/ws/conversations/{conversation_id}")
async def conversation_socket(
    websocket: WebSocket,
    conversation_id: str,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
    session_factory: async_sessionmaker = Depends(get_session_factory),
):
    try:
        user_id = decode_token(token, expected_type="access")
    except JWTError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    conversation = await messaging_service.get_conversation_by_id(db, conversation_id)
    if conversation is None or user.id not in (conversation.teacher_id, conversation.student_id):
        # Same "act like it doesn't exist" response as the REST routes —
        # an unauthorized user gets no signal distinguishing "wrong
        # conversation id" from "not your conversation".
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    if not await classroom_link_exists(db, conversation.teacher_id, conversation.student_id):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    manager.connect(conversation_id, websocket, user.id)
    # Presence is per-USER, not per-conversation — a second tab open on a
    # different conversation must not make this user "come online" again,
    # and closing one of two tabs must not make them go offline. connect()
    # reports whether this was their FIRST open connection anywhere.
    just_came_online = presence.connect(user.id, websocket)
    if just_came_online:
        # A user doesn't need to be told about their own presence — only
        # their OTHER open connections (if any) would otherwise receive
        # this, and this is the first one, so exclude is really just
        # future-proofing for a second tab connecting concurrently.
        await _broadcast_presence(db, user.id, online=True, last_seen_at=None, exclude=websocket)

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                event = json.loads(raw)
            except ValueError:
                continue
            event_type = event.get("type") if isinstance(event, dict) else None
            if event_type in _TYPING_EVENT_TYPES:
                # Relayed to every OTHER connection on this conversation
                # (including the sender's own other tabs, harmless) using
                # the id this socket authenticated as — a client could send
                # any JSON it wants here, but never gets to claim to be
                # someone else.
                await manager.broadcast(conversation_id, {"type": event_type, "user_id": user.id}, exclude=websocket)
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(conversation_id, websocket)
        went_offline = presence.disconnect(user.id, websocket)
        if went_offline:
            # Persisted ONLY on this transition — never on a timer, never
            # per-connection-open — so it survives a backend restart
            # without ever becoming a per-second write (brief's explicit
            # performance constraint).
            #
            # Deliberately NOT reusing `db` (the request-scoped session)
            # here: a client-initiated close races this `finally` against
            # a server-side cancellation of the connection's own task
            # (observed for real against Starlette's TestClient, whose
            # `WebSocketTestSession.__exit__` sends the disconnect message
            # and, essentially concurrently, cancels the task driving this
            # handler), and `db` may already be mid-teardown by the time
            # this runs. A fresh, independent session (via `session_factory`
            # — the same one `get_db` itself uses, so this still lands in
            # the right database in tests) has no such shared lifecycle to
            # race against. `Task.uncancel()` (Python 3.11+) additionally
            # clears one pending cancellation request so this last bit of
            # bookkeeping isn't immediately re-aborted at its own first
            # `await`.
            task = asyncio.current_task()
            if task is not None and task.cancelling():
                task.uncancel()
            try:
                now = datetime.utcnow()
                async with session_factory() as offline_db:
                    await offline_db.execute(update(User).where(User.id == user.id).values(last_seen_at=now))
                    await offline_db.commit()
                    await _broadcast_presence(offline_db, user.id, online=False, last_seen_at=now)
            except Exception:
                pass
