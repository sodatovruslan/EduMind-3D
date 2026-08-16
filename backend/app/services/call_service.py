"""
T7 — Student <-> Teacher call SIGNALING lifecycle. Authorization (is this
pair allowed to call at all) is checked by the caller (routers/calls.py)
BEFORE calling into this module, the same split messaging_service.py
already uses — these functions assume that's done.

State machine (see models/call.py's ALLOWED_TRANSITIONS):
    RINGING -> ACCEPTED | DECLINED | CANCELLED | MISSED
    ACCEPTED -> ENDED
Every other transition is rejected. Enforced HERE, server-side, not just
in the frontend's own state handling.
"""
from datetime import datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.ws_manager import presence
from app.models.call import ACTIVE_CALL_STATUSES, ALLOWED_TRANSITIONS, Call, CallStatus, CallType
from app.models.messaging import Conversation
from app.schemas.call import CallRead

# Documented choice (brief §12/§25): long enough to notice and answer a
# call, short enough that an unanswered call doesn't ring forever. Not
# configurable per-user in T7 — a fixed, honestly-chosen constant.
CALL_RING_TIMEOUT_SECONDS = 45

HISTORY_LIMIT = 100


class CallBusyError(Exception):
    """Raised when the callee (or caller) already has an active call —
    either in THIS conversation (DB-constraint-guaranteed, race-safe) or
    in some other conversation (best-effort application-level check, see
    start_call's own docstring for the honest limitation)."""


class CallStateError(Exception):
    """Raised when the requested transition isn't allowed from the call's
    current status (see ALLOWED_TRANSITIONS)."""


class CallNotFoundError(Exception):
    pass


def _eager_query():
    return select(Call).options(selectinload(Call.caller), selectinload(Call.callee), selectinload(Call.conversation))


async def get_call_by_id(db: AsyncSession, call_id: str) -> Call | None:
    return (await db.execute(_eager_query().where(Call.id == call_id))).scalar_one_or_none()


async def get_active_call_for_conversation(db: AsyncSession, conversation_id: str) -> Call | None:
    return (
        await db.execute(_eager_query().where(Call.active_conversation_id == conversation_id))
    ).scalar_one_or_none()


async def _user_has_active_call(db: AsyncSession, user_id: str) -> bool:
    """Best-effort GLOBAL busy check across ALL of a user's conversations
    — NOT race-proof the way the per-conversation
    `active_conversation_id` unique constraint is (that one is a real DB
    constraint; this is a plain SELECT-before-INSERT). Two near-
    simultaneous call attempts against the same user from TWO DIFFERENT
    conversations could theoretically both pass this check before either
    commits. The brief's own explicit simultaneous-call scenario (§14) is
    two people calling EACH OTHER in the SAME conversation, which the
    active_conversation_id constraint handles with full DB-level
    correctness; this check exists for the more common (not adversarial)
    "already on another call" case and is honestly documented as
    best-effort, not as a second race-safe guarantee."""
    result = await db.execute(
        select(Call.id)
        .where(
            Call.status.in_(ACTIVE_CALL_STATUSES),
            or_(Call.caller_id == user_id, Call.callee_id == user_id),
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def reconcile_timeout(db: AsyncSession, call: Call) -> Call:
    """Lazy reconciliation (brief §25): if `call` is still RINGING and the
    ring timeout has elapsed, transition it to MISSED here — called from
    every read/mutate path that touches a specific call, so this is
    correct even after a backend restart mid-ring (no in-memory timer
    survives that; this DB-timestamp-based check does). Also called
    directly by the frontend's own local ring-timer expiry (via GET
    current-call) for a near-instant, broadcast-driven missed transition
    in the common case, rather than waiting for some unrelated read."""
    if call.status != CallStatus.RINGING:
        return call
    if datetime.utcnow() - call.created_at < timedelta(seconds=CALL_RING_TIMEOUT_SECONDS):
        return call
    call.status = CallStatus.MISSED
    call.ended_at = datetime.utcnow()
    call.active_conversation_id = None
    await db.commit()
    await db.refresh(call)
    await _broadcast_call(call)
    return call


async def start_call(db: AsyncSession, conversation: Conversation, caller_id: str, callee_id: str, call_type: CallType) -> Call:
    existing = await get_active_call_for_conversation(db, conversation.id)
    if existing is not None:
        existing = await reconcile_timeout(db, existing)
    if existing is not None and existing.status in ACTIVE_CALL_STATUSES:
        if existing.caller_id == caller_id:
            # Idempotent retry (e.g. a double-click) — the caller's own
            # already-ringing call, not a conflict.
            return existing
        raise CallBusyError()

    if await _user_has_active_call(db, caller_id) or await _user_has_active_call(db, callee_id):
        raise CallBusyError()

    call = Call(
        conversation_id=conversation.id,
        caller_id=caller_id,
        callee_id=callee_id,
        call_type=call_type,
        status=CallStatus.RINGING,
        active_conversation_id=conversation.id,
    )
    db.add(call)
    try:
        await db.commit()
    except IntegrityError:
        # Race: another call for this exact conversation was inserted
        # (and committed) between our check above and this insert — the
        # active_conversation_id UNIQUE constraint is what actually
        # guarantees correctness here, the pre-check above is just the
        # common-case fast path.
        await db.rollback()
        existing = await get_active_call_for_conversation(db, conversation.id)
        if existing is not None and existing.caller_id == caller_id:
            return existing
        raise CallBusyError()
    call = await get_call_by_id(db, call.id)
    assert call is not None
    await _broadcast_call(call)
    return call


async def accept_call(db: AsyncSession, call: Call, actor_id: str) -> Call:
    call = await reconcile_timeout(db, call)
    if actor_id != call.callee_id:
        raise CallStateError("Only the callee can accept")
    _apply_transition(call, CallStatus.ACCEPTED)
    call.answered_at = datetime.utcnow()
    await db.commit()
    call = await get_call_by_id(db, call.id)
    assert call is not None
    await _broadcast_call(call)
    return call


async def decline_call(db: AsyncSession, call: Call, actor_id: str) -> Call:
    call = await reconcile_timeout(db, call)
    if actor_id != call.callee_id:
        raise CallStateError("Only the callee can decline")
    _apply_transition(call, CallStatus.DECLINED)
    call.ended_at = datetime.utcnow()
    call.active_conversation_id = None
    await db.commit()
    call = await get_call_by_id(db, call.id)
    assert call is not None
    await _broadcast_call(call)
    return call


async def cancel_call(db: AsyncSession, call: Call, actor_id: str) -> Call:
    call = await reconcile_timeout(db, call)
    if actor_id != call.caller_id:
        raise CallStateError("Only the caller can cancel")
    _apply_transition(call, CallStatus.CANCELLED)
    call.ended_at = datetime.utcnow()
    call.active_conversation_id = None
    await db.commit()
    call = await get_call_by_id(db, call.id)
    assert call is not None
    await _broadcast_call(call)
    return call


async def end_call(db: AsyncSession, call: Call, actor_id: str) -> Call:
    if actor_id not in (call.caller_id, call.callee_id):
        raise CallStateError("Only a participant can end the call")
    _apply_transition(call, CallStatus.ENDED)
    call.ended_at = datetime.utcnow()
    call.active_conversation_id = None
    await db.commit()
    call = await get_call_by_id(db, call.id)
    assert call is not None
    await _broadcast_call(call)
    return call


def _apply_transition(call: Call, new_status: CallStatus) -> None:
    allowed = ALLOWED_TRANSITIONS.get(call.status, set())
    if new_status not in allowed:
        raise CallStateError(f"Cannot transition from {call.status.value} to {new_status.value}")
    call.status = new_status


async def list_calls_for_conversation(db: AsyncSession, conversation_id: str, limit: int = HISTORY_LIMIT) -> list[Call]:
    result = await db.execute(
        _eager_query().where(Call.conversation_id == conversation_id).order_by(Call.created_at.desc()).limit(limit)
    )
    return list(reversed(result.scalars().all()))


async def _broadcast_call(call: Call) -> None:
    payload = {"type": f"call:{call.status.value}", "call": CallRead.model_validate(call).model_dump(mode="json")}
    await presence.broadcast_to_user(call.caller_id, payload)
    await presence.broadcast_to_user(call.callee_id, payload)
