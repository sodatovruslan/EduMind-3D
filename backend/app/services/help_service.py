"""
T10 — Student -> Teacher CONTEXTUAL HELP request lifecycle. Authorization
(is this student/teacher pair even allowed to talk) is checked by the
caller (routers/help.py) via messaging_service.get_authorized_conversation
— the SAME check messaging AND calls already use (brief §2/§31: no new
authorization system). These functions assume that's already done.

State machine (see models/help_request.py's ALLOWED_HELP_TRANSITIONS):
    PENDING -> ACCEPTED | DECLINED | CANCELLED
    ACCEPTED -> RESOLVED
Every other transition is rejected, enforced HERE, server-side.
"""
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.classroom_scope import classroom_link_exists
from app.core.ws_manager import presence
from app.models.help_request import ACTIVE_HELP_STATUSES, ALLOWED_HELP_TRANSITIONS, HelpRequest, HelpRequestStatus
from app.models.messaging import Conversation
from app.schemas.help import HelpContextSnapshot, HelpRequestRead

HISTORY_LIMIT = 50


class HelpRequestStateError(Exception):
    """Raised when the requested transition isn't allowed from the
    request's current status, OR the acting user isn't the right party
    for that specific action (mirrors CallStateError's dual use in
    call_service.py — both are "this action isn't valid right now")."""


class HelpRequestNotFoundError(Exception):
    pass


def _eager_query():
    return select(HelpRequest).options(
        selectinload(HelpRequest.student), selectinload(HelpRequest.teacher), selectinload(HelpRequest.conversation)
    )


async def get_help_request_by_id(db: AsyncSession, help_request_id: str) -> HelpRequest | None:
    return (await db.execute(_eager_query().where(HelpRequest.id == help_request_id))).scalar_one_or_none()


async def get_active_help_request(db: AsyncSession, conversation_id: str, world: str) -> HelpRequest | None:
    return (
        await db.execute(_eager_query().where(HelpRequest.active_key == f"{conversation_id}:{world}"))
    ).scalar_one_or_none()


async def list_help_requests_for_teacher(db: AsyncSession, teacher_id: str, limit: int = HISTORY_LIMIT) -> list[HelpRequest]:
    result = await db.execute(
        _eager_query().where(HelpRequest.teacher_id == teacher_id).order_by(HelpRequest.created_at.desc()).limit(limit)
    )
    return list(result.scalars().all())


async def list_help_requests_for_student(db: AsyncSession, student_id: str, limit: int = HISTORY_LIMIT) -> list[HelpRequest]:
    result = await db.execute(
        _eager_query().where(HelpRequest.student_id == student_id).order_by(HelpRequest.created_at.desc()).limit(limit)
    )
    return list(result.scalars().all())


async def reconcile_membership(db: AsyncSession, help_request: HelpRequest) -> HelpRequest:
    """Lazy reconciliation (brief §45, mirrors call_service.reconcile_timeout's
    own pattern): a removed classroom membership must close out any still-
    active help request instead of silently leaving it PENDING/ACCEPTED
    forever with no valid authorization behind it — checked on every
    access, not just at creation time (same as messaging's own
    get_authorized_conversation)."""
    if help_request.status not in ACTIVE_HELP_STATUSES:
        return help_request
    if await classroom_link_exists(db, help_request.teacher_id, help_request.student_id):
        return help_request
    help_request.status = HelpRequestStatus.CANCELLED
    help_request.active_key = None
    await db.commit()
    full = await get_help_request_by_id(db, help_request.id)
    assert full is not None
    await _broadcast_help(full)
    return full


async def list_help_requests_for_conversation(db: AsyncSession, conversation_id: str, limit: int = HISTORY_LIMIT) -> list[HelpRequest]:
    result = await db.execute(
        _eager_query().where(HelpRequest.conversation_id == conversation_id).order_by(HelpRequest.created_at.desc()).limit(limit)
    )
    return list(reversed(result.scalars().all()))


async def create_help_request(
    db: AsyncSession, conversation: Conversation, context: HelpContextSnapshot, student_message: str | None
) -> HelpRequest:
    # Dedup (brief §23/§52): a repeated "Ask Teacher" click while one is
    # already active for this conversation+world returns the EXISTING
    # request rather than erroring or creating a second one — a normal
    # double-click/impatience pattern, not something to reject.
    existing = await get_active_help_request(db, conversation.id, context.world)
    if existing is not None:
        return existing

    help_request = HelpRequest(
        conversation_id=conversation.id,
        student_id=conversation.student_id,
        teacher_id=conversation.teacher_id,
        world=context.world,
        context_snapshot=context.model_dump(mode="json"),
        student_message=student_message,
        status=HelpRequestStatus.PENDING,
        active_key=f"{conversation.id}:{context.world}",
    )
    db.add(help_request)
    try:
        await db.commit()
    except IntegrityError:
        # Lost a genuine simultaneous-create race against the DB unique
        # constraint (active_key) — same pattern as start_call's own
        # IntegrityError handling. The request that won IS the canonical
        # one now; a deterministic outcome either way (brief §52).
        await db.rollback()
        existing = await get_active_help_request(db, conversation.id, context.world)
        if existing is not None:
            return existing
        raise
    full = await get_help_request_by_id(db, help_request.id)
    assert full is not None
    await _broadcast_help(full)
    return full


async def accept_help_request(db: AsyncSession, help_request: HelpRequest, actor_id: str) -> HelpRequest:
    if actor_id != help_request.teacher_id:
        raise HelpRequestStateError("Only the teacher can accept")
    _apply_transition(help_request, HelpRequestStatus.ACCEPTED)
    help_request.accepted_at = datetime.utcnow()
    await db.commit()
    full = await get_help_request_by_id(db, help_request.id)
    assert full is not None
    await _broadcast_help(full)
    return full


async def decline_help_request(db: AsyncSession, help_request: HelpRequest, actor_id: str) -> HelpRequest:
    if actor_id != help_request.teacher_id:
        raise HelpRequestStateError("Only the teacher can decline")
    _apply_transition(help_request, HelpRequestStatus.DECLINED)
    await db.commit()
    full = await get_help_request_by_id(db, help_request.id)
    assert full is not None
    await _broadcast_help(full)
    return full


async def cancel_help_request(db: AsyncSession, help_request: HelpRequest, actor_id: str) -> HelpRequest:
    if actor_id != help_request.student_id:
        raise HelpRequestStateError("Only the student can cancel")
    _apply_transition(help_request, HelpRequestStatus.CANCELLED)
    await db.commit()
    full = await get_help_request_by_id(db, help_request.id)
    assert full is not None
    await _broadcast_help(full)
    return full


async def resolve_help_request(db: AsyncSession, help_request: HelpRequest, actor_id: str) -> HelpRequest:
    # Either party can resolve (brief §29) — a call ending on its own
    # never auto-resolves the request (the call could have simply
    # dropped, the underlying question may still stand).
    if actor_id not in (help_request.student_id, help_request.teacher_id):
        raise HelpRequestStateError("Only a participant can resolve")
    _apply_transition(help_request, HelpRequestStatus.RESOLVED)
    help_request.resolved_at = datetime.utcnow()
    await db.commit()
    full = await get_help_request_by_id(db, help_request.id)
    assert full is not None
    await _broadcast_help(full)
    return full


async def link_call(db: AsyncSession, help_request: HelpRequest, call_id: str) -> HelpRequest:
    """Optional history pointer (brief §18) — never required for the
    teacher to actually start a call from a help request; that always
    goes through the existing, unmodified T7 `POST /api/calls`."""
    help_request.call_id = call_id
    await db.commit()
    full = await get_help_request_by_id(db, help_request.id)
    assert full is not None
    return full


def _apply_transition(help_request: HelpRequest, target: HelpRequestStatus) -> None:
    allowed = ALLOWED_HELP_TRANSITIONS.get(help_request.status, set())
    if target not in allowed:
        raise HelpRequestStateError(f"Cannot transition from {help_request.status.value} to {target.value}")
    help_request.status = target
    if target not in ACTIVE_HELP_STATUSES:
        help_request.active_key = None


async def _broadcast_help(help_request: HelpRequest) -> None:
    payload = {"type": f"help:{help_request.status.value}", "help_request": HelpRequestRead.model_validate(help_request).model_dump(mode="json")}
    await presence.broadcast_to_user(help_request.student_id, payload)
    await presence.broadcast_to_user(help_request.teacher_id, payload)
