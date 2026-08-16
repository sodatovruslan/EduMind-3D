import { apiFetch } from "@/lib/api";

/**
 * T5 — Student <-> Teacher human messaging (NOT the AI Teacher/AI
 * Assistant chat — see lib/progress-client.ts's sibling `aiChat`/AI-hint
 * clients for that, a completely separate contract and storage). Thin
 * client over backend/app/routers/messaging.py — no logic here beyond
 * request/response shaping, same convention as lib/teacher-client.ts.
 *
 * T6 adds message status (delivered_at/read_at), unread counts, and
 * presence — see each field's own comment for exactly what it means and
 * where it comes from.
 */
export type MessageStatus = "sent" | "delivered" | "read";

export interface ConversationParticipant {
  id: string;
  full_name: string;
  // T6 — presence, scoped to conversations you're already authorized to
  // see (see backend's ConversationParticipant docstring) — there is no
  // standalone "look up anyone's presence" endpoint.
  online: boolean;
  last_seen_at: string | null;
}

export interface Conversation {
  id: string;
  counterpart: ConversationParticipant;
  created_at: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  // T6 — real backend-computed unread count (messages from the
  // counterpart with no read_at yet).
  unread_count: number;
  // T6 — status of the conversation's own newest message, ONLY when it
  // was sent by the current user; null when the newest message is from
  // the counterpart, or there is no message yet. Drives the small
  // check-status indicator on your own last message in the list.
  last_message_own_status: MessageStatus | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  // T6 — see MessageStatus / getMessageStatus below for how these two
  // combine into a single status.
  delivered_at: string | null;
  read_at: string | null;
}

export interface MessagePage {
  messages: Message[];
  has_more: boolean;
}

export interface MarkReadResult {
  message_ids: string[];
}

export function getMessageStatus(message: Pick<Message, "delivered_at" | "read_at">): MessageStatus {
  if (message.read_at) return "read";
  if (message.delivered_at) return "delivered";
  return "sent";
}

export function listConversations(): Promise<Conversation[]> {
  return apiFetch<Conversation[]>("/api/conversations");
}

// Who the current user is actually allowed to open a conversation with —
// real, classroom-derived (see classroom_scope.py), never guessed by the
// frontend.
export function listCounterparts(): Promise<ConversationParticipant[]> {
  return apiFetch<ConversationParticipant[]>("/api/conversations/counterparts");
}

export function openConversation(counterpartId: string): Promise<Conversation> {
  return apiFetch<Conversation>("/api/conversations", {
    method: "POST",
    body: JSON.stringify({ counterpart_id: counterpartId }),
  });
}

export function getConversation(conversationId: string): Promise<Conversation> {
  return apiFetch<Conversation>(`/api/conversations/${conversationId}`);
}

export function getMessages(conversationId: string, before?: string, limit = 30): Promise<MessagePage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set("before", before);
  return apiFetch<MessagePage>(`/api/conversations/${conversationId}/messages?${params.toString()}`);
}

export function sendMessage(conversationId: string, content: string): Promise<Message> {
  return apiFetch<Message>(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

// T6 — the explicit, bounded mark-read action (never implied merely by
// being online/connected — see ConversationView's visibility+scroll-gated
// call site for when this actually fires).
export function markConversationRead(conversationId: string): Promise<MarkReadResult> {
  return apiFetch<MarkReadResult>(`/api/conversations/${conversationId}/read`, { method: "POST" });
}
