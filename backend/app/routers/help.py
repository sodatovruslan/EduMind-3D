"""
T10 — REST surface for "Ask Teacher" contextual help requests. Realtime
push for each transition goes out via app.core.ws_manager.presence.
broadcast_to_user (see help_service._broadcast_help), over the SAME
authenticated WebSocket connections messaging/calls already use — no
third transport (brief §12).

Authorization is NOT reinvented: a help request can only be created
inside an already-authorized Conversation (messaging_service.
get_authorized_conversation — the exact same check messaging AND calls
use), and every subsequent action re-verifies the acting user is an
actual participant of that specific HelpRequest, with a removed
classroom membership reconciled lazily on every access (see
help_service.reconcile_membership).
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.help_request import HelpRequest
from app.models.user import User, UserRole
from app.schemas.help import HelpCallLink, HelpRequestCreate, HelpRequestRead
from app.services import call_service, help_service, messaging_service

router = APIRouter(prefix="/api/help-requests", tags=["help"])
# Conversation-scoped history (brief §22) lives under /api/conversations,
# same as calls.py's own /api/conversations/{id}/calls — a second router
# instance purely so this one route isn't forced under the
# /api/help-requests prefix above.
conversation_router = APIRouter(tags=["help"])


async def _get_authorized_help_request(db: AsyncSession, current_user: User, help_request_id: str) -> HelpRequest:
    help_request = await help_service.get_help_request_by_id(db, help_request_id)
    if help_request is None or current_user.id not in (help_request.student_id, help_request.teacher_id):
        # Same "act like it doesn't exist" pattern as every other
        # authorization check in this project.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Help request not found")
    return await help_service.reconcile_membership(db, help_request)


@router.post("", response_model=HelpRequestRead, status_code=status.HTTP_201_CREATED)
async def create_help_request(
    payload: HelpRequestCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only students can request help")
    conversation = await messaging_service.get_authorized_conversation(db, current_user, payload.conversation_id)
    if current_user.id != conversation.student_id:
        # The conversation is real and authorized, but not FOR this
        # student — e.g. a teacher's own conversation id. Same
        # not-found-shaped denial as everywhere else.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return await help_service.create_help_request(db, conversation, payload.context, payload.student_message)


@router.get("", response_model=list[HelpRequestRead])
async def list_my_help_requests(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """The teacher's own incoming requests (for the Teacher Dashboard
    "Help Requests (N)" indicator, brief §35) or a student's own
    outstanding/past requests — never another user's."""
    if current_user.role == UserRole.TEACHER:
        return await help_service.list_help_requests_for_teacher(db, current_user.id)
    if current_user.role == UserRole.STUDENT:
        return await help_service.list_help_requests_for_student(db, current_user.id)
    return []


@router.get("/{help_request_id}", response_model=HelpRequestRead)
async def get_help_request(
    help_request_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    return await _get_authorized_help_request(db, current_user, help_request_id)


@router.post("/{help_request_id}/accept", response_model=HelpRequestRead)
async def accept_help_request(
    help_request_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    help_request = await _get_authorized_help_request(db, current_user, help_request_id)
    try:
        return await help_service.accept_help_request(db, help_request, current_user.id)
    except help_service.HelpRequestStateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.post("/{help_request_id}/decline", response_model=HelpRequestRead)
async def decline_help_request(
    help_request_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    help_request = await _get_authorized_help_request(db, current_user, help_request_id)
    try:
        return await help_service.decline_help_request(db, help_request, current_user.id)
    except help_service.HelpRequestStateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.post("/{help_request_id}/cancel", response_model=HelpRequestRead)
async def cancel_help_request(
    help_request_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    help_request = await _get_authorized_help_request(db, current_user, help_request_id)
    try:
        return await help_service.cancel_help_request(db, help_request, current_user.id)
    except help_service.HelpRequestStateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.post("/{help_request_id}/resolve", response_model=HelpRequestRead)
async def resolve_help_request(
    help_request_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    help_request = await _get_authorized_help_request(db, current_user, help_request_id)
    try:
        return await help_service.resolve_help_request(db, help_request, current_user.id)
    except help_service.HelpRequestStateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.post("/{help_request_id}/link-call", response_model=HelpRequestRead)
async def link_help_request_call(
    help_request_id: str,
    payload: HelpCallLink,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Optional history pointer only (brief §18) — the call itself is
    always started through the existing, unmodified `POST /api/calls`;
    this just lets the help-request UI remember which call it led to."""
    help_request = await _get_authorized_help_request(db, current_user, help_request_id)
    call = await call_service.get_call_by_id(db, payload.call_id)
    if call is None or current_user.id not in (call.caller_id, call.callee_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call not found")
    return await help_service.link_call(db, help_request, payload.call_id)


@conversation_router.get("/api/conversations/{conversation_id}/help-requests", response_model=list[HelpRequestRead])
async def list_conversation_help_requests(
    conversation_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    conversation = await messaging_service.get_authorized_conversation(db, current_user, conversation_id)
    return await help_service.list_help_requests_for_conversation(db, conversation.id)
