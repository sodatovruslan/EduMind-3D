"""
T7 — REST surface for Student <-> Teacher call SIGNALING (lifecycle only:
ringing/accepted/declined/cancelled/missed/ended — no WebRTC, no media,
see app/models/call.py's own docstring). Realtime push for each
transition goes out via app.core.ws_manager.presence.broadcast_to_user
(see app/services/call_service.py's _broadcast_call) over the SAME
authenticated WebSocket connections messaging already uses — this router
is REST only (start/act on calls); there's no separate call-signaling
websocket endpoint.

Authorization is NOT re-invented here: a call can only be started inside
an already-authorized Conversation (messaging_service.
get_authorized_conversation — the exact same check every messaging
endpoint uses), and every subsequent action re-verifies the acting user
is an actual participant of that specific Call.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.call import ACTIVE_CALL_STATUSES, Call
from app.models.user import User
from app.schemas.call import CallCreate, CallRead
from app.services import call_service, messaging_service

router = APIRouter(tags=["calls"])


async def _get_authorized_call(db: AsyncSession, current_user: User, call_id: str) -> Call:
    call = await call_service.get_call_by_id(db, call_id)
    if call is None or current_user.id not in (call.caller_id, call.callee_id):
        # Same "act like it doesn't exist" pattern messaging/classroom
        # authorization already uses — no signal distinguishing "wrong id"
        # from "not your call".
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call not found")
    return call


@router.post("/api/calls", response_model=CallRead, status_code=status.HTTP_201_CREATED)
async def start_call(
    payload: CallCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    conversation = await messaging_service.get_authorized_conversation(db, current_user, payload.conversation_id)
    callee_id = conversation.student_id if current_user.id == conversation.teacher_id else conversation.teacher_id
    try:
        call = await call_service.start_call(db, conversation, current_user.id, callee_id, payload.call_type)
    except call_service.CallBusyError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="busy")
    return call


@router.get("/api/conversations/{conversation_id}/call", response_model=CallRead)
async def get_current_call(
    conversation_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """The current active (ringing/accepted) call for this conversation,
    if any — used by the frontend for reconnect/refresh restoration
    (brief §22/§23), and doubles as the trigger point for lazy ring-
    timeout reconciliation when the caller's own local ring timer expires
    (brief §25)."""
    await messaging_service.get_authorized_conversation(db, current_user, conversation_id)
    call = await call_service.get_active_call_for_conversation(db, conversation_id)
    if call is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active call")
    call = await call_service.reconcile_timeout(db, call)
    if call.status not in ACTIVE_CALL_STATUSES:
        # Just timed out via reconcile_timeout — no longer "active".
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active call")
    return call


@router.get("/api/conversations/{conversation_id}/calls", response_model=list[CallRead])
async def list_call_history(
    conversation_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    await messaging_service.get_authorized_conversation(db, current_user, conversation_id)
    return await call_service.list_calls_for_conversation(db, conversation_id)


@router.get("/api/calls/{call_id}", response_model=CallRead)
async def get_call(call_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    call = await _get_authorized_call(db, current_user, call_id)
    return await call_service.reconcile_timeout(db, call)


@router.post("/api/calls/{call_id}/accept", response_model=CallRead)
async def accept_call(call_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    call = await _get_authorized_call(db, current_user, call_id)
    try:
        return await call_service.accept_call(db, call, current_user.id)
    except call_service.CallStateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.post("/api/calls/{call_id}/decline", response_model=CallRead)
async def decline_call(call_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    call = await _get_authorized_call(db, current_user, call_id)
    try:
        return await call_service.decline_call(db, call, current_user.id)
    except call_service.CallStateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.post("/api/calls/{call_id}/cancel", response_model=CallRead)
async def cancel_call(call_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    call = await _get_authorized_call(db, current_user, call_id)
    try:
        return await call_service.cancel_call(db, call, current_user.id)
    except call_service.CallStateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.post("/api/calls/{call_id}/end", response_model=CallRead)
async def end_call(call_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    call = await _get_authorized_call(db, current_user, call_id)
    try:
        return await call_service.end_call(db, call, current_user.id)
    except call_service.CallStateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
