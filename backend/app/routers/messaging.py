"""
T5 — REST surface for Student <-> Teacher human messaging (initial state,
history, sending — see routers/ws_messaging.py for the realtime delivery
half). NOT the AI Teacher/AI Assistant chat (routers/ai.py) — a
completely separate concern with its own contract and storage.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.classroom_scope import accessible_student_ids, classroom_link_exists
from app.core.deps import get_current_user
from app.database import get_db
from app.models.classroom import ClassMembership, Classroom
from app.models.user import User, UserRole
from app.schemas.messaging import (
    ConversationCreate,
    ConversationParticipant,
    ConversationRead,
    MarkReadResult,
    MessageCreate,
    MessagePage,
    MessageRead,
)
from app.services import messaging_service

router = APIRouter(prefix="/api/conversations", tags=["messaging"])


async def _resolve_pair(db: AsyncSession, current_user: User, counterpart_id: str) -> tuple[str, str]:
    """Returns (teacher_id, student_id) for a (current_user, counterpart) pair,
    resolved from current_user's own role — never trusted from the client."""
    if current_user.role == UserRole.STUDENT:
        teacher_id, student_id = counterpart_id, current_user.id
        expected_role = UserRole.TEACHER
    elif current_user.role == UserRole.TEACHER:
        teacher_id, student_id = current_user.id, counterpart_id
        expected_role = UserRole.STUDENT
    else:
        # Admin is deliberately NOT auto-granted messaging access — see
        # EDUMIND_DESIGN_SYSTEM_V2.md / roadmap T5 notes for why.
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Messaging is only available to students and teachers")

    counterpart = (await db.execute(select(User).where(User.id == counterpart_id))).scalar_one_or_none()
    if counterpart is None or counterpart.role != expected_role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return teacher_id, student_id


@router.get("", response_model=list[ConversationRead])
async def list_conversations(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in (UserRole.STUDENT, UserRole.TEACHER):
        return []
    conversations = await messaging_service.list_conversations_for_user(db, current_user)
    ids = [c.id for c in conversations]
    # Both single queries covering every conversation in the list — no
    # per-conversation round trip (brief's explicit no-N+1 requirement).
    unread_counts = await messaging_service.get_unread_counts(db, current_user.id, ids)
    last_messages = await messaging_service.get_last_messages(db, ids)
    return [
        messaging_service.conversation_to_read(
            c,
            current_user.id,
            unread_count=unread_counts.get(c.id, 0),
            last_message=last_messages.get(c.id),
        )
        for c in conversations
    ]


@router.get("/counterparts", response_model=list[ConversationParticipant])
async def list_counterparts(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Who the current user is actually allowed to message — the real,
    classroom-derived answer to "who is my teacher" / "which of my students
    can I write to", not left for the frontend to guess. Registered before
    `/{conversation_id}` so FastAPI doesn't swallow this literal path as a
    conversation id."""
    if current_user.role == UserRole.TEACHER:
        student_ids = await accessible_student_ids(db, current_user)
        if not student_ids:
            return []
        rows = (await db.execute(select(User).where(User.id.in_(student_ids)))).scalars().all()
    elif current_user.role == UserRole.STUDENT:
        rows = (
            await db.execute(
                select(User)
                .join(Classroom, Classroom.teacher_id == User.id)
                .join(ClassMembership, ClassMembership.class_id == Classroom.id)
                .where(ClassMembership.student_id == current_user.id, ClassMembership.removed_at.is_(None))
                .distinct()
            )
        ).scalars().all()
    else:
        # Admin is deliberately NOT auto-granted messaging access.
        return []
    return [ConversationParticipant(id=u.id, full_name=u.full_name) for u in rows]


@router.post("", response_model=ConversationRead, status_code=status.HTTP_201_CREATED)
async def open_conversation(
    payload: ConversationCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    teacher_id, student_id = await _resolve_pair(db, current_user, payload.counterpart_id)
    if not await classroom_link_exists(db, teacher_id, student_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    conversation = await messaging_service.get_or_create_conversation(db, teacher_id, student_id)
    # get_or_create_conversation doesn't eager-load participants; reload
    # through the same authorized path so conversation_to_read always sees
    # both users regardless of whether this created a new row or found one.
    conversation = await messaging_service.get_conversation_by_id(db, conversation.id)
    return messaging_service.conversation_to_read(conversation, current_user.id)


@router.get("/{conversation_id}", response_model=ConversationRead)
async def get_conversation(
    conversation_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    conversation = await messaging_service.get_authorized_conversation(db, current_user, conversation_id)
    unread_counts = await messaging_service.get_unread_counts(db, current_user.id, [conversation.id])
    last_messages = await messaging_service.get_last_messages(db, [conversation.id])
    return messaging_service.conversation_to_read(
        conversation,
        current_user.id,
        unread_count=unread_counts.get(conversation.id, 0),
        last_message=last_messages.get(conversation.id),
    )


@router.get("/{conversation_id}/messages", response_model=MessagePage)
async def get_messages(
    conversation_id: str,
    before: datetime | None = Query(default=None),
    limit: int = Query(default=messaging_service.DEFAULT_PAGE_SIZE, ge=1, le=messaging_service.MAX_PAGE_SIZE),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await messaging_service.get_authorized_conversation(db, current_user, conversation_id)
    # Offline-delivery semantics (brief §21): fetching history is itself a
    # real, provable delivery signal for any of the counterpart's messages
    # that hadn't reached a live connection yet — see messaging_service.
    # mark_delivered_via_history's own docstring. Applied before the page
    # is read back so the response already reflects it.
    await messaging_service.mark_delivered_via_history(db, conversation_id, current_user.id)
    messages, has_more = await messaging_service.list_messages(db, conversation_id, before, limit)
    return MessagePage(messages=[MessageRead.model_validate(m) for m in messages], has_more=has_more)


@router.post("/{conversation_id}/read", response_model=MarkReadResult)
async def mark_conversation_read(
    conversation_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """The explicit, bounded mark-read action — never implied merely by
    being online or connected (brief §5/§25). The frontend calls this only
    when the conversation is actually visible and scrolled to the bottom
    (see ConversationView's read-on-open logic)."""
    conversation = await messaging_service.get_authorized_conversation(db, current_user, conversation_id)
    ids = await messaging_service.mark_read(db, conversation, current_user.id)
    return MarkReadResult(message_ids=ids)


@router.post("/{conversation_id}/messages", response_model=MessageRead, status_code=status.HTTP_201_CREATED)
async def post_message(
    conversation_id: str,
    payload: MessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = await messaging_service.get_authorized_conversation(db, current_user, conversation_id)
    message = await messaging_service.send_message(db, conversation, current_user.id, payload.content)
    return MessageRead.model_validate(message)
