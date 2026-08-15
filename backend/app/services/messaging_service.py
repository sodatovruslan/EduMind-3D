"""
T5 — Student ↔ Teacher human messaging. Authorization (is this
teacher/student pair actually allowed to talk — see
app/core/classroom_scope.py's classroom_link_exists) is always checked by
the caller (routers/messaging.py, routers/ws_messaging.py) BEFORE calling
into this module; these functions assume that's already been done, the
same split already used between classroom_scope.py and classes.py.

T6 adds message status (delivered_at/read_at), unread counts, and the
presence-aware helpers used by routers/ws_messaging.py. See Message's own
docstring (models/messaging.py) for the delivered/read semantics.
"""
from datetime import datetime, timedelta

from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.core.ws_manager import manager, presence
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
# be atomic with respect to other coroutines. Only `created_at` needs this;
# delivered_at/read_at are status timestamps, not ordering keys, so they
# use plain `datetime.utcnow()`.
_last_message_timestamp: datetime | None = None


def _next_message_timestamp() -> datetime:
    global _last_message_timestamp
    now = datetime.utcnow()
    if _last_message_timestamp is not None and now <= _last_message_timestamp:
        now = _last_message_timestamp + timedelta(microseconds=1)
    _last_message_timestamp = now
    return now


def message_status(message: Message) -> str:
    """"sent" | "delivered" | "read", derived purely from the two
    timestamp columns — see Message's docstring for why there's no
    separate status enum."""
    if message.read_at is not None:
        return "read"
    if message.delivered_at is not None:
        return "delivered"
    return "sent"


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


async def get_last_messages(db: AsyncSession, conversation_ids: list[str]) -> dict[str, Message]:
    """The single newest Message row per conversation, for however many
    conversation ids are passed — ONE query total (a window function, not
    a per-conversation round trip), used to show the own-message
    ✓/✓✓/read indicator in the conversation list without N+1."""
    if not conversation_ids:
        return {}
    row_number = (
        func.row_number().over(partition_by=Message.conversation_id, order_by=Message.created_at.desc()).label("rn")
    )
    subq = select(Message, row_number).where(Message.conversation_id.in_(conversation_ids)).subquery()
    msg_alias = aliased(Message, subq)
    result = await db.execute(select(msg_alias).where(subq.c.rn == 1))
    return {m.conversation_id: m for m in result.scalars().all()}


async def get_unread_counts(db: AsyncSession, user_id: str, conversation_ids: list[str]) -> dict[str, int]:
    """Unread = messages in these conversations NOT sent by `user_id` with
    no read_at yet. ONE grouped query for all conversations — no N+1."""
    if not conversation_ids:
        return {}
    result = await db.execute(
        select(Message.conversation_id, func.count(Message.id))
        .where(
            Message.conversation_id.in_(conversation_ids),
            Message.sender_id != user_id,
            Message.read_at.is_(None),
        )
        .group_by(Message.conversation_id)
    )
    return {cid: count for cid, count in result.all()}


async def conversation_ids_for_user(db: AsyncSession, user_id: str) -> list[str]:
    """Used purely to know which conversations to push a presence:update
    into when this user's online/offline state changes — see
    routers/ws_messaging.py."""
    result = await db.execute(
        select(Conversation.id).where(or_(Conversation.teacher_id == user_id, Conversation.student_id == user_id))
    )
    return [row[0] for row in result.all()]


def conversation_to_read(
    conversation: Conversation,
    current_user_id: str,
    *,
    unread_count: int = 0,
    last_message: Message | None = None,
) -> ConversationRead:
    counterpart_user = conversation.student if conversation.teacher_id == current_user_id else conversation.teacher
    last_message_own_status = None
    if last_message is not None and last_message.sender_id == current_user_id:
        last_message_own_status = message_status(last_message)
    return ConversationRead(
        id=conversation.id,
        counterpart=ConversationParticipant(
            id=counterpart_user.id,
            full_name=counterpart_user.full_name,
            online=presence.is_online(counterpart_user.id),
            last_seen_at=counterpart_user.last_seen_at,
        ),
        created_at=conversation.created_at,
        last_message_at=conversation.last_message_at,
        last_message_preview=conversation.last_message_preview,
        unread_count=unread_count,
        last_message_own_status=last_message_own_status,
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
    recipient_id = conversation.student_id if sender_id == conversation.teacher_id else conversation.teacher_id
    # Delivered semantics (brief): only claim delivered if the recipient
    # ACTUALLY had a live, authenticated connection on this conversation at
    # send time — never assumed, never based on "they were online
    # recently". The broadcast right below reaches that exact connection
    # in the same coroutine, so this check and the delivery it describes
    # happen together.
    delivered_at = datetime.utcnow() if manager.has_connection_for_user(conversation.id, recipient_id) else None
    message = Message(
        conversation_id=conversation.id,
        sender_id=sender_id,
        content=content,
        created_at=now,
        delivered_at=delivered_at,
    )
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


async def mark_delivered_via_history(db: AsyncSession, conversation_id: str, viewer_id: str) -> list[str]:
    """Offline-delivery semantics (brief §21, documented decision): a
    message sent while the recipient is offline stays SENT until either
    (a) the recipient gets a live WebSocket connection and a fresh
    broadcast reaches them (see send_message), or (b) — this function —
    they fetch conversation history via REST, which is just as real and
    provable a signal that the message reached their device. Marks
    delivered only, never read: "seen" is exclusively the explicit
    mark_read action below."""
    now = datetime.utcnow()
    ids_result = await db.execute(
        select(Message.id).where(
            Message.conversation_id == conversation_id,
            Message.sender_id != viewer_id,
            Message.delivered_at.is_(None),
        )
    )
    ids = [row[0] for row in ids_result.all()]
    if not ids:
        return []
    await db.execute(update(Message).where(Message.id.in_(ids)).values(delivered_at=now))
    await db.commit()
    await manager.broadcast(
        conversation_id,
        {"type": "message:delivered", "conversation_id": conversation_id, "message_ids": ids, "delivered_at": now.isoformat()},
    )
    return ids


async def mark_read(db: AsyncSession, conversation: Conversation, user_id: str) -> list[str]:
    """The explicit, bounded mark-read action (brief §5/§25: never implied
    just by being online, only by an explicit conversation-view
    acknowledgement). Bulk UPDATE, not a per-message loop — one statement
    regardless of how many messages are being marked. Also backfills
    delivered_at for any of them that were somehow still null, so "read
    implies delivered" is true as real DB state, not just a computed rule
    (see Message's own docstring)."""
    now = datetime.utcnow()
    ids_result = await db.execute(
        select(Message.id).where(
            Message.conversation_id == conversation.id,
            Message.sender_id != user_id,
            Message.read_at.is_(None),
        )
    )
    ids = [row[0] for row in ids_result.all()]
    if not ids:
        return []
    await db.execute(
        update(Message)
        .where(Message.id.in_(ids))
        .values(read_at=now, delivered_at=func.coalesce(Message.delivered_at, now))
    )
    await db.commit()
    await manager.broadcast(
        conversation.id,
        {"type": "message:read", "conversation_id": conversation.id, "message_ids": ids, "read_at": now.isoformat()},
    )
    return ids
