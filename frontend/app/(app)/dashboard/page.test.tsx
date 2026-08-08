// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import DashboardPage from "./page";
import { LocaleProvider } from "@/lib/locale-context";
import { ThemeProvider } from "@/lib/theme-context";
import { ru } from "@/lib/i18n/dictionaries/ru";
import type { User, Simulation } from "@/lib/types";
import type { LearningProfile, ProgressHistory } from "@/lib/progress-client";

// D5.1 — WorldSection теперь использует framer-motion `whileInView`
// (портал-карточки миров) — jsdom не реализует IntersectionObserver,
// нужен тот же минимальный стаб, что и в app/page.test.tsx (D2).
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}
// @ts-expect-error — минимальный тестовый стаб, не полная реализация DOM-интерфейса
global.IntersectionObserver = IntersectionObserverStub;

let mockUser: User | null = { id: "u1", email: "s@b.com", full_name: "Айгуль Сатпаева", role: "student", created_at: "2026-01-01" };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: mockUser, isLoading: false, login: vi.fn(), register: vi.fn(), logout: vi.fn(), refreshUser: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard",
}));

const SIMULATIONS: Simulation[] = [
  { id: "sim-elec", title: "Простая цепь", module: "electricity_lab", visibility: "public", subject: "Физика", config: {}, difficulty: 2, created_at: "2026-01-01" },
  { id: "sim-chem", title: "Нейтрализация", module: "chemistry_world", visibility: "public", subject: "Химия", config: {}, difficulty: 3, created_at: "2026-01-01" },
  { id: "sim-geo", title: "Строение Земли", module: "geo3d", visibility: "public", subject: "География", config: {}, difficulty: 1, created_at: "2026-01-01" },
];

let mockSimulations: Simulation[] = SIMULATIONS;
vi.mock("@/lib/swr-fetcher", () => ({
  swrFetcher: vi.fn(() => Promise.resolve(mockSimulations)),
}));

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

let mockResults: import("@/lib/types").LabResult[] = [];
vi.mock("@/lib/results-client", () => ({
  getMyResults: vi.fn(() => Promise.resolve(mockResults)),
}));

let mockSaves: import("@/lib/autosave-engine").SaveBackendResponse[] = [];
vi.mock("@/lib/chemistry-saves-client", () => ({
  getMyChemistrySaves: vi.fn(() => Promise.resolve(mockSaves)),
}));

function renderDashboard() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ThemeProvider>
        <LocaleProvider>
          <DashboardPage />
        </LocaleProvider>
      </ThemeProvider>
    </SWRConfig>
  );
}

describe("DashboardPage — D5 Student Home", () => {
  beforeEach(() => {
    mockUser = { id: "u1", email: "s@b.com", full_name: "Айгуль Сатпаева", role: "student", created_at: "2026-01-01" };
    mockProgress = { profile: EMPTY_PROFILE, events: [] };
    mockResults = [];
    mockSaves = [];
    mockSimulations = SIMULATIONS;
  });

  afterEach(() => {
    cleanup();
  });

  it("greets the real logged-in student by name", async () => {
    renderDashboard();
    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.textContent).toContain("Айгуль Сатпаева");
    expect(
      [ru.dashboard.greetingMorning, ru.dashboard.greetingAfternoon, ru.dashboard.greetingEvening].some((g) => heading.textContent?.includes(g))
    ).toBe(true);
  });

  it("shows all three real worlds (Electricity/Chemistry/GeoWorld), never SimLab", async () => {
    renderDashboard();
    const worldsSection = await screen.findByText("Простая цепь");
    expect(worldsSection).toBeDefined();
    expect(await screen.findByText("Нейтрализация")).toBeDefined();
    expect(await screen.findByText("Строение Земли")).toBeDefined();
    expect(screen.queryByText("SimLab 3D")).toBeNull();
  });

  it("shows the honest empty state for Continue Learning when there is no save and no completed lab", async () => {
    renderDashboard();
    expect(await screen.findByText(ru.dashboard.continueLearning.emptyTitle)).toBeDefined();
  });

  it("shows a real resumable Chemistry save as 'unfinished experiment', not a fabricated one", async () => {
    mockSaves = [
      {
        id: "save-1",
        user_id: "u1",
        simulation_id: "sim-chem",
        experiment_id: "exp-1",
        schema_version: "1.0",
        revision: 1,
        status: "active",
        idempotency_key: null,
        snapshot: {} as never,
        created_at: "2026-01-01",
        updated_at: "2026-01-02",
        last_autosaved_at: "2026-01-02",
      },
    ];
    renderDashboard();

    expect(await screen.findByText(ru.dashboard.continueLearning.unfinishedLabel)).toBeDefined();
    const resumeLink = await screen.findByRole("link", { name: new RegExp(ru.dashboard.continueLearning.resumeCta) });
    expect(resumeLink.getAttribute("href")).toBe("/chemistry_world/sim-chem");
  });

  it("shows real progress numbers, not a KPI wall, once the student has real activity", async () => {
    mockProgress = {
      profile: { ...EMPTY_PROFILE, level: 3, xp: 450, completed_labs: 4, accuracy: 82 },
      events: [],
    };
    renderDashboard();

    expect(await screen.findByText("450")).toBeDefined();
    expect(await screen.findByText("4")).toBeDefined();
    expect(await screen.findByText("82%")).toBeDefined();
  });

  it("shows an honest empty progress state for a brand-new student", async () => {
    renderDashboard();
    expect(await screen.findByText(ru.dashboard.progress.empty)).toBeDefined();
  });

  it("shows real recent results with score, and an empty state when there are none", async () => {
    mockResults = [
      { id: "r1", user_id: "u1", simulation_id: "sim-elec", simulation_title: "Простая цепь — попытка 2", actions_log: [], score: 91, feedback: null, duration_seconds: 300, completed_at: "2026-02-01T10:00:00Z" },
    ];
    renderDashboard();

    expect(await screen.findByText("Простая цепь — попытка 2")).toBeDefined();
    expect(await screen.findByText("91")).toBeDefined();
  });

  it("shows the recent-results empty state for a student with no completed labs", async () => {
    renderDashboard();
    expect(await screen.findByText(ru.dashboard.recentResults.empty)).toBeDefined();
  });

  it("surfaces weak topics constructively ('Focus next'), not punitively", async () => {
    mockProgress = { profile: { ...EMPTY_PROFILE, weak_topics: ["Закон Ома", "Последовательное соединение"] }, events: [] };
    renderDashboard();

    expect(await screen.findByText(ru.dashboard.focusNext.title)).toBeDefined();
    expect(await screen.findByText("Закон Ома, Последовательное соединение")).toBeDefined();
  });

  it("does not show student-only widgets (Continue Learning / Progress / Recent Results) to a teacher", async () => {
    mockUser = { id: "u2", email: "t@b.com", full_name: "Марат Ержанов", role: "teacher", created_at: "2026-01-01" };
    renderDashboard();

    expect(await screen.findByText(ru.dashboard.teacherFallback.title)).toBeDefined();
    expect(screen.queryByText(ru.dashboard.continueLearning.title)).toBeNull();
    expect(screen.queryByText(ru.dashboard.progress.title)).toBeNull();
    expect(screen.queryByText(ru.dashboard.recentResults.title)).toBeNull();
    // но реальные миры для просмотра всё ещё показываются
    expect(await screen.findByText("Простая цепь")).toBeDefined();
  });

  it("D5.1: does not render the old developer-facing explanatory copy on the teacher fallback", async () => {
    mockUser = { id: "u2", email: "t@b.com", full_name: "Марат Ержанов", role: "teacher", created_at: "2026-01-01" };
    renderDashboard();

    await screen.findByText(ru.dashboard.teacherFallback.title);
    expect(screen.queryByText(ru.dashboard.teacherFallback.subtitle)).toBeNull();
  });

  it("D5.1: shows an honest 'coming soon' portal state for a world with zero real simulations", async () => {
    mockSimulations = SIMULATIONS.filter((s) => s.module !== "geo3d");
    renderDashboard();

    const comingSoonButtons = await screen.findAllByText(ru.dashboard.worlds.comingSoon);
    expect(comingSoonButtons.length).toBeGreaterThan(0);
    expect(screen.queryByText("Строение Земли")).toBeNull();
    // остальные два мира по-прежнему показывают реальные симуляции
    expect(screen.getByText("Простая цепь")).toBeDefined();
    expect(screen.getByText("Нейтрализация")).toBeDefined();
  });

  it("D5.1: shows the real last-saved date for an active Chemistry save, not a fabricated progress percentage", async () => {
    mockSaves = [
      {
        id: "save-1",
        user_id: "u1",
        simulation_id: "sim-chem",
        experiment_id: "exp-1",
        schema_version: "1.0",
        revision: 3,
        status: "active",
        idempotency_key: null,
        snapshot: {} as never,
        created_at: "2026-02-01",
        updated_at: "2026-02-05",
        last_autosaved_at: "2026-02-05",
      },
    ];
    renderDashboard();

    const label = await screen.findByText(new RegExp(`^${ru.dashboard.continueLearning.lastSavedLabel}:`));
    expect(label.textContent).toContain(new Date("2026-02-05").toLocaleDateString("ru"));
    expect(screen.queryByText(/%$/)).toBeNull();
  });
});
