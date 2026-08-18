"use client";

import { useCallback, useEffect, useState } from "react";
import {
  acceptHelpRequest as apiAccept,
  declineHelpRequest as apiDecline,
  listMyHelpRequests,
  resolveHelpRequest as apiResolve,
  type HelpRequest,
} from "@/lib/help-client";

/**
 * T10 §35 — the Teacher Dashboard's "Help Requests (N)" indicator and the
 * request list backing it. Deliberately REST-refresh based (mount + tab
 * regaining focus), not a live socket: the existing conversation-scoped
 * WebSocket transport only exists while a specific ConversationView is
 * mounted (see useConversationSocket.ts), and the Dashboard has no single
 * conversation to attach one to — inventing a broader "presence anchor"
 * socket just for this would be exactly the kind of extra transport
 * complexity brief §12 warns against. If the teacher ALSO has Messages
 * open, they get the real realtime push there (ConversationView's own
 * socket already carries `help:*` events for its conversation). No
 * interval polling either way (brief §43) — `focus` is a real user
 * action, not a timer.
 */
export function useTeacherHelpRequests() {
  const [requests, setRequests] = useState<HelpRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    return listMyHelpRequests()
      .then(setRequests)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    function onFocus() {
      refresh();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  async function accept(id: string) {
    const updated = await apiAccept(id);
    setRequests((prev) => prev.map((r) => (r.id === id ? updated : r)));
    return updated;
  }

  async function decline(id: string) {
    const updated = await apiDecline(id);
    setRequests((prev) => prev.map((r) => (r.id === id ? updated : r)));
    return updated;
  }

  async function resolve(id: string) {
    const updated = await apiResolve(id);
    setRequests((prev) => prev.map((r) => (r.id === id ? updated : r)));
    return updated;
  }

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return { requests, loading, pendingCount, accept, decline, resolve, refresh };
}
