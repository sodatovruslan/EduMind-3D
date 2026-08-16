import { ApiError, apiFetch } from "@/lib/api";

/**
 * T7 — Student <-> Teacher call SIGNALING foundation. Lifecycle only:
 * ringing/accepted/declined/cancelled/missed/ended. NO WebRTC, NO
 * getUserMedia/getDisplayMedia, NO media stream of any kind — that's a
 * future stage (T8). Thin client over backend/app/routers/calls.py, same
 * convention as lib/messaging-client.ts.
 */
export type CallType = "audio" | "video";
export type CallStatus = "ringing" | "accepted" | "declined" | "cancelled" | "missed" | "ended";

export interface CallParticipant {
  id: string;
  full_name: string;
}

export interface Call {
  id: string;
  conversation_id: string;
  caller: CallParticipant;
  callee: CallParticipant;
  call_type: CallType;
  status: CallStatus;
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
}

export class CallBusyError extends Error {
  constructor() {
    super("busy");
  }
}

export function startCall(conversationId: string, callType: CallType): Promise<Call> {
  return apiFetch<Call>("/api/calls", {
    method: "POST",
    body: JSON.stringify({ conversation_id: conversationId, call_type: callType }),
  }).catch((err) => {
    if (err instanceof ApiError && err.status === 409) throw new CallBusyError();
    throw err;
  });
}

// The current active (ringing/accepted) call for a conversation, or null
// if none — used for refresh/reconnect restoration AND as the trigger
// point for ring-timeout reconciliation (see useCallSession.ts).
export async function getCurrentCall(conversationId: string): Promise<Call | null> {
  try {
    return await apiFetch<Call>(`/api/conversations/${conversationId}/call`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export function getCall(callId: string): Promise<Call> {
  return apiFetch<Call>(`/api/calls/${callId}`);
}

export function acceptCall(callId: string): Promise<Call> {
  return apiFetch<Call>(`/api/calls/${callId}/accept`, { method: "POST" });
}

export function declineCall(callId: string): Promise<Call> {
  return apiFetch<Call>(`/api/calls/${callId}/decline`, { method: "POST" });
}

export function cancelCall(callId: string): Promise<Call> {
  return apiFetch<Call>(`/api/calls/${callId}/cancel`, { method: "POST" });
}

export function endCall(callId: string): Promise<Call> {
  return apiFetch<Call>(`/api/calls/${callId}/end`, { method: "POST" });
}

export function listCallHistory(conversationId: string): Promise<Call[]> {
  return apiFetch<Call[]>(`/api/conversations/${conversationId}/calls`);
}

export function isActiveCallStatus(status: CallStatus): boolean {
  return status === "ringing" || status === "accepted";
}
