"""
T5 — in-memory WebSocket connection registry for human-messaging realtime
delivery.

SINGLE-PROCESS ONLY, on purpose, documented rather than hidden: connections
live in this process's memory, so a broadcast only reaches clients
connected to the SAME uvicorn worker. This project runs one worker in
dev/current deployment, so it's the right scope for T5 — there's no Redis
(or equivalent pub/sub) in this project to share state across workers, and
adding one solely for this would be scope creep the brief explicitly warns
against. If EduMind ever moves to multiple backend workers, this registry
needs to move to a shared broker (Redis pub/sub is the natural fit) — that
upgrade is a real, separate piece of future work, not implied by anything
here.
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

    def connect(self, conversation_id: str, websocket: WebSocket) -> None:
        self._connections[conversation_id].add(websocket)

    def disconnect(self, conversation_id: str, websocket: WebSocket) -> None:
        connections = self._connections.get(conversation_id)
        if connections is None:
            return
        connections.discard(websocket)
        if not connections:
            del self._connections[conversation_id]

    async def broadcast(self, conversation_id: str, payload: dict[str, Any]) -> None:
        for websocket in list(self._connections.get(conversation_id, ())):
            try:
                await websocket.send_json(payload)
            except Exception:
                # a dead/broken socket must not stop delivery to everyone
                # else in the same conversation; its own receive loop will
                # also fail and clean itself up via disconnect()
                self.disconnect(conversation_id, websocket)


manager = ConnectionManager()
