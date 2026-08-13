"""
T5 — realtime delivery for human messaging over WebSocket. New messages
are broadcast here AFTER `POST /api/conversations/{id}/messages` persists
them (see services/messaging_service.py) — this socket never accepts a
message body itself, only pushes out what the REST endpoint already saved.

Auth: a `?token=` query param carrying the SAME access token
`POST /api/auth/login` issues, decoded with the same
`app.core.security.decode_token` every REST route uses — not a separate
auth mechanism. Query param (not a header) because browser `WebSocket`
cannot set an `Authorization` header.
"""
from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.classroom_scope import classroom_link_exists
from app.core.security import decode_token
from app.core.ws_manager import manager
from app.database import get_db
from app.models.user import User
from app.services import messaging_service

router = APIRouter(tags=["messaging"])


@router.websocket("/ws/conversations/{conversation_id}")
async def conversation_socket(
    websocket: WebSocket,
    conversation_id: str,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
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
    manager.connect(conversation_id, websocket)
    try:
        while True:
            # Receive-only loop to detect disconnects — T5 sends messages
            # exclusively via the REST endpoint (which broadcasts after
            # persisting); any inbound frame here is intentionally ignored,
            # not a hidden second way to post a message.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(conversation_id, websocket)
