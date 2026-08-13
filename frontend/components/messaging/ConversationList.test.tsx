// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import ConversationList from "./ConversationList";
import { LocaleProvider } from "@/lib/locale-context";
import { ru } from "@/lib/i18n/dictionaries/ru";
import type { User } from "@/lib/types";
import type { Conversation, ConversationParticipant } from "@/lib/messaging-client";

let mockUser: User | null = { id: "student-1", email: "s@b.com", full_name: "Student One", role: "student", created_at: "2026-01-01" };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: mockUser, isLoading: false, login: vi.fn(), register: vi.fn(), logout: vi.fn(), refreshUser: vi.fn() }),
}));

let mockConversations: Conversation[] = [];
let mockCounterparts: ConversationParticipant[] = [];
const openConversationMock = vi.fn();
vi.mock("@/lib/messaging-client", () => ({
  listConversations: () => Promise.resolve(mockConversations),
  listCounterparts: () => Promise.resolve(mockCounterparts),
  openConversation: (...args: unknown[]) => openConversationMock(...args),
}));

function renderList(selectedId: string | null = null) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <LocaleProvider>
        <ConversationList selectedId={selectedId} onSelect={vi.fn()} />
      </LocaleProvider>
    </SWRConfig>
  );
}

describe("ConversationList — T5", () => {
  beforeEach(() => {
    mockUser = { id: "student-1", email: "s@b.com", full_name: "Student One", role: "student", created_at: "2026-01-01" };
    mockConversations = [];
    mockCounterparts = [];
    openConversationMock.mockReset();
  });

  afterEach(() => cleanup());

  it("shows the student-specific honest empty state when there is no teacher to message yet", async () => {
    renderList();
    expect(await screen.findByText(ru.messaging.emptyStudent)).toBeDefined();
  });

  it("shows the teacher-specific honest empty state for a teacher with no students to message", async () => {
    mockUser = { id: "teacher-1", email: "t@b.com", full_name: "Teacher One", role: "teacher", created_at: "2026-01-01" };
    renderList();
    expect(await screen.findByText(ru.messaging.emptyTeacher)).toBeDefined();
  });

  it("renders real conversations with the counterpart's real name and last message preview", async () => {
    mockConversations = [
      {
        id: "conv-1",
        counterpart: { id: "teacher-1", full_name: "Мария Иванова" },
        created_at: "2026-01-01T00:00:00Z",
        last_message_at: "2026-01-02T10:00:00Z",
        last_message_preview: "Здравствуйте, у меня вопрос",
      },
    ];
    renderList();

    expect(await screen.findByText("Мария Иванова")).toBeDefined();
    expect(await screen.findByText("Здравствуйте, у меня вопрос")).toBeDefined();
  });

  it("opens a new conversation via the picker using a real classroom-derived counterpart", async () => {
    mockCounterparts = [{ id: "teacher-1", full_name: "Мария Иванова" }];
    openConversationMock.mockResolvedValue({
      id: "conv-new",
      counterpart: { id: "teacher-1", full_name: "Мария Иванова" },
      created_at: "2026-01-01T00:00:00Z",
      last_message_at: null,
      last_message_preview: null,
    });
    renderList();
    await screen.findByText(ru.messaging.emptyStudent);

    fireEvent.click(screen.getByTestId("new-conversation-trigger"));
    const counterpartButton = await screen.findByTestId("counterpart-teacher-1");
    await act(async () => {
      fireEvent.click(counterpartButton);
    });

    expect(openConversationMock).toHaveBeenCalledWith("teacher-1");
  });
});
