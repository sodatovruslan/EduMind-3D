// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import ProfilePage from "./page";
import { LocaleProvider } from "@/lib/locale-context";
import { ThemeProvider } from "@/lib/theme-context";
import { ru } from "@/lib/i18n/dictionaries/ru";
import type { User } from "@/lib/types";
import type { LearningProfile, ProgressHistory } from "@/lib/progress-client";

let mockUser: User | null = { id: "u1", email: "student@example.com", full_name: "Данияр Ахметов", role: "student", created_at: "2026-01-15T00:00:00Z" };
const refreshUserMock = vi.fn();
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: mockUser, isLoading: false, login: vi.fn(), register: vi.fn(), logout: vi.fn(), refreshUser: refreshUserMock }),
}));

const apiFetchMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

const EMPTY_PROFILE: LearningProfile = {
  level: 1,
  xp: 0,
  completed_tasks: [],
  completed_labs: 0,
  accuracy: 0,
  average_hints: 0,
  average_attempts: 0,
  strong_topics: [],
  weak_topics: [],
  recent_mistakes: [],
  recommended_difficulty: "easy",
  last_completed_lab: null,
  achievements: [],
  current_streak: 0,
};
let mockProgress: ProgressHistory = { profile: EMPTY_PROFILE, events: [] };
vi.mock("@/lib/progress-client", () => ({
  getMyProgress: vi.fn(() => Promise.resolve(mockProgress)),
}));

function renderProfile() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ThemeProvider>
        <LocaleProvider>
          <ProfilePage />
        </LocaleProvider>
      </ThemeProvider>
    </SWRConfig>
  );
}

describe("ProfilePage — D5 Student Profile", () => {
  beforeEach(() => {
    mockUser = { id: "u1", email: "student@example.com", full_name: "Данияр Ахметов", role: "student", created_at: "2026-01-15T00:00:00Z" };
    mockProgress = { profile: EMPTY_PROFILE, events: [] };
    apiFetchMock.mockReset();
    refreshUserMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the real user's identity — name, email, role, join date", async () => {
    renderProfile();
    await act(async () => {});

    expect(screen.getByText("Данияр Ахметов")).toBeDefined();
    expect(screen.getByText("student@example.com")).toBeDefined();
    expect(screen.getByText(ru.shell.role.student)).toBeDefined();
    expect(screen.getByText(new Date("2026-01-15T00:00:00Z").toLocaleDateString("ru"))).toBeDefined();
  });

  it("does not fabricate achievements or stats for a student with no real progress yet", async () => {
    renderProfile();
    await act(async () => {});

    expect(await screen.findByText(ru.dashboard.progress.empty)).toBeDefined();
  });

  it("D8: shows a real unlocked achievement with its localized title/description, not the old hardcoded English/Russian mix", async () => {
    mockProgress = { profile: { ...EMPTY_PROFILE, completed_labs: 1, achievements: ["first_circuit"] }, events: [] };
    renderProfile();
    await act(async () => {});

    const badge = await screen.findByTestId("achievement-first_circuit");
    expect(badge.getAttribute("data-unlocked")).toBe("true");
    expect(badge.textContent).toContain(ru.achievements.first_circuit.title);
    expect(badge.getAttribute("title")).toBe(ru.achievements.first_circuit.description);
  });

  it("preserves the real edit contract: PATCH /api/users/{id} then refreshUser, save disabled until changed", async () => {
    apiFetchMock.mockResolvedValueOnce({});
    renderProfile();
    await act(async () => {});

    const saveButton = screen.getByRole("button", { name: ru.profile.save });
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);

    const nameInput = screen.getByLabelText(ru.profile.fullNameLabel);
    fireEvent.change(nameInput, { target: { value: "Данияр Ахметов-оглы" } });
    expect((saveButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(saveButton);
    await act(async () => {});

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/users/u1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ full_name: "Данияр Ахметов-оглы" }) })
    );
    expect(refreshUserMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(ru.profile.saved)).toBeDefined();
  });
});
