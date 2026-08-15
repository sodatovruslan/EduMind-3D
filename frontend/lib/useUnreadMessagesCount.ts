"use client";

import useSWR from "swr";
import { useAuth } from "@/lib/auth-context";
import { listConversations } from "@/lib/messaging-client";

/**
 * T6 — total unread count for the AppShell nav badge, shared via SWR's
 * "conversations" cache key with ConversationList: whenever that page
 * mutates the key (send, mark-read, a realtime event), this badge picks
 * up the same refreshed data for free, no separate polling loop and no
 * per-second requests (brief's explicit performance constraint) — SWR's
 * default revalidate-on-focus is the only "background" refresh here.
 * Skipped entirely for roles without messaging access (admin).
 */
export function useUnreadMessagesCount(): number {
  const { user } = useAuth();
  const canMessage = user?.role === "student" || user?.role === "teacher";
  const { data } = useSWR(canMessage ? "conversations" : null, listConversations);
  if (!data) return 0;
  return data.reduce((sum, c) => sum + c.unread_count, 0);
}
