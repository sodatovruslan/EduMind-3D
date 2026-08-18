// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HelpRequestsPanel from "./HelpRequestsPanel";
import { LocaleProvider } from "@/lib/locale-context";
import { ru } from "@/lib/i18n/dictionaries/ru";
import type { HelpRequest } from "@/lib/help-client";

const acceptMock = vi.fn();
const declineMock = vi.fn();
const resolveMock = vi.fn();
let mockState: { requests: HelpRequest[]; pendingCount: number };
vi.mock("@/lib/useTeacherHelpRequests", () => ({
  useTeacherHelpRequests: () => ({
    requests: mockState.requests,
    pendingCount: mockState.pendingCount,
    accept: acceptMock,
    decline: declineMock,
    resolve: resolveMock,
    loading: false,
    refresh: vi.fn(),
  }),
}));

function makeRequest(overrides: Partial<HelpRequest> = {}): HelpRequest {
  return {
    id: "help-1",
    conversation_id: "conv-1",
    student: { id: "student-1", full_name: "Ruslan" },
    teacher: { id: "teacher-1", full_name: "Teacher One" },
    world: "electricity",
    context_snapshot: {
      world: "electricity",
      context_version: 1,
      task_title: "Ohm's Law",
      current_step: "Measure current",
      selected_object: "resistor (resistor-220)",
      safety_state: "normal",
      measurements: { voltage_v: "9" },
    },
    student_message: "Лампа не горит",
    status: "pending",
    call_id: null,
    created_at: "2026-01-01T00:00:00Z",
    accepted_at: null,
    resolved_at: null,
    ...overrides,
  };
}

function renderPanel() {
  return render(
    <LocaleProvider>
      <HelpRequestsPanel />
    </LocaleProvider>
  );
}

beforeEach(() => {
  acceptMock.mockReset();
  declineMock.mockReset();
  resolveMock.mockReset();
  mockState = { requests: [], pendingCount: 0 };
});
afterEach(() => cleanup());

describe("HelpRequestsPanel — visibility", () => {
  it("renders nothing when there are no active requests", () => {
    renderPanel();
    expect(screen.queryByTestId("help-requests-panel")).toBeNull();
  });

  it("shows the pending count in the heading", () => {
    mockState = { requests: [makeRequest()], pendingCount: 1 };
    renderPanel();
    expect(screen.getByTestId("help-requests-count").textContent).toBe("(1)");
  });
});

describe("HelpRequestsPanel — request card", () => {
  it("shows the student, world, task, and student message", () => {
    mockState = { requests: [makeRequest()], pendingCount: 1 };
    renderPanel();
    expect(screen.getByText("Ruslan")).toBeDefined();
    expect(screen.getByText(/Ohm's Law/)).toBeDefined();
    expect(screen.getByText("“Лампа не горит”")).toBeDefined();
  });

  it("context preview is collapsed by default and expands on click", () => {
    mockState = { requests: [makeRequest()], pendingCount: 1 };
    renderPanel();
    expect(screen.queryByTestId("help-request-context")).toBeNull();
    fireEvent.click(screen.getByTestId("help-request-toggle-context"));
    const context = screen.getByTestId("help-request-context");
    expect(context.textContent).toContain("Measure current");
    expect(context.textContent).toContain("resistor (resistor-220)");
  });

  it("pending: Accept/Decline call the hook actions with the request id", () => {
    mockState = { requests: [makeRequest()], pendingCount: 1 };
    renderPanel();
    fireEvent.click(screen.getByTestId("help-request-accept"));
    expect(acceptMock).toHaveBeenCalledWith("help-1");
    fireEvent.click(screen.getByTestId("help-request-decline"));
    expect(declineMock).toHaveBeenCalledWith("help-1");
  });

  it("accepted: shows Call/Resolve instead of Accept/Decline, Call links to the conversation", () => {
    mockState = { requests: [makeRequest({ status: "accepted" })], pendingCount: 0 };
    renderPanel();
    expect(screen.queryByTestId("help-request-accept")).toBeNull();
    const callLink = screen.getByTestId("help-request-call") as HTMLAnchorElement;
    expect(callLink.getAttribute("href")).toBe("/messages?conversation=conv-1");
    fireEvent.click(screen.getByTestId("help-request-resolve"));
    expect(resolveMock).toHaveBeenCalledWith("help-1");
  });

  it("Message always links to the request's conversation, regardless of status", () => {
    mockState = { requests: [makeRequest({ status: "pending" })], pendingCount: 1 };
    renderPanel();
    const messageLink = screen.getByTestId("help-request-message") as HTMLAnchorElement;
    expect(messageLink.getAttribute("href")).toBe("/messages?conversation=conv-1");
  });

  it("declined/resolved/cancelled requests are not shown in the active list", () => {
    mockState = { requests: [makeRequest({ status: "declined" }), makeRequest({ id: "help-2", status: "resolved" })], pendingCount: 0 };
    renderPanel();
    expect(screen.queryByTestId("help-requests-panel")).toBeNull();
  });
});
