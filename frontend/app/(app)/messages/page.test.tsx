// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import MessagesPage from "./page";
import { LocaleProvider } from "@/lib/locale-context";
import { ru } from "@/lib/i18n/dictionaries/ru";
import type { User } from "@/lib/types";
import type { Conversation } from "@/lib/messaging-client";

Element.prototype.scrollTo = vi.fn();

let mockUser: User | null = { id: "student-1", email: "s@b.com", full_name: "Student One", role: "student", created_at: "2026-01-01" };
const replaceMock = vi.fn();
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: mockUser, isLoading: false, login: vi.fn(), register: vi.fn(), logout: vi.fn(), refreshUser: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock }),
  usePathname: () => "/messages",
}));

let mockConversations: Conversation[] = [];
vi.mock("@/lib/messaging-client", () => ({
  listConversations: () => Promise.resolve(mockConversations),
  listCounterparts: () => Promise.resolve([]),
  openConversation: vi.fn(),
  getConversation: (id: string) => Promise.resolve(mockConversations.find((c) => c.id === id)),
  getMessages: () => Promise.resolve({ messages: [], has_more: false }),
  sendMessage: vi.fn(),
}));

class FakeWebSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(_url: string) {}
  close() {}
}
// @ts-expect-error — minimal test stub
global.WebSocket = FakeWebSocket;

function renderPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <LocaleProvider>
        <MessagesPage />
      </LocaleProvider>
    </SWRConfig>
  );
}

describe("MessagesPage — T5", () => {
  beforeEach(() => {
    mockUser = { id: "student-1", email: "s@b.com", full_name: "Student One", role: "student", created_at: "2026-01-01" };
    mockConversations = [];
    replaceMock.mockReset();
    window.localStorage.setItem("edumind_access_token", "fake-token");
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("is reachable by a student", async () => {
    renderPage();
    expect(await screen.findByText(ru.messaging.title)).toBeDefined();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("is reachable by a teacher", async () => {
    mockUser = { id: "teacher-1", email: "t@b.com", full_name: "Teacher One", role: "teacher", created_at: "2026-01-01" };
    renderPage();
    expect(await screen.findByText(ru.messaging.title)).toBeDefined();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("redirects an admin away — messaging is not auto-granted to admins", async () => {
    mockUser = { id: "admin-1", email: "a@b.com", full_name: "Admin One", role: "admin", created_at: "2026-01-01" };
    renderPage();
    await act(async () => {});
    expect(replaceMock).toHaveBeenCalledWith("/dashboard");
  });

  it("mobile flow: selecting a conversation swaps the list for the conversation view with a working back control", async () => {
    mockConversations = [
      {
        id: "conv-1",
        counterpart: { id: "teacher-1", full_name: "Мария Иванова" },
        created_at: "2026-01-01T00:00:00Z",
        last_message_at: null,
        last_message_preview: null,
      },
    ];
    renderPage();

    const conversationButton = await screen.findByTestId("conversation-conv-1");
    fireEvent.click(conversationButton);

    await screen.findByTestId("conversation-view");
    expect(screen.getByTestId("conversation-view-pane").className).not.toContain("hidden");
    expect(screen.getByTestId("conversation-list-pane").className).toContain("hidden");

    const backButton = screen.getByLabelText(ru.messaging.backToConversations);
    fireEvent.click(backButton);
    expect(screen.getByTestId("conversation-list-pane").className).not.toContain("hidden");
  });
});
