// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import ConversationView from "./ConversationView";
import { LocaleProvider } from "@/lib/locale-context";
import { ru } from "@/lib/i18n/dictionaries/ru";
import type { User } from "@/lib/types";
import type { Conversation, Message, MessagePage } from "@/lib/messaging-client";

// jsdom has no Element.scrollTo — same stub pattern used by the AI chat
// components' auto-scroll effect (see components/ai/AIAssistantChat.test.tsx).
Element.prototype.scrollTo = vi.fn();

let mockUser: User | null = { id: "student-1", email: "s@b.com", full_name: "Student One", role: "student", created_at: "2026-01-01" };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: mockUser, isLoading: false, login: vi.fn(), register: vi.fn(), logout: vi.fn(), refreshUser: vi.fn() }),
}));

const CONVERSATION: Conversation = {
  id: "conv-1",
  counterpart: { id: "teacher-1", full_name: "Teacher One", online: false, last_seen_at: null },
  created_at: "2026-01-01T00:00:00Z",
  last_message_at: null,
  last_message_preview: null,
  unread_count: 0,
  last_message_own_status: null,
};

const getConversationMock = vi.fn();
const getMessagesMock = vi.fn();
const sendMessageMock = vi.fn();
const markConversationReadMock = vi.fn();
vi.mock("@/lib/messaging-client", () => ({
  getConversation: (...args: unknown[]) => getConversationMock(...args),
  getMessages: (...args: unknown[]) => getMessagesMock(...args),
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
  markConversationRead: (...args: unknown[]) => markConversationReadMock(...args),
  getMessageStatus: (m: { delivered_at: string | null; read_at: string | null }) =>
    m.read_at ? "read" : m.delivered_at ? "delivered" : "sent",
}));

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly OPEN = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  url: string;
  readyState = FakeWebSocket.OPEN;
  send = vi.fn();
  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }
  close() {}
  emitMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}
// @ts-expect-error — minimal test stub, not a full WebSocket implementation
global.WebSocket = FakeWebSocket;

function renderView(conversationId: string | null = "conv-1") {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <LocaleProvider>
        <ConversationView conversationId={conversationId} onBack={vi.fn()} />
      </LocaleProvider>
    </SWRConfig>
  );
}

describe("ConversationView — T5", () => {
  beforeEach(() => {
    mockUser = { id: "student-1", email: "s@b.com", full_name: "Student One", role: "student", created_at: "2026-01-01" };
    getConversationMock.mockReset().mockResolvedValue(CONVERSATION);
    getMessagesMock.mockReset().mockResolvedValue({ messages: [], has_more: false } satisfies MessagePage);
    sendMessageMock.mockReset();
    FakeWebSocket.instances = [];
    window.localStorage.setItem("edumind_access_token", "fake-token");
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("shows the honest empty state when no conversation is selected", async () => {
    renderView(null);
    expect(await screen.findByText(ru.messaging.noConversationSelected)).toBeDefined();
  });

  it("shows a real honest empty state for a conversation with no messages yet", async () => {
    renderView();
    expect(await screen.findByText(ru.messaging.noMessagesTitle)).toBeDefined();
  });

  it("renders real message history in chronological order", async () => {
    getMessagesMock.mockResolvedValue({
      messages: [
        {
          id: "m1",
          conversation_id: "conv-1",
          sender_id: "teacher-1",
          content: "Hello",
          created_at: "2026-01-01T10:00:00Z",
          delivered_at: null,
          read_at: null,
        },
        {
          id: "m2",
          conversation_id: "conv-1",
          sender_id: "student-1",
          content: "Hi back",
          created_at: "2026-01-01T10:01:00Z",
          delivered_at: null,
          read_at: null,
        },
      ],
      has_more: false,
    } satisfies MessagePage);
    renderView();

    expect(await screen.findByText("Hello")).toBeDefined();
    expect(await screen.findByText("Hi back")).toBeDefined();
  });

  it("sends a real message and renders it immediately", async () => {
    sendMessageMock.mockResolvedValue({
      id: "m-new",
      conversation_id: "conv-1",
      sender_id: "student-1",
      content: "Здравствуйте!",
      created_at: "2026-01-01T10:05:00Z",
      delivered_at: null,
      read_at: null,
    } satisfies Message);
    renderView();
    await screen.findByText(ru.messaging.noMessagesTitle);

    const input = screen.getByTestId("message-composer-input");
    fireEvent.change(input, { target: { value: "Здравствуйте!" } });
    fireEvent.click(screen.getByTestId("message-composer-send"));

    expect(await screen.findByText("Здравствуйте!")).toBeDefined();
    expect(sendMessageMock).toHaveBeenCalledWith("conv-1", "Здравствуйте!");
  });

  it("delivers an incoming WebSocket message in realtime", async () => {
    renderView();
    await screen.findByText(ru.messaging.noMessagesTitle);
    await waitFor(() => expect(FakeWebSocket.instances.length).toBe(1));

    act(() => {
      FakeWebSocket.instances[0].emitMessage({
        type: "message",
        message: { id: "m-live", conversation_id: "conv-1", sender_id: "teacher-1", content: "Live update", created_at: "2026-01-01T10:10:00Z" },
      });
    });

    expect(await screen.findByText("Live update")).toBeDefined();
  });

  it("D25: does not duplicate a message that arrives both via send and via the socket echoing it back", async () => {
    sendMessageMock.mockResolvedValue({
      id: "m-dup",
      conversation_id: "conv-1",
      sender_id: "student-1",
      content: "one and only",
      created_at: "2026-01-01T10:05:00Z",
      delivered_at: null,
      read_at: null,
    } satisfies Message);
    renderView();
    await screen.findByText(ru.messaging.noMessagesTitle);
    await waitFor(() => expect(FakeWebSocket.instances.length).toBe(1));

    fireEvent.change(screen.getByTestId("message-composer-input"), { target: { value: "one and only" } });
    fireEvent.click(screen.getByTestId("message-composer-send"));
    await screen.findByText("one and only");

    act(() => {
      FakeWebSocket.instances[0].emitMessage({
        type: "message",
        message: { id: "m-dup", conversation_id: "conv-1", sender_id: "student-1", content: "one and only", created_at: "2026-01-01T10:05:00Z" },
      });
    });

    expect(screen.getAllByText("one and only")).toHaveLength(1);
  });
});

describe("ConversationView — T6 status ticks, presence, typing, read-on-open", () => {
  beforeEach(() => {
    mockUser = { id: "student-1", email: "s@b.com", full_name: "Student One", role: "student", created_at: "2026-01-01" };
    getConversationMock.mockReset().mockResolvedValue(CONVERSATION);
    getMessagesMock.mockReset().mockResolvedValue({ messages: [], has_more: false } satisfies MessagePage);
    sendMessageMock.mockReset();
    markConversationReadMock.mockReset().mockResolvedValue({ message_ids: [] });
    FakeWebSocket.instances = [];
    window.localStorage.setItem("edumind_access_token", "fake-token");
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("shows a single check for sent, double for delivered, accent double for read — with an accessible label for each", async () => {
    getMessagesMock.mockResolvedValue({
      messages: [
        { id: "m-sent", conversation_id: "conv-1", sender_id: "student-1", content: "sent one", created_at: "2026-01-01T10:00:00Z", delivered_at: null, read_at: null },
        { id: "m-delivered", conversation_id: "conv-1", sender_id: "student-1", content: "delivered one", created_at: "2026-01-01T10:01:00Z", delivered_at: "2026-01-01T10:01:05Z", read_at: null },
        { id: "m-read", conversation_id: "conv-1", sender_id: "student-1", content: "read one", created_at: "2026-01-01T10:02:00Z", delivered_at: "2026-01-01T10:02:05Z", read_at: "2026-01-01T10:03:00Z" },
      ],
      has_more: false,
    } satisfies MessagePage);
    renderView();
    await screen.findByText("sent one");

    expect(screen.getAllByLabelText(ru.messaging.statusSent)).toHaveLength(1);
    expect(screen.getAllByLabelText(ru.messaging.statusDelivered)).toHaveLength(1);
    expect(screen.getAllByLabelText(ru.messaging.statusRead)).toHaveLength(1);
  });

  it("shows presence: online with the online label, or last-seen when offline with a timestamp", async () => {
    getConversationMock.mockResolvedValue({
      ...CONVERSATION,
      counterpart: { ...CONVERSATION.counterpart, online: true },
    });
    renderView();
    expect(await screen.findByTestId("presence-online")).toBeDefined();
    cleanup();

    getConversationMock.mockResolvedValue({
      ...CONVERSATION,
      counterpart: { ...CONVERSATION.counterpart, online: false, last_seen_at: "2026-01-01T09:00:00Z" },
    });
    renderView();
    expect(await screen.findByTestId("presence-last-seen")).toBeDefined();
  });

  it("shows the typing indicator on typing:start from the counterpart and clears it on typing:stop", async () => {
    renderView();
    await screen.findByText(ru.messaging.noMessagesTitle);
    await waitFor(() => expect(FakeWebSocket.instances.length).toBe(1));

    act(() => {
      FakeWebSocket.instances[0].emitMessage({ type: "typing:start", user_id: "teacher-1" });
    });
    expect(await screen.findByText(ru.messaging.typingIndicator("Teacher One"))).toBeDefined();

    act(() => {
      FakeWebSocket.instances[0].emitMessage({ type: "typing:stop", user_id: "teacher-1" });
    });
    await waitFor(() => expect(screen.queryByText(ru.messaging.typingIndicator("Teacher One"))).toBeNull());
  });

  it("ignores a typing signal from someone who isn't the counterpart", async () => {
    renderView();
    await screen.findByText(ru.messaging.noMessagesTitle);
    await waitFor(() => expect(FakeWebSocket.instances.length).toBe(1));

    act(() => {
      FakeWebSocket.instances[0].emitMessage({ type: "typing:start", user_id: "someone-unrelated" });
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText(ru.messaging.typingIndicator("Teacher One"))).toBeNull();
  });

  it("marks unread messages read once the conversation is loaded and visible (read-on-open)", async () => {
    getMessagesMock.mockResolvedValue({
      messages: [
        { id: "m1", conversation_id: "conv-1", sender_id: "teacher-1", content: "unread from teacher", created_at: "2026-01-01T10:00:00Z", delivered_at: null, read_at: null },
      ],
      has_more: false,
    } satisfies MessagePage);
    renderView();
    await screen.findByText("unread from teacher");

    await waitFor(() => expect(markConversationReadMock).toHaveBeenCalledWith("conv-1"));
  });

  it("does NOT mark read while the tab is hidden, even with unread messages present", async () => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    getMessagesMock.mockResolvedValue({
      messages: [
        { id: "m1", conversation_id: "conv-1", sender_id: "teacher-1", content: "unread from teacher", created_at: "2026-01-01T10:00:00Z", delivered_at: null, read_at: null },
      ],
      has_more: false,
    } satisfies MessagePage);
    renderView();
    await screen.findByText("unread from teacher");

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(markConversationReadMock).not.toHaveBeenCalled();
  });

  it("does not call mark-read at all when there is nothing unread", async () => {
    getMessagesMock.mockResolvedValue({
      messages: [
        { id: "m1", conversation_id: "conv-1", sender_id: "student-1", content: "my own message", created_at: "2026-01-01T10:00:00Z", delivered_at: null, read_at: null },
      ],
      has_more: false,
    } satisfies MessagePage);
    renderView();
    await screen.findByText("my own message");

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(markConversationReadMock).not.toHaveBeenCalled();
  });
});
