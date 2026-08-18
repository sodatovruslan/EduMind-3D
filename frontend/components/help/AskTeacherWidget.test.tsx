// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AskTeacherWidget from "./AskTeacherWidget";
import { LocaleProvider } from "@/lib/locale-context";
import { ru } from "@/lib/i18n/dictionaries/ru";
import type { User } from "@/lib/types";
import type { HelpContextSnapshot, HelpRequest } from "@/lib/help-client";

let mockUser: User | null = { id: "student-1", email: "s@b.com", full_name: "Student One", role: "student", created_at: "2026-01-01" };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: mockUser }),
}));

const askMock = vi.fn();
const cancelMock = vi.fn();
const resolveMock = vi.fn();
let mockSession: {
  teachers: { id: string; full_name: string }[];
  activeRequest: HelpRequest | null;
  isSending: boolean;
  ask: typeof askMock;
  cancel: typeof cancelMock;
  resolve: typeof resolveMock;
};
vi.mock("@/lib/useStudentHelpSession", () => ({
  useStudentHelpSession: () => mockSession,
}));

const SNAPSHOT: HelpContextSnapshot = { world: "electricity", context_version: 1, task_title: "Ohm's Law" };

function makeHelpRequest(overrides: Partial<HelpRequest> = {}): HelpRequest {
  return {
    id: "help-1",
    conversation_id: "conv-1",
    student: { id: "student-1", full_name: "Student One" },
    teacher: { id: "teacher-1", full_name: "Teacher One" },
    world: "electricity",
    context_snapshot: SNAPSHOT,
    student_message: null,
    status: "pending",
    call_id: null,
    created_at: "2026-01-01T00:00:00Z",
    accepted_at: null,
    resolved_at: null,
    ...overrides,
  };
}

function renderWidget() {
  return render(
    <LocaleProvider>
      <AskTeacherWidget world="electricity" snapshot={SNAPSHOT} />
    </LocaleProvider>
  );
}

beforeEach(() => {
  mockUser = { id: "student-1", email: "s@b.com", full_name: "Student One", role: "student", created_at: "2026-01-01" };
  askMock.mockReset();
  cancelMock.mockReset();
  resolveMock.mockReset();
  mockSession = {
    teachers: [{ id: "teacher-1", full_name: "Teacher One" }],
    activeRequest: null,
    isSending: false,
    ask: askMock,
    cancel: cancelMock,
    resolve: resolveMock,
  };
});
afterEach(() => cleanup());

describe("AskTeacherWidget — visibility", () => {
  it("renders nothing for a non-student user", () => {
    mockUser = { id: "teacher-1", email: "t@b.com", full_name: "Teacher One", role: "teacher", created_at: "2026-01-01" };
    renderWidget();
    expect(screen.queryByTestId("ask-teacher-button")).toBeNull();
  });

  it("renders nothing when the student has no real teacher relationship", () => {
    mockSession.teachers = [];
    renderWidget();
    expect(screen.queryByTestId("ask-teacher-button")).toBeNull();
    expect(screen.queryByTestId("ask-teacher-status")).toBeNull();
  });

  it("shows the Ask Teacher button when a teacher relationship exists and nothing is active", () => {
    renderWidget();
    expect(screen.getByTestId("ask-teacher-button")).toBeDefined();
  });
});

describe("AskTeacherWidget — sending a request", () => {
  it("single teacher: clicking the button opens the message form directly (no picker)", () => {
    renderWidget();
    fireEvent.click(screen.getByTestId("ask-teacher-button"));
    expect(screen.getByTestId("ask-teacher-message")).toBeDefined();
    expect(screen.queryByTestId("ask-teacher-pick")).toBeNull();
  });

  it("sends the request with the snapshot and typed message, using the single available teacher", async () => {
    renderWidget();
    fireEvent.click(screen.getByTestId("ask-teacher-button"));
    fireEvent.change(screen.getByTestId("ask-teacher-message"), { target: { value: "Лампа не горит" } });
    await fireEvent.click(screen.getByTestId("ask-teacher-send"));
    expect(askMock).toHaveBeenCalledWith("teacher-1", SNAPSHOT, "Лампа не горит");
  });

  it("multiple teachers: shows a picker before the message form", () => {
    mockSession.teachers = [
      { id: "teacher-1", full_name: "Teacher One" },
      { id: "teacher-2", full_name: "Teacher Two" },
    ];
    renderWidget();
    fireEvent.click(screen.getByTestId("ask-teacher-button"));
    expect(screen.getAllByTestId("ask-teacher-pick")).toHaveLength(2);
    expect(screen.queryByTestId("ask-teacher-message")).toBeNull();

    fireEvent.click(screen.getAllByTestId("ask-teacher-pick")[1]);
    expect(screen.getByTestId("ask-teacher-message")).toBeDefined();
  });

  it("works without typing a message at all (optional per brief §8)", async () => {
    renderWidget();
    fireEvent.click(screen.getByTestId("ask-teacher-button"));
    await fireEvent.click(screen.getByTestId("ask-teacher-send"));
    expect(askMock).toHaveBeenCalledWith("teacher-1", SNAPSHOT, undefined);
  });
});

describe("AskTeacherWidget — active request status", () => {
  it("shows 'request sent' with a Cancel action while pending", () => {
    mockSession.activeRequest = makeHelpRequest({ status: "pending" });
    renderWidget();
    expect(screen.getByTestId("ask-teacher-status").textContent).toContain(ru.help.requestSent);
    const cancelButton = screen.getByTestId("ask-teacher-cancel");
    fireEvent.click(cancelButton);
    expect(cancelMock).toHaveBeenCalled();
    expect(screen.queryByTestId("ask-teacher-button")).toBeNull();
  });

  it("shows 'teacher accepted' with a Resolve action while accepted", () => {
    mockSession.activeRequest = makeHelpRequest({ status: "accepted" });
    renderWidget();
    expect(screen.getByTestId("ask-teacher-status").textContent).toContain(ru.help.teacherAccepted);
    fireEvent.click(screen.getByTestId("ask-teacher-resolve"));
    expect(resolveMock).toHaveBeenCalled();
  });

  it("the status panel is announced accessibly (role=status, aria-live)", () => {
    mockSession.activeRequest = makeHelpRequest({ status: "pending" });
    renderWidget();
    const status = screen.getByTestId("ask-teacher-status");
    expect(status.getAttribute("role")).toBe("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
  });
});
