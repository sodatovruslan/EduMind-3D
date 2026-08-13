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
 * T5 — realtime delivery for one open conversation. REST
 * (`lib/messaging-client.ts`) stays the source of truth for history/send;
 * this only pushes newly-arrived messages in without polling. Bounded
 * exponential backoff (1s -> 15s cap) on unexpected disconnects, no tight
 * reconnect loop; a deliberate `close()` (conversation changed / component
 * unmounted) never triggers a reconnect. Dedup against REST/other-tab
 * delivery is the CALLER's job (by message id) — this hook only reports
 * what arrived, it doesn't decide what's new.
 */
export function useConversationSocket(conversationId: string | null, onMessage: (message: Message) => void) {
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

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

      socket.onopen = () => {
        attempt = 0;
        setStatus("connected");
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload?.type === "message" && payload.message) {
            onMessageRef.current(payload.message as Message);
          }
        } catch {
          // ignore malformed frames rather than crash the socket handler
        }
      };

      socket.onclose = () => {
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
    };
  }, [conversationId]);

  return { status };
}
