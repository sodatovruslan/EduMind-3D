"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { ArrowLeft, ChevronUp } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale-context";
import { getConversation, getMessages, sendMessage, type Message } from "@/lib/messaging-client";
import { useConversationSocket } from "@/lib/useConversationSocket";
import { INTL_LOCALE_TAG } from "@/lib/i18n/locales";
import { Skeleton, Surface } from "@/components/design-system";
import MessageComposer from "./MessageComposer";

/**
 * T5 — REST is the source of truth for history/sending; the WebSocket
 * (`useConversationSocket`) only pushes newly-arrived messages in, no
 * polling. `seenIds` dedupes across REST send responses, WebSocket
 * broadcast, and reconnect replay by message id — the one stable identity
 * used everywhere (brief §25). Message content is rendered as plain JSX
 * text (`{m.content}`), never `dangerouslySetInnerHTML` — React's default
 * escaping is the actual XSS boundary here, not a custom sanitizer.
 */
export default function ConversationView({ conversationId, onBack }: { conversationId: string | null; onBack: () => void }) {
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const { data: conversation } = useSWR(conversationId ? `conversation-${conversationId}` : null, () =>
    getConversation(conversationId!)
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<string>>(new Set());
  const shouldStickToBottom = useRef(true);

  const loadInitial = useCallback(async () => {
    if (!conversationId) return;
    setIsLoadingInitial(true);
    setLoadError(false);
    try {
      const page = await getMessages(conversationId);
      seenIds.current = new Set(page.messages.map((m) => m.id));
      setMessages(page.messages);
      setHasMore(page.has_more);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoadingInitial(false);
    }
  }, [conversationId]);

  useEffect(() => {
    setMessages([]);
    seenIds.current = new Set();
    shouldStickToBottom.current = true;
    loadInitial();
  }, [conversationId, loadInitial]);

  useEffect(() => {
    // Initial load / a message the current user just sent always sticks to
    // the bottom; an incoming message while the reader has scrolled up into
    // older history does not aggressively yank them back down (brief §22).
    if (shouldStickToBottom.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [messages]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    shouldStickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  async function loadOlder() {
    if (!conversationId || messages.length === 0) return;
    setIsLoadingOlder(true);
    const el = scrollRef.current;
    const previousScrollHeight = el?.scrollHeight ?? 0;
    try {
      const page = await getMessages(conversationId, messages[0].created_at);
      const fresh = page.messages.filter((m) => !seenIds.current.has(m.id));
      fresh.forEach((m) => seenIds.current.add(m.id));
      setMessages((prev) => [...fresh, ...prev]);
      setHasMore(page.has_more);
      // Preserve scroll position — loading older history must not jump the
      // reader's view (brief §22).
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - previousScrollHeight;
      });
    } finally {
      setIsLoadingOlder(false);
    }
  }

  const handleIncoming = useCallback((message: Message) => {
    if (seenIds.current.has(message.id)) return;
    seenIds.current.add(message.id);
    setMessages((prev) => [...prev, message]);
  }, []);

  const { status } = useConversationSocket(conversationId, handleIncoming);

  async function handleSend(content: string) {
    if (!conversationId) return;
    const message = await sendMessage(conversationId, content);
    if (!seenIds.current.has(message.id)) {
      seenIds.current.add(message.id);
      setMessages((prev) => [...prev, message]);
    }
    shouldStickToBottom.current = true;
  }

  if (!conversationId) {
    return (
      <Surface className="hidden h-full items-center justify-center p-6 text-center text-ds-body text-text-muted lg:flex">
        {t.messaging.noConversationSelected}
      </Surface>
    );
  }

  return (
    <Surface elevated className="flex h-full flex-col overflow-hidden" data-testid="conversation-view">
      <div className="flex items-center gap-2 border-b border-border/[0.08] p-3">
        <button
          type="button"
          onClick={onBack}
          aria-label={t.messaging.backToConversations}
          className="ds-focus-ring rounded-ds-control p-1 text-text-secondary transition-colors hover:text-text-primary lg:hidden"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-ds-body font-medium text-text-primary">{conversation?.counterpart.full_name ?? "…"}</p>
          {status !== "connected" && (
            <p className="text-ds-caption text-warning" data-testid="connection-status">
              {status === "connecting" ? t.messaging.connecting : t.messaging.disconnected}
            </p>
          )}
        </div>
      </div>

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 space-y-2 overflow-y-auto p-3">
        {hasMore && (
          <button
            type="button"
            onClick={loadOlder}
            disabled={isLoadingOlder}
            data-testid="load-older-messages"
            className="ds-focus-ring mx-auto flex items-center gap-1 rounded-full border border-border/[0.12] px-3 py-1 text-ds-caption text-text-secondary transition-colors hover:bg-text-primary/5 disabled:opacity-50"
          >
            <ChevronUp size={12} /> {t.messaging.loadOlder}
          </button>
        )}

        {isLoadingInitial ? (
          <Skeleton className="h-full min-h-[16rem] w-full" />
        ) : loadError ? (
          <p className="text-center text-ds-body text-danger">{t.messaging.loadError}</p>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center">
            <p className="text-ds-body text-text-primary">{t.messaging.noMessagesTitle}</p>
            <p className="text-ds-caption text-text-muted">{t.messaging.noMessagesBody}</p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              data-testid={`message-${m.id}`}
              className={`max-w-[80%] rounded-ds-control px-3 py-2 text-ds-body ${
                m.sender_id === user?.id ? "ml-auto bg-accent/15 text-text-primary" : "mr-auto bg-text-primary/5 text-text-primary"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              <p className="mt-1 text-ds-caption text-text-muted">
                {new Date(m.created_at).toLocaleTimeString(INTL_LOCALE_TAG[locale], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          ))
        )}
      </div>

      <MessageComposer onSend={handleSend} />
    </Surface>
  );
}
