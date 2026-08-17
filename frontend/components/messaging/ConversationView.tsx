"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { ArrowLeft, ChevronUp } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale-context";
import {
  getConversation,
  getMessageStatus,
  getMessages,
  markConversationRead,
  sendMessage,
  type Message,
} from "@/lib/messaging-client";
import {
  isCallSocketEvent,
  isWebRTCSignalEvent,
  useConversationSocket,
  type ConversationSocketEvent,
  type WebRTCSignalEvent,
} from "@/lib/useConversationSocket";
import { formatBubbleTime, formatDateSeparator, formatFullDateTime, parseUtcTimestamp } from "@/lib/messaging-time";
import { listCallHistory, type Call } from "@/lib/call-client";
import { useCallSession } from "@/lib/useCallSession";
import { useWebRTCSession } from "@/lib/useWebRTCSession";
import { Skeleton, Surface } from "@/components/design-system";
import MessageComposer from "./MessageComposer";
import MessageStatusTicks from "./MessageStatusTicks";
import PresenceLabel from "./PresenceLabel";
import TypingIndicator from "./TypingIndicator";
import CallButtons from "./CallButtons";
import CallPanel from "./CallPanel";
import CallHistoryEntry from "./CallHistoryEntry";

// T6 — if no typing:stop (and no new message) arrives within this long,
// the indicator clears itself client-side (brief: "auto-stop timeout if
// the client vanishes without an explicit stop event"). Comfortably
// longer than MessageComposer's own 3s stop-debounce so a normal stop
// event always wins the race.
const TYPING_INDICATOR_TIMEOUT_MS = 6000;

type RenderItem =
  | { kind: "separator"; key: string; label: string }
  | { kind: "message"; key: string; message: Message; timestamp: string }
  | { kind: "call"; key: string; call: Call; timestamp: string };

/**
 * T5 — REST is the source of truth for history/sending; the WebSocket
 * (`useConversationSocket`) only pushes newly-arrived events in, no
 * polling. `seenIds` dedupes across REST send responses, WebSocket
 * broadcast, and reconnect replay by message id — the one stable identity
 * used everywhere (brief §25). Message content is rendered as plain JSX
 * text (`{m.content}`), never `dangerouslySetInnerHTML` — React's default
 * escaping is the actual XSS boundary here, not a custom sanitizer.
 *
 * T6 adds: delivered/read status ticks, presence + last-seen in the
 * header, a typing indicator, date separators, and the read-on-open rule
 * (only marks read while the tab is actually visible AND scrolled to/near
 * the bottom — see maybeMarkRead below). On reconnect, REST is re-fetched
 * rather than trusting that every realtime event was received while
 * disconnected (brief §20/§23).
 */
export default function ConversationView({ conversationId, onBack }: { conversationId: string | null; onBack: () => void }) {
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const { mutate: mutateGlobal } = useSWRConfig();
  const { data: conversation, mutate: mutateConversation } = useSWR(
    conversationId ? `conversation-${conversationId}` : null,
    () => getConversation(conversationId!)
  );
  // Breaks a genuine three-way circular dependency: useConversationSocket
  // needs handleSocketEvent, handleSocketEvent needs to reach
  // useCallSession's/useWebRTCSession's own event handlers, and those two
  // hooks need `sendEvent` — which useConversationSocket only returns
  // AFTER being called. Same ref-indirection useConversationSocket
  // already uses internally for its own `onEvent` callback, applied one
  // level up here so call order can be: socket -> call session -> webrtc
  // session, each fed by the previous one's output, with
  // handleSocketEvent's OWN identity never depending on any of them.
  const latestHandlersRef = useRef<{
    handleCallEvent: (call: Call) => void;
    handleSignalEvent: (event: WebRTCSignalEvent) => void;
  }>({ handleCallEvent: () => {}, handleSignalEvent: () => {} });

  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [presence, setPresence] = useState<{ online: boolean; last_seen_at: string | null } | null>(null);
  const [counterpartTyping, setCounterpartTyping] = useState(false);
  const [callHistory, setCallHistory] = useState<Call[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<string>>(new Set());
  const shouldStickToBottom = useRef(true);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markReadInFlight = useRef(false);
  const hadDisconnectedRef = useRef(false);

  const counterpartId = conversation?.counterpart.id ?? null;

  useEffect(() => {
    if (conversation) setPresence({ online: conversation.counterpart.online, last_seen_at: conversation.counterpart.last_seen_at });
  }, [conversation]);

  const loadInitial = useCallback(async () => {
    if (!conversationId) return;
    setIsLoadingInitial(true);
    setLoadError(false);
    try {
      const [page, calls] = await Promise.all([
        getMessages(conversationId),
        listCallHistory(conversationId).catch(() => [] as Call[]),
      ]);
      seenIds.current = new Set(page.messages.map((m) => m.id));
      setMessages(page.messages);
      setHasMore(page.has_more);
      setCallHistory(calls);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoadingInitial(false);
    }
  }, [conversationId]);

  useEffect(() => {
    setMessages([]);
    setCallHistory([]);
    seenIds.current = new Set();
    shouldStickToBottom.current = true;
    setCounterpartTyping(false);
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

  function applyStatusUpdate(messageIds: string[], patch: Partial<Pick<Message, "delivered_at" | "read_at">>) {
    const idSet = new Set(messageIds);
    setMessages((prev) => prev.map((m) => (idSet.has(m.id) ? { ...m, ...patch } : m)));
  }

  // T6 — read-on-open: only fires while the tab is actually visible AND
  // the reader is at/near the bottom of history (never while scrolled up
  // into old messages, never while backgrounded) — an explicit
  // conversation-view acknowledgement, not merely being connected.
  const maybeMarkRead = useCallback(async () => {
    if (!conversationId || !user) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    if (!shouldStickToBottom.current) return;
    const hasUnread = messages.some((m) => m.sender_id !== user.id && !m.read_at);
    if (!hasUnread || markReadInFlight.current) return;
    markReadInFlight.current = true;
    try {
      const result = await markConversationRead(conversationId);
      if (result.message_ids.length > 0) {
        applyStatusUpdate(result.message_ids, { read_at: new Date().toISOString() });
        mutateGlobal("conversations");
      }
    } catch {
      // best-effort — REST/DB stays the source of truth; a failed call here
      // just means these stay unread until the next qualifying trigger
    } finally {
      markReadInFlight.current = false;
    }
  }, [conversationId, user, messages, mutateGlobal]);

  useEffect(() => {
    maybeMarkRead();
  }, [maybeMarkRead]);

  useEffect(() => {
    function onVisibilityChange() {
      maybeMarkRead();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [maybeMarkRead]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    shouldStickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (shouldStickToBottom.current) maybeMarkRead();
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

  function clearTypingTimeout() {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }

  const handleSocketEvent = useCallback(
    (event: ConversationSocketEvent) => {
      if (isCallSocketEvent(event)) {
        latestHandlersRef.current.handleCallEvent(event.call);
        return;
      }
      if (isWebRTCSignalEvent(event)) {
        latestHandlersRef.current.handleSignalEvent(event);
        return;
      }
      switch (event.type) {
        case "message": {
          if (seenIds.current.has(event.message.id)) return;
          seenIds.current.add(event.message.id);
          setMessages((prev) => [...prev, event.message]);
          if (event.message.sender_id === counterpartId) {
            setCounterpartTyping(false);
            clearTypingTimeout();
          }
          return;
        }
        case "message:delivered":
          applyStatusUpdate(event.message_ids, { delivered_at: event.delivered_at });
          return;
        case "message:read":
          applyStatusUpdate(event.message_ids, { read_at: event.read_at });
          mutateGlobal("conversations");
          return;
        case "typing:start":
          if (event.user_id !== counterpartId) return;
          setCounterpartTyping(true);
          clearTypingTimeout();
          typingTimeoutRef.current = setTimeout(() => setCounterpartTyping(false), TYPING_INDICATOR_TIMEOUT_MS);
          return;
        case "typing:stop":
          if (event.user_id !== counterpartId) return;
          clearTypingTimeout();
          setCounterpartTyping(false);
          return;
        case "presence:update":
          if (event.user_id !== counterpartId) return;
          setPresence({ online: event.online, last_seen_at: event.last_seen_at });
          return;
      }
    },
    [counterpartId, mutateGlobal]
  );

  const { status, sendEvent } = useConversationSocket(conversationId, handleSocketEvent);

  const {
    activeCall,
    busy: callBusy,
    start: startCall,
    accept: acceptCall,
    decline: declineCall,
    cancel: cancelCall,
    end: endCall,
    handleCallEvent,
    resyncAfterReconnect,
  } = useCallSession(conversationId, user?.id);

  const webrtc = useWebRTCSession(activeCall, user?.id, sendEvent);

  // Keep the ref current every render — see its own declaration above for
  // why this indirection exists at all.
  latestHandlersRef.current = { handleCallEvent, handleSignalEvent: webrtc.handleSignalEvent };

  // A finished call (declined/cancelled/missed/ended) joins the permanent
  // inline history the moment it's over — CallPanel/CallMediaSurface only
  // show it briefly, this is what keeps it in the timeline afterward.
  useEffect(() => {
    const call = activeCall;
    if (!call || call.status === "ringing" || call.status === "accepted") return;
    setCallHistory((prev) => (prev.some((c) => c.id === call.id) ? prev.map((c) => (c.id === call.id ? call : c)) : [...prev, call]));
  }, [activeCall]);

  useEffect(() => {
    // Reconnect sync (brief §20): REST/DB stays the source of truth — a
    // fresh connection after a drop does NOT assume every event that
    // happened while disconnected was replayed, it re-fetches instead.
    if (status === "disconnected") hadDisconnectedRef.current = true;
    if (status === "connected" && hadDisconnectedRef.current) {
      hadDisconnectedRef.current = false;
      loadInitial();
      mutateConversation();
      resyncAfterReconnect();
    }
  }, [status, loadInitial, mutateConversation, resyncAfterReconnect]);

  useEffect(() => clearTypingTimeout, []);

  async function handleSend(content: string) {
    if (!conversationId) return;
    const message = await sendMessage(conversationId, content);
    if (!seenIds.current.has(message.id)) {
      seenIds.current.add(message.id);
      setMessages((prev) => [...prev, message]);
    }
    shouldStickToBottom.current = true;
    mutateGlobal("conversations");
  }

  function handleTyping(isTyping: boolean) {
    sendEvent({ type: isTyping ? "typing:start" : "typing:stop" });
  }

  const renderItems = useMemo<RenderItem[]>(() => {
    // Calls merged into the SAME timeline as messages (brief §17), sorted
    // by their own timestamp — call history is fetched once, unpaginated
    // (a conversation realistically has far fewer calls than messages),
    // so a call older than the currently-loaded message page can appear
    // above the "load earlier messages" button; a documented simplification,
    // not incorrect data.
    const merged: Array<{ timestamp: string } & ({ kind: "message"; message: Message } | { kind: "call"; call: Call })> = [
      ...messages.map((message) => ({ kind: "message" as const, message, timestamp: message.created_at })),
      ...callHistory.map((call) => ({ kind: "call" as const, call, timestamp: call.created_at })),
    ].sort((a, b) => parseUtcTimestamp(a.timestamp).getTime() - parseUtcTimestamp(b.timestamp).getTime());

    const items: RenderItem[] = [];
    let lastDay: string | null = null;
    for (const entry of merged) {
      const day = parseUtcTimestamp(entry.timestamp).toDateString();
      if (day !== lastDay) {
        items.push({ kind: "separator", key: `sep-${entry.kind}-${entry.timestamp}`, label: formatDateSeparator(entry.timestamp, locale, t) });
        lastDay = day;
      }
      if (entry.kind === "message") {
        items.push({ kind: "message", key: entry.message.id, message: entry.message, timestamp: entry.timestamp });
      } else {
        items.push({ kind: "call", key: entry.call.id, call: entry.call, timestamp: entry.timestamp });
      }
    }
    return items;
  }, [messages, callHistory, locale, t]);

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
          {presence && <PresenceLabel online={presence.online} lastSeenAt={presence.last_seen_at} />}
          {status !== "connected" && (
            <p className="text-ds-caption text-warning" data-testid="connection-status">
              {status === "connecting" ? t.messaging.connecting : t.messaging.disconnected}
            </p>
          )}
        </div>
        <CallButtons
          disabled={!!activeCall}
          onStartAudio={() => startCall("audio")}
          onStartVideo={() => startCall("video")}
        />
      </div>

      <div className="px-3 pt-3">
        {callBusy && (
          <div className="mb-3 rounded-ds-control bg-warning/10 px-3 py-2 text-ds-caption text-warning" role="alert" data-testid="call-busy-toast">
            {t.calls.busy}
          </div>
        )}
        {activeCall && (
          <CallPanel
            call={activeCall}
            currentUserId={user?.id}
            onAccept={acceptCall}
            onDecline={declineCall}
            onCancel={cancelCall}
            onEnd={endCall}
            mediaState={webrtc.mediaState}
            localStream={webrtc.localStream}
            remoteStream={webrtc.remoteStream}
            isAudioMuted={webrtc.isAudioMuted}
            isVideoDisabled={webrtc.isVideoDisabled}
            remoteAudioMuted={webrtc.remoteAudioMuted}
            remoteVideoDisabled={webrtc.remoteVideoDisabled}
            mediaError={webrtc.mediaError}
            isMediaOwner={webrtc.isMediaOwner}
            onToggleMute={webrtc.toggleMute}
            onToggleCamera={webrtc.toggleCamera}
            onReconnectToCall={webrtc.reconnectToCall}
          />
        )}
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
        ) : messages.length === 0 && callHistory.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center">
            <p className="text-ds-body text-text-primary">{t.messaging.noMessagesTitle}</p>
            <p className="text-ds-caption text-text-muted">{t.messaging.noMessagesBody}</p>
          </div>
        ) : (
          renderItems.map((item) =>
            item.kind === "separator" ? (
              <div key={item.key} className="py-1 text-center text-ds-caption text-text-muted">
                {item.label}
              </div>
            ) : item.kind === "call" ? (
              <CallHistoryEntry key={item.key} call={item.call} />
            ) : (
              <div
                key={item.key}
                data-testid={`message-${item.message.id}`}
                className={`max-w-[80%] rounded-ds-control px-3 py-2 text-ds-body ${
                  item.message.sender_id === user?.id ? "ml-auto bg-accent/15 text-text-primary" : "mr-auto bg-text-primary/5 text-text-primary"
                }`}
              >
                <p className="whitespace-pre-wrap">{item.message.content}</p>
                <p
                  className="mt-1 flex items-center justify-end gap-1 text-ds-caption text-text-muted"
                  title={formatFullDateTime(item.message.created_at, locale)}
                >
                  {formatBubbleTime(item.message.created_at, locale)}
                  {item.message.sender_id === user?.id && <MessageStatusTicks status={getMessageStatus(item.message)} />}
                </p>
              </div>
            )
          )
        )}
      </div>

      <TypingIndicator isTyping={counterpartTyping} name={conversation?.counterpart.full_name ?? ""} />
      <MessageComposer onSend={handleSend} onTyping={handleTyping} />
    </Surface>
  );
}
