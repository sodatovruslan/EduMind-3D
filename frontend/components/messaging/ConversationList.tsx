"use client";

import { useState } from "react";
import useSWR from "swr";
import { MessageCircle, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale-context";
import { listConversations, listCounterparts, openConversation } from "@/lib/messaging-client";
import { formatRelativeTime } from "@/lib/messaging-time";
import { Button, Skeleton, Surface } from "@/components/design-system";
import NewConversationPicker from "./NewConversationPicker";
import UnreadBadge from "./UnreadBadge";
import MessageStatusTicks from "./MessageStatusTicks";

/**
 * T5 — real conversations only (`GET /api/conversations`, classroom-scoped
 * server-side) and a real, classroom-derived list of who's actually
 * available to message (`GET /api/conversations/counterparts`) — never a
 * guessed/hardcoded "your teacher" placeholder.
 */
export default function ConversationList({
  selectedId,
  onSelect,
  className = "",
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const { data: conversations, isLoading, error, mutate } = useSWR("conversations", listConversations);
  const { data: counterparts } = useSWR("conversation-counterparts", listCounterparts);
  const [pickerOpen, setPickerOpen] = useState(false);

  const isStudent = user?.role === "student";
  const emptyCopy = isStudent ? t.messaging.emptyStudent : t.messaging.emptyTeacher;

  async function handlePick(counterpartId: string) {
    const conversation = await openConversation(counterpartId);
    setPickerOpen(false);
    await mutate();
    onSelect(conversation.id);
  }

  return (
    <section className={`flex h-full flex-col ${className}`} data-testid="conversation-list">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-ds-title text-text-primary">{t.messaging.conversationsHeading}</h2>
        {counterparts && counterparts.length > 0 && (
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            aria-label={t.messaging.newConversationCta}
            data-testid="new-conversation-trigger"
            className="ds-focus-ring rounded-ds-control p-1.5 text-text-secondary transition-colors hover:text-text-primary"
          >
            <Plus size={18} />
          </button>
        )}
      </div>

      {pickerOpen && counterparts && (
        <NewConversationPicker counterparts={counterparts} onPick={handlePick} onClose={() => setPickerOpen(false)} />
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : error ? (
          <Surface className="p-4 text-center text-ds-body text-danger">{t.messaging.loadError}</Surface>
        ) : conversations && conversations.length > 0 ? (
          <ul className="space-y-1.5">
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  aria-current={selectedId === c.id ? "true" : undefined}
                  data-testid={`conversation-${c.id}`}
                  className={`ds-focus-ring flex w-full flex-col gap-0.5 rounded-ds-control p-3 text-left transition-colors ${
                    selectedId === c.id ? "bg-accent/10" : "hover:bg-text-primary/5"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-ds-body font-medium text-text-primary">{c.counterpart.full_name}</span>
                      {c.counterpart.online && (
                        <span
                          role="img"
                          aria-label={t.messaging.online}
                          title={t.messaging.online}
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-success"
                        />
                      )}
                    </span>
                    {c.last_message_at && (
                      <span className="shrink-0 text-ds-caption text-text-muted">{formatRelativeTime(c.last_message_at, locale, t)}</span>
                    )}
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1 truncate text-ds-caption text-text-muted">
                      {c.last_message_own_status && <MessageStatusTicks status={c.last_message_own_status} className="shrink-0" />}
                      <span className="truncate">{c.last_message_preview ?? t.messaging.noMessagesTitle}</span>
                    </span>
                    <UnreadBadge count={c.unread_count} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Surface className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <MessageCircle size={28} className="text-text-muted" aria-hidden="true" />
            <p className="text-ds-body text-text-muted">{emptyCopy}</p>
            {counterparts && counterparts.length > 0 && <Button onClick={() => setPickerOpen(true)}>{t.messaging.newConversationCta}</Button>}
          </Surface>
        )}
      </div>
    </section>
  );
}
