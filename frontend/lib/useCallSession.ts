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
    const elapsedMs = Date.now() - new Date(activeCall.created_at).getTime();
    const remainingMs = CALL_RING_TIMEOUT_SECONDS * 1000 - elapsedMs;
    const callId = activeCall.id;
    ringTimerRef.current = setTimeout(
      () => {
        getCall(callId)
          .then((call) => applyCall(call))
          .catch(() => undefined);
      },
      Math.max(0, remainingMs)
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
      throw err;
    }
  }

  async function accept() {
    if (!activeCall) return;
    applyCall(await apiAccept(activeCall.id));
  }
  async function decline() {
    if (!activeCall) return;
    applyCall(await apiDecline(activeCall.id));
  }
  async function cancel() {
    if (!activeCall) return;
    applyCall(await apiCancel(activeCall.id));
  }
  async function end() {
    if (!activeCall) return;
    applyCall(await apiEnd(activeCall.id));
  }

  return { activeCall, busy, start, accept, decline, cancel, end, handleCallEvent, resyncAfterReconnect };
}
