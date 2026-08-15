"use client";

import { useEffect, useRef, useState } from "react";
import { getAccessToken } from "@/lib/token-storage";
import type { Message } from "@/lib/messaging-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const WS_URL = API_URL.replace(/^http/, "ws");

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

export type SocketStatus = "connecting" | "connected" | "disconnected";

/**
 * T6 — the realtime event protocol for one conversation's socket. Typed
 * and structured (never chaotic ad-hoc JSON): a new message, a batch
 * delivered/read status change, or an ephemeral typing/presence signal.
 * Mirrors the shapes broadcast by backend/app/routers/ws_messaging.py and
 * app/services/messaging_service.py — see those for the authoritative
 * definition of when each one fires.
 */
export type ConversationSocketEvent =
  | { type: "message"; message: Message }
  | { type: "message:delivered"; conversation_id: string; message_ids: string[]; delivered_at: string }
  | { type: "message:read"; conversation_id: string; message_ids: string[]; read_at: string }
  | { type: "typing:start"; user_id: string }
  | { type: "typing:stop"; user_id: string }
  | { type: "presence:update"; user_id: string; online: boolean; last_seen_at: string | null };

/**
 * T5 — realtime delivery for one open conversation. REST
 * (`lib/messaging-client.ts`) stays the source of truth for
 * history/send/status; this only pushes events in without polling. Bounded
 * exponential backoff (1s -> 15s cap) on unexpected disconnects, no tight
 * reconnect loop; a deliberate `close()` (conversation changed / component
 * unmounted) never triggers a reconnect. Dedup against REST/other-tab
 * delivery is the CALLER's job (by message id) — this hook only reports
 * what arrived, it doesn't decide what's new.
 *
 * T6 — after a reconnect, REST/DB stays the source of truth: the caller
 * is expected to re-fetch (conversation + messages) rather than assume
 * every event that happened while disconnected was replayed, since this
 * transport makes no such guarantee (see ConversationView's `status`
 * effect).
 */
export function useConversationSocket(conversationId: string | null, onEvent: (event: ConversationSocketEvent) => void) {
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!conversationId) return;
    const token = getAccessToken();
    if (!token) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let closedIntentionally = false;

    function connect() {
      setStatus("connecting");
      socket = new WebSocket(`${WS_URL}/ws/conversations/${conversationId}?token=${encodeURIComponent(token!)}`);
      socketRef.current = socket;

      socket.onopen = () => {
        attempt = 0;
        setStatus("connected");
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload && typeof payload.type === "string") {
            onEventRef.current(payload as ConversationSocketEvent);
          }
        } catch {
          // ignore malformed frames rather than crash the socket handler
        }
      };

      socket.onclose = () => {
        socketRef.current = null;
        if (closedIntentionally) return;
        setStatus("disconnected");
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };

      socket.onerror = () => {
        socket?.close();
      };
    }

    connect();

    return () => {
      closedIntentionally = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
      socketRef.current = null;
    };
  }, [conversationId]);

  // T6 — used only for the ephemeral typing:start/typing:stop signals
  // (see MessageComposer's debounce logic). Silently a no-op while
  // disconnected — typing is best-effort, never queued/retried, matching
  // its own "never persisted, never guaranteed" nature.
  function sendEvent(event: { type: "typing:start" | "typing:stop" }) {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(event));
    }
  }

  return { status, sendEvent };
}
