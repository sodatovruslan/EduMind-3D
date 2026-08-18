import { apiFetch } from "@/lib/api";

/**
 * T10 — Student -> Teacher CONTEXTUAL HELP requests ("Ask Teacher" from
 * inside a lab). Thin REST client, same convention as call-client.ts —
 * REST/DB stays the source of truth, realtime (see useHelpSession.ts)
 * only pushes updates in, never the only way state changes.
 */
export type HelpWorld = "electricity" | "chemistry" | "geo";
export type HelpRequestStatus = "pending" | "accepted" | "declined" | "resolved" | "cancelled";

export interface HelpParticipant {
  id: string;
  full_name: string;
}

// Mirrors backend/app/schemas/help.py's HelpContextSnapshot exactly —
// small, whitelisted, renderer-independent fields only (never raw
// Three.js/MapLibre objects, never a full scene/inventory graph). Built
// by lib/help/contextAdapters.ts from each world's EXISTING AI-context
// builder, never assembled ad hoc per call site.
export interface HelpContextSnapshot {
  world: HelpWorld;
  context_version: number;
  simulation_id?: string | null;
  experiment_id?: string | null;
  task_id?: string | null;
  task_title?: string | null;
  current_step?: string | null;
  progress?: number | null;
  selected_object?: string | null;
  safety_state?: string | null;
  measurements?: Record<string, string> | null;
  extra?: Record<string, string> | null;
}

export interface HelpRequest {
  id: string;
  conversation_id: string;
  student: HelpParticipant;
  teacher: HelpParticipant;
  world: HelpWorld;
  context_snapshot: HelpContextSnapshot;
  student_message: string | null;
  status: HelpRequestStatus;
  call_id: string | null;
  created_at: string;
  accepted_at: string | null;
  resolved_at: string | null;
}

export function createHelpRequest(
  conversationId: string,
  context: HelpContextSnapshot,
  studentMessage?: string
): Promise<HelpRequest> {
  return apiFetch<HelpRequest>("/api/help-requests", {
    method: "POST",
    body: JSON.stringify({ conversation_id: conversationId, context, student_message: studentMessage ?? null }),
  });
}

export function getHelpRequest(helpRequestId: string): Promise<HelpRequest> {
  return apiFetch<HelpRequest>(`/api/help-requests/${helpRequestId}`);
}

export function listMyHelpRequests(): Promise<HelpRequest[]> {
  return apiFetch<HelpRequest[]>("/api/help-requests");
}

export function listConversationHelpRequests(conversationId: string): Promise<HelpRequest[]> {
  return apiFetch<HelpRequest[]>(`/api/conversations/${conversationId}/help-requests`);
}

export function acceptHelpRequest(helpRequestId: string): Promise<HelpRequest> {
  return apiFetch<HelpRequest>(`/api/help-requests/${helpRequestId}/accept`, { method: "POST" });
}

export function declineHelpRequest(helpRequestId: string): Promise<HelpRequest> {
  return apiFetch<HelpRequest>(`/api/help-requests/${helpRequestId}/decline`, { method: "POST" });
}

export function cancelHelpRequest(helpRequestId: string): Promise<HelpRequest> {
  return apiFetch<HelpRequest>(`/api/help-requests/${helpRequestId}/cancel`, { method: "POST" });
}

export function resolveHelpRequest(helpRequestId: string): Promise<HelpRequest> {
  return apiFetch<HelpRequest>(`/api/help-requests/${helpRequestId}/resolve`, { method: "POST" });
}

export function linkHelpRequestCall(helpRequestId: string, callId: string): Promise<HelpRequest> {
  return apiFetch<HelpRequest>(`/api/help-requests/${helpRequestId}/link-call`, {
    method: "POST",
    body: JSON.stringify({ call_id: callId }),
  });
}

export function isActiveHelpRequestStatus(status: HelpRequestStatus): boolean {
  return status === "pending" || status === "accepted";
}
