"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  acceptCall as apiAccept,
  cancelCall as apiCancel,
  declineCall as apiDecline,
  endCall as apiEnd,
  getCall,
  getCurrentCall,
  startCall as apiStart,
  type Call,
  type CallType,
  CallBusyError,
} from "@/lib/call-client";
import { parseUtcTimestamp } from "@/lib/messaging-time";

// Documented to match backend's own CALL_RING_TIMEOUT_SECONDS
// (app/services/call_service.py) — kept as a separate constant rather
// than fetched from the server since it's a fixed, non-configurable
// value on both sides.
export const CALL_RING_TIMEOUT_SECONDS = 45;

// How long a terminal state (declined/cancelled/missed/ended) stays
// visible before the panel auto-dismisses (brief §10: "не оставлять
// caller бесконечно ringing", and §27 wants these as real, visible UI
// states, not an instant vanish).
const TERMINAL_STATE_DISPLAY_MS = 4000;

/**
 * T7 — call session state for ONE open conversation. Scope decision
 * (documented): a call:* event is only acted on here if it belongs to
 * THIS conversation_id. The backend broadcasts call events to every open
 * socket a user has (see ws_manager.PresenceManager.broadcast_to_user),
 * so an event for a DIFFERENT conversation could technically arrive on
 * this same socket — that cross-conversation notification case is out of
 * scope for T7 (the product's call feature lives inside a conversation's
 * own header, and every manual test scenario in the brief involves two
 * users already looking at the same shared conversation).
 */
export function useCallSession(conversationId: string | null, currentUserId: string | undefined) {
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [busy, setBusy] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDismissTimer = () => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = null;
  };
  const clearRingTimer = () => {
    if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
    ringTimerRef.current = null;
  };

  const applyCall = useCallback((call: Call | null) => {
    clearDismissTimer();
    setActiveCall(call);
    if (call && !["ringing", "accepted"].includes(call.status)) {
      dismissTimerRef.current = setTimeout(() => setActiveCall(null), TERMINAL_STATE_DISPLAY_MS);
    }
  }, []);

  // Refresh restoration (brief §23): on mount / conversation change,
  // recover whatever active call already exists rather than assuming a
  // fresh page load means "no call".
  const restore = useCallback(async () => {
    if (!conversationId) return;
    const call = await getCurrentCall(conversationId).catch(() => null);
    applyCall(call);
  }, [conversationId, applyCall]);

  useEffect(() => {
    setActiveCall(null);
    clearDismissTimer();
    clearRingTimer();
    restore();
  }, [conversationId, restore]);

  useEffect(() => clearDismissTimer, []);

  // The caller's (and, defensively, the callee's) own local ring timer —
  // NOT a fake frontend-only timeout: when it fires, it calls the SAME
  // backend endpoint that performs real server-side reconciliation
  // (brief §25), whose broadcast is what actually moves both parties to
  // "missed". A lost/never-fired local timer is still caught by lazy
  // reconciliation the next time either party reads this call at all.
  useEffect(() => {
    clearRingTimer();
    if (!activeCall || activeCall.status !== "ringing") return;
    const elapsedMs = Date.now() - parseUtcTimestamp(activeCall.created_at).getTime();
    const remainingMs = CALL_RING_TIMEOUT_SECONDS * 1000 - elapsedMs;
    const callId = activeCall.id;
    // Floored at 1s, never 0: if the server's own elapsed-time check
    // hasn't quite agreed yet (clock skew, request latency, or — the bug
    // actually hit during T8 testing — a client/server timestamp parsing
    // mismatch), a `getCall` response that's STILL "ringing" reruns this
    // same effect and would otherwise recompute a ~0ms remainder forever,
    // firing in a tight synchronous loop instead of settling within a
    // second or two.
    ringTimerRef.current = setTimeout(
      () => {
        getCall(callId)
          .then((call) => applyCall(call))
          .catch(() => undefined);
      },
      Math.max(1000, remainingMs)
    );
    return clearRingTimer;
  }, [activeCall, applyCall]);

  // T6/T7 reconnect sync: called by ConversationView when the socket
  // comes back after a drop, same "REST/DB stays the source of truth"
  // rule messages already follow.
  const resyncAfterReconnect = restore;

  const handleCallEvent = useCallback(
    (call: Call) => {
      if (call.conversation_id !== conversationId) return;
      applyCall(call);
    },
    [conversationId, applyCall]
  );

  // Every action below resyncs from the server instead of throwing on
  // failure. A 409 here almost always means the call's real state moved
  // out from under the button the user just clicked (the other side
  // acted first, a stale multi-tab render, a double-click racing itself)
  // — the backend correctly rejected it, and the honest fix on THIS side
  // is to re-fetch the real current state and let the UI reflect it, not
  // to let an unhandled rejection crash the whole page. REST/DB stays the
  // source of truth here exactly like every other reconnect/resync path
  // in this project already does.
  async function start(callType: CallType) {
    if (!conversationId) return;
    setBusy(false);
    try {
      const call = await apiStart(conversationId, callType);
      applyCall(call);
    } catch (err) {
      if (err instanceof CallBusyError) {
        setBusy(true);
        setTimeout(() => setBusy(false), TERMINAL_STATE_DISPLAY_MS);
        return;
      }
      await restore();
    }
  }

  async function accept() {
    if (!activeCall) return;
    try {
      applyCall(await apiAccept(activeCall.id));
    } catch {
      await restore();
    }
  }
  async function decline() {
    if (!activeCall) return;
    try {
      applyCall(await apiDecline(activeCall.id));
    } catch {
      await restore();
    }
  }
  async function cancel() {
    if (!activeCall) return;
    try {
      applyCall(await apiCancel(activeCall.id));
    } catch {
      await restore();
    }
  }
  async function end() {
    if (!activeCall) return;
    try {
      applyCall(await apiEnd(activeCall.id));
    } catch {
      await restore();
    }
  }

  return { activeCall, busy, start, accept, decline, cancel, end, handleCallEvent, resyncAfterReconnect };
}
