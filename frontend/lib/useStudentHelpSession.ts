"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listCounterparts, openConversation, type ConversationParticipant } from "@/lib/messaging-client";
import {
  cancelHelpRequest as apiCancel,
  createHelpRequest as apiCreate,
  listConversationHelpRequests,
  listMyHelpRequests,
  resolveHelpRequest as apiResolve,
  isActiveHelpRequestStatus,
  type HelpContextSnapshot,
  type HelpRequest,
  type HelpWorld,
} from "@/lib/help-client";
import { useConversationSocket, isHelpSocketEvent, type ConversationSocketEvent } from "@/lib/useConversationSocket";

// How long a terminal state (declined/resolved/cancelled) stays visible
// before the panel resets to idle — same pattern/duration class as
// useCallSession.ts's own TERMINAL_STATE_DISPLAY_MS.
const TERMINAL_STATE_DISPLAY_MS = 5000;

/**
 * T10 — "Ask Teacher" session for ONE world (brief §1/§23: scoped per
 * world since dedup itself is per conversation+world). Lives inside a
 * lab/world shell, NOT inside Messages — the conversation with the
 * student's real teacher is resolved (or created) lazily, only when the
 * student actually asks, via the SAME `listCounterparts`/`openConversation`
 * messaging already uses (brief §2: no new authorization system, and
 * brief §24: never guess a teacher — listCounterparts is the real,
 * classroom-derived answer).
 *
 * Realtime: a dedicated conversation-scoped WebSocket connection (the
 * SAME `useConversationSocket` Messages already uses, brief §12 — no
 * third transport) is only opened while there's an actual active
 * (pending/accepted) request to hear updates for — not permanently, and
 * not while merely idle inside the lab.
 */
export function useStudentHelpSession(world: HelpWorld, currentUserId: string | undefined) {
  const [teachers, setTeachers] = useState<ConversationParticipant[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [activeRequest, setActiveRequest] = useState<HelpRequest | null>(null);
  const [isSending, setIsSending] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    listCounterparts()
      .then(setTeachers)
      .catch(() => setTeachers([]));
  }, []);

  const applyRequest = useCallback((request: HelpRequest | null) => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    setActiveRequest(request);
    if (request && !isActiveHelpRequestStatus(request.status)) {
      dismissTimerRef.current = setTimeout(() => setActiveRequest(null), TERMINAL_STATE_DISPLAY_MS);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  // Refresh restoration (brief §48): don't assume a page reload means "no
  // active request" — restore it from REST across every conversation the
  // student has, scoped to THIS world.
  useEffect(() => {
    if (!currentUserId) return;
    listMyHelpRequests()
      .then((all) => {
        const active = all.find((r) => r.world === world && isActiveHelpRequestStatus(r.status));
        if (active) {
          setConversationId(active.conversation_id);
          applyRequest(active);
        }
      })
      .catch(() => undefined);
  }, [currentUserId, world, applyRequest]);

  const handleSocketEvent = useCallback(
    (event: ConversationSocketEvent) => {
      if (!isHelpSocketEvent(event)) return;
      if (event.help_request.conversation_id !== conversationId) return;
      applyRequest(event.help_request);
    },
    [conversationId, applyRequest]
  );

  // Only connected while a request is actually live — never idly open
  // just because the student is inside the lab.
  useConversationSocket(activeRequest && isActiveHelpRequestStatus(activeRequest.status) ? conversationId : null, handleSocketEvent);

  const restore = useCallback(async () => {
    if (!conversationId) return;
    const history = await listConversationHelpRequests(conversationId).catch(() => []);
    const active = history.find((r) => r.world === world && isActiveHelpRequestStatus(r.status)) ?? null;
    applyRequest(active);
  }, [conversationId, world, applyRequest]);

  async function ask(teacherId: string, context: HelpContextSnapshot, studentMessage?: string) {
    setIsSending(true);
    try {
      const conversation = await openConversation(teacherId);
      setConversationId(conversation.id);
      const request = await apiCreate(conversation.id, context, studentMessage);
      applyRequest(request);
    } finally {
      setIsSending(false);
    }
  }

  async function cancel() {
    if (!activeRequest) return;
    try {
      applyRequest(await apiCancel(activeRequest.id));
    } catch {
      await restore();
    }
  }

  async function resolve() {
    if (!activeRequest) return;
    try {
      applyRequest(await apiResolve(activeRequest.id));
    } catch {
      await restore();
    }
  }

  return { teachers, activeRequest, isSending, ask, cancel, resolve };
}

function clearDismiss(ref: React.MutableRefObject<ReturnType<typeof setTimeout> | null>) {
  return () => {
    if (ref.current) clearTimeout(ref.current);
  };
}
