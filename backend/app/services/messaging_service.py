"""
T5 — Student ↔ Teacher human messaging. Authorization (is this
teacher/student pair actually allowed to talk — see
app/core/classroom_scope.py's classroom_link_exists) is always checked by
the caller (routers/messaging.py, routers/ws_messaging.py) BEFORE calling
into this module; these functions assume that's already been done, the
same split already used between classroom_scope.py and classes.py.
"""
from datetime import datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.ws_manager import manager
from app.models.messaging import Conversation, Message
from app.models.user import User
from app.schemas.messaging import ConversationParticipant, ConversationRead, MessageRead

PREVIEW_LENGTH = 200
DEFAULT_PAGE_SIZE = 30
MAX_PAGE_SIZE = 100

# T5 — `datetime.utcnow()` resolution isn't always fine enough to keep two
# messages sent in very quick succession strictly ordered (observed for
# real in this project's own test suite, not a hypothetical: on this dev
# machine's clock, 5 messages posted back-to-back could land on the same
# microsecond, and `Message.id` — a random UUID — is not a usable
# insertion-order tie-breaker once that happens). This module-level
# watermark forces every message's timestamp to be strictly greater than
# the previous one THIS PROCESS ASSIGNED, which is exactly the ordering
# guarantee a single-process backend can make honestly (see
# ws_manager.py's own single-process limitation note — this is the same
# scope, applied to timestamps instead of connections). No `await` occurs
# between reading and updating it, so — same as the rest of this
# single-threaded asyncio process — no lock is needed for that section to
# be atomic with respect to other coroutines.
_last_message_timestamp: datetime | None = None


def _next_message_timestamp() -> datetime:
    global _last_message_timestamp
    now = datetime.utcnow()
    if _last_message_timestamp is not None and now <= _last_message_timestamp:
        now = _last_message_timestamp + timedelta(microseconds=1)
    _last_message_timestamp = now
    return now


async def get_or_create_conversation(db: AsyncSession, teacher_id: str, student_id: str) -> Conversation:
    existing = (
        await db.execute(
            select(Conversation).where(Conversation.teacher_id == teacher_id, Conversation.student_id == student_id)
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    conversation = Conversation(teacher_id=teacher_id, student_id=student_id)
    db.add(conversation)
    try:
        await db.commit()
    except IntegrityError:
        # Race: two requests both found no existing conversation and both
        # tried to create one. The unique constraint on (teacher_id,
        # student_id) is the real guarantee against duplicate
        # conversations — this just recovers cleanly from losing the race,
        # same IntegrityError-catch-and-recover idiom classes.py already
        # uses for class-membership uniqueness.
        await db.rollback()
        existing = (
            await db.execute(
                select(Conversation).where(Conversation.teacher_id == teacher_id, Conversation.student_id == student_id)
            )
        ).scalar_one_or_none()
        if existing is not None:
            return existing
        raise
    await db.refresh(conversation)
    return conversation


async def get_conversation_by_id(db: AsyncSession, conversation_id: str) -> Conversation | None:
    return (
        await db.execute(
            select(Conversation)
            .options(selectinload(Conversation.teacher), selectinload(Conversation.student))
            .where(Conversation.id == conversation_id)
        )
    ).scalar_one_or_none()


async def list_conversations_for_user(db: AsyncSession, user: User) -> list[Conversation]:
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.teacher), selectinload(Conversation.student))
        .where(or_(Conversation.teacher_id == user.id, Conversation.student_id == user.id))
        .order_by(Conversation.last_message_at.desc().nullslast(), Conversation.created_at.desc())
    )
    return list(result.scalars().all())


def conversation_to_read(conversation: Conversation, current_user_id: str) -> ConversationRead:
    counterpart_user = conversation.student if conversation.teacher_id == current_user_id else conversation.teacher
    return ConversationRead(
        id=conversation.id,
        counterpart=ConversationParticipant(id=counterpart_user.id, full_name=counterpart_user.full_name),
        created_at=conversation.created_at,
        last_message_at=conversation.last_message_at,
        last_message_preview=conversation.last_message_preview,
    )


async def list_messages(
    db: AsyncSession, conversation_id: str, before: datetime | None, limit: int
) -> tuple[list[Message], bool]:
    """Cursor pagination. Returns up to `limit` messages strictly older
    than `before` (or the newest page when `before` is None), in ascending
    chronological order for direct rendering, plus whether an older page
    still exists."""
    capped_limit = max(1, min(limit, MAX_PAGE_SIZE))
    query = select(Message).where(Message.conversation_id == conversation_id)
    if before is not None:
        query = query.where(Message.created_at < before)
    # fetch newest-first so LIMIT keeps the most recent slice of the
    # requested range, then reverse into chronological order for the caller
    query = query.order_by(Message.created_at.desc(), Message.id.desc()).limit(capped_limit + 1)
    rows = list((await db.execute(query)).scalars().all())
    has_more = len(rows) > capped_limit
    page = rows[:capped_limit]
    page.reverse()
    return page, has_more


async def send_message(db: AsyncSession, conversation: Conversation, sender_id: str, content: str) -> Message:
    # Captured once and used for both rows so the message and the
    # conversation's denormalized last-message fields always agree, and
    # forced strictly increasing (see _next_message_timestamp) so ordering
    # is never left to Message.id (a random UUID) breaking a timestamp tie.
    now = _next_message_timestamp()
    message = Message(conversation_id=conversation.id, sender_id=sender_id, content=content, created_at=now)
    db.add(message)
    conversation.last_message_at = now
    conversation.last_message_preview = content[:PREVIEW_LENGTH]
    await db.commit()
    await db.refresh(message)

    # Broadcast only AFTER a successful commit — persistence is what
    # "sent" means (brief §13); a dropped websocket broadcast must never
    # look like message loss, and the reverse (broadcasting before the
    # commit is known to have succeeded) must never happen.
    await manager.broadcast(
        conversation.id,
        {"type": "message", "message": MessageRead.model_validate(message).model_dump(mode="json")},
    )
    return message
