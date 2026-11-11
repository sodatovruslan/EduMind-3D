"use client";

import useSWR from "swr";
import { useAuth } from "@/lib/auth-context";
import { listConversations, listCounterparts } from "@/lib/messaging-client";

/**
 * Показывать ли пункт «Сообщения» в меню. Учителю — всегда. Ученику —
 * только когда есть с кем переписываться (он в классе учителя) или уже
 * есть диалоги; иначе страница была бы пустой. Ключи SWR общие с
 * ConversationList и useUnreadMessagesCount — лишних запросов нет.
 */
export function useCanSeeMessages(): boolean {
  const { user } = useAuth();
  const isStudent = user?.role === "student";
  const { data: counterparts } = useSWR(isStudent ? "conversation-counterparts" : null, listCounterparts);
  const { data: conversations } = useSWR(isStudent ? "conversations" : null, listConversations);

  if (user?.role === "teacher") return true;
  if (!isStudent) return false;
  return (counterparts?.length ?? 0) > 0 || (conversations?.length ?? 0) > 0;
}
