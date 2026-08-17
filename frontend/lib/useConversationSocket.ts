"use client";

import { useEffect, useRef, useState } from "react";
import { getAccessToken } from "@/lib/token-storage";
import type { Message } from "@/lib/messaging-client";
import type { Call, CallStatus } from "@/lib/call-client";

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
 *
 * T7 — adds `call:<status>` events (see app/services/call_service.py's
 * `_broadcast_call`). These are pushed to EVERY open socket a user has
 * (not just the one on the call's own conversation_id — see
 * ws_manager.PresenceManager.broadcast_to_user), so a `call:*` event can
 * arrive here even for a conversation other than the one this socket was
 * opened for; useCallSession.ts is what filters by conversation_id.
 *
 * T8 — adds WebRTC SIGNALING relay events (see
 * routers/ws_messaging.py's `_relay_call_signaling`): `webrtc:offer` /
 * `webrtc:answer` / `webrtc:ice-candidate` / `webrtc:media-failed` carry
 * an explicit `call_id` and are only ever relayed by the backend between
 * the two real participants of an ACCEPTED call. `media:state` is the
 * ephemeral mute/camera-off signal — never persisted, never trusted for
 * `user_id` beyond what the backend derived from the sending socket's own
 * authentication.
 */
export type CallSocketEvent = { type: `call:${CallStatus}`; call: Call };

export type WebRTCSignalEvent =
  | { type: "webrtc:offer"; call_id: string; user_id: string; sdp: string }
  | { type: "webrtc:answer"; call_id: string; user_id: string; sdp: string }
  | { type: "webrtc:ice-candidate"; call_id: string; user_id: string; candidate: RTCIceCandidateInit }
  | { type: "webrtc:media-failed"; call_id: string; user_id: string; reason: string }
  | { type: "media:state"; call_id: string; user_id: string; audio_muted: boolean; video_disabled: boolean };

export type ConversationSocketEvent =
  | { type: "message"; message: Message }
  | { type: "message:delivered"; conversation_id: string; message_ids: string[]; delivered_at: string }
  | { type: "message:read"; conversation_id: string; message_ids: string[]; read_at: string }
  | { type: "typing:start"; user_id: string }
  | { type: "typing:stop"; user_id: string }
  | { type: "presence:update"; user_id: string; online: boolean; last_seen_at: string | null }
  | CallSocketEvent
  | WebRTCSignalEvent;

export function isCallSocketEvent(event: ConversationSocketEvent): event is CallSocketEvent {
  return event.type.startsWith("call:");
}

export function isWebRTCSignalEvent(event: ConversationSocketEvent): event is WebRTCSignalEvent {
  return event.type.startsWith("webrtc:") || event.type === "media:state";
}

// The OUTGOING shapes `sendEvent` accepts — never includes `user_id`, the
// backend always derives the sender from this socket's own authentication
// (see `_relay_call_signaling`'s own docstring).
export type OutgoingSignal =
  | { type: "typing:start" | "typing:stop" }
  | { type: "webrtc:offer"; call_id: string; sdp: string }
  | { type: "webrtc:answer"; call_id: string; sdp: string }
  | { type: "webrtc:ice-candidate"; call_id: string; candidate: RTCIceCandidateInit }
  | { type: "webrtc:media-failed"; call_id: string; reason: string }
  | { type: "media:state"; call_id: string; audio_muted: boolean; video_disabled: boolean };

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

  // T6/T8 — used for the ephemeral typing:start/typing:stop signals and
  // (T8) outgoing WebRTC signaling. Silent no-op while disconnected:
  // typing is best-effort by design; a lost offer/answer/ICE candidate
  // here is handled by the caller (useWebRTCSession.ts treats "send
  // failed to reach OPEN socket" as a real signaling failure, not
  // silently swallowed the way typing is).
  function sendEvent(event: OutgoingSignal): boolean {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(event));
      return true;
    }
    return false;
  }

  return { status, sendEvent };
}
