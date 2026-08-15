"""
T5 — in-memory WebSocket connection registry for human-messaging realtime
delivery. T6 adds: per-socket user_id tracking (so a broadcast can tell
whether it actually reached the RECIPIENT, not just "someone"), a global
PresenceManager (online = at least one open connection anywhere, not
scoped to one conversation), and typing-event relay support (typing state
itself is never stored here — see routers/ws_messaging.py, this module
only tracks connections).

SINGLE-PROCESS ONLY, on purpose, documented rather than hidden: connections
live in this process's memory, so a broadcast only reaches clients
connected to the SAME uvicorn worker. This project runs one worker in
dev/current deployment, so it's the right scope for T5/T6 — there's no
Redis (or equivalent pub/sub) in this project to share state across
workers, and adding one solely for this would be scope creep the briefs
explicitly warn against. If EduMind ever moves to multiple backend
workers, this registry (and presence with it) needs to move to a shared
broker (Redis pub/sub is the natural fit) — that upgrade is real, separate
future work, not implied by anything here.
"""
from collections import defaultdict
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        # multiple sockets per conversation on purpose — both participants,
        # AND multiple tabs/devices of the same participant, all just add
        # another entry; no "one socket per user" assumption anywhere here
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)
        # which user each open socket belongs to, so broadcast/delivery
        # logic can tell "reached the recipient" apart from "reached
        # someone (maybe just the sender's own other tab)"
        self._socket_user: dict[WebSocket, str] = {}

    def connect(self, conversation_id: str, websocket: WebSocket, user_id: str) -> None:
        self._connections[conversation_id].add(websocket)
        self._socket_user[websocket] = user_id

    def disconnect(self, conversation_id: str, websocket: WebSocket) -> None:
        connections = self._connections.get(conversation_id)
        if connections is not None:
            connections.discard(websocket)
            if not connections:
                del self._connections[conversation_id]
        self._socket_user.pop(websocket, None)

    def has_connection_for_user(self, conversation_id: str, user_id: str) -> bool:
        """True if `user_id` currently has at least one open socket on this
        conversation — the live, provable "recipient is here right now"
        check `send_message` uses to decide delivered_at (brief: never
        claim delivered unless the server actually had a real connection to
        push to)."""
        return any(
            self._socket_user.get(ws) == user_id for ws in self._connections.get(conversation_id, ())
        )

    async def broadcast(
        self, conversation_id: str, payload: dict[str, Any], exclude: WebSocket | None = None
    ) -> None:
        for websocket in list(self._connections.get(conversation_id, ())):
            if websocket is exclude:
                continue
            try:
                await websocket.send_json(payload)
            except Exception:
                # a dead/broken socket must not stop delivery to everyone
                # else in the same conversation; its own receive loop will
                # also fail and clean itself up via disconnect()
                self.disconnect(conversation_id, websocket)


manager = ConnectionManager()


class PresenceManager:
    """Global (not per-conversation) online tracking: a user is online iff
    they have at least one open, authenticated WebSocket connection
    anywhere in this process — a student/teacher could have two different
    conversations open in two tabs, and either one counts. Deliberately
    holds no `last_seen` state itself — that's a DB column
    (User.last_seen_at), written by the caller exactly once, on the
    transition this class reports via connect()/disconnect()'s return
    value, never on a timer."""

    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)

    def connect(self, user_id: str, websocket: WebSocket) -> bool:
        """Registers the connection; returns True if this is the user's
        first open connection (i.e. they just came online)."""
        was_offline = not self._connections.get(user_id)
        self._connections[user_id].add(websocket)
        return was_offline

    def disconnect(self, user_id: str, websocket: WebSocket) -> bool:
        """Unregisters the connection; returns True if this was the user's
        last open connection (i.e. they just went offline)."""
        connections = self._connections.get(user_id)
        if connections is None:
            return False
        connections.discard(websocket)
        went_offline = not connections
        if went_offline:
            del self._connections[user_id]
        return went_offline

    def is_online(self, user_id: str) -> bool:
        return bool(self._connections.get(user_id))


presence = PresenceManager()
