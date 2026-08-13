import { apiFetch } from "@/lib/api";

/**
 * T5 — Student <-> Teacher human messaging (NOT the AI Teacher/AI
 * Assistant chat — see lib/progress-client.ts's sibling `aiChat`/AI-hint
 * clients for that, a completely separate contract and storage). Thin
 * client over backend/app/routers/messaging.py — no logic here beyond
 * request/response shaping, same convention as lib/teacher-client.ts.
 */
export interface ConversationParticipant {
  id: string;
  full_name: string;
}

export interface Conversation {
  id: string;
  counterpart: ConversationParticipant;
  created_at: string;
  last_message_at: string | null;
  last_message_preview: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export interface MessagePage {
  messages: Message[];
  has_more: boolean;
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
