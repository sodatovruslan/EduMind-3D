// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import TeacherPage from "./page";
import { LocaleProvider } from "@/lib/locale-context";
import { ThemeProvider } from "@/lib/theme-context";
import { ru } from "@/lib/i18n/dictionaries/ru";
import { en } from "@/lib/i18n/dictionaries/en";
import type { User, ClassStats } from "@/lib/types";
import type { StudentOverview, StudentDetail, RecentClassResult, ClassModuleBreakdown } from "@/lib/teacher-client";
import * as teacherClient from "@/lib/teacher-client";

let mockUser: User | null = { id: "t1", email: "teacher@b.com", full_name: "Марат Ержанов", role: "teacher", created_at: "2026-01-01" };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: mockUser, isLoading: false, login: vi.fn(), register: vi.fn(), logout: vi.fn(), refreshUser: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/teacher",
}));

const CLASS_STATS: ClassStats = { average_score: 87.5, completion_rate: 42.0, active_students: 2, total_students: 3 };
let mockStats: ClassStats = CLASS_STATS;
vi.mock("@/lib/swr-fetcher", () => ({
  swrFetcher: vi.fn((path: string) => (path === "/api/results/stats" ? Promise.resolve(mockStats) : Promise.resolve(undefined))),
}));

const HEALTHY: StudentOverview = {
  id: "s-healthy",
  full_name: "Диёра Каримова",
  email: "healthy@b.com",
  level: 3,
  xp: 120,
  completed_labs: 4,
  accuracy: 92,
  weak_topics: [],
  latest_score: 95,
  last_activity_at: "2026-08-01T10:00:00Z",
  needs_attention: false,
};
const STRUGGLING: StudentOverview = {
  id: "s-struggling",
  full_name: "Фарход Расулов",
  email: "struggling@b.com",
  level: 1,
  xp: 10,
  completed_labs: 0,
  accuracy: 20,
  weak_topics: ["Амперметр"],
  latest_score: 30,
  last_activity_at: "2026-07-20T10:00:00Z",
  needs_attention: true,
};
let mockOverview: StudentOverview[] = [HEALTHY, STRUGGLING];

const DETAIL: StudentDetail = {
  id: "s-struggling",
  full_name: "Фарход Расулов",
  email: "struggling@b.com",
  created_at: "2026-06-01T00:00:00Z",
  level: 1,
  xp: 10,
  completed_labs: 0,
  accuracy: 20,
  average_hints: 2,
  average_attempts: 4,
  strong_topics: [],
  weak_topics: ["Амперметр"],
  recent_mistakes: ["ammeter_parallel"],
  achievements: [],
  current_streak: 0,
  last_completed_lab: null,
  needs_attention: true,
  module_breakdown: [{ module: "electricity_lab", average_score: 30, completed_count: 1 }],
};
let mockDetail: StudentDetail = DETAIL;

let mockRecentResults: RecentClassResult[] = [
  {
    id: "r1",
    student_id: "s-healthy",
    student_name: "Диёра Каримова",
    simulation_id: "sim-1",
    simulation_title: "Собери цепь",
    module: "electricity_lab",
    score: 95,
    duration_seconds: 120,
    completed_at: "2026-08-01T10:00:00Z",
  },
];

let mockModuleBreakdown: ClassModuleBreakdown[] = [
  { module: "electricity_lab", average_score: 62.5, completed_count: 2, active_students: 2 },
];

vi.mock("@/lib/teacher-client", () => ({
  getTeacherStats: vi.fn(() => Promise.resolve(mockStats)),
  getStudentsOverview: vi.fn((_classId: string | null, query = "", filter = "all") => {
    const q = query.toLowerCase();
    return Promise.resolve(mockOverview.filter((student) =>
      (filter !== "attention" || student.needs_attention) &&
      (!q || student.full_name.toLowerCase().includes(q) || student.email.toLowerCase().includes(q))
    ));
  }),
  getStudentDetail: vi.fn(() => Promise.resolve(mockDetail)),
  getClassRecentResults: vi.fn(() => Promise.resolve(mockRecentResults)),
  getClassModuleBreakdown: vi.fn(() => Promise.resolve(mockModuleBreakdown)),
}));

vi.mock("@/lib/classes-client", () => ({
  listClasses: vi.fn(() => Promise.resolve([
    { id: "c1", teacher_id: "t1", name: "Physics 10A", status: "active", created_at: "2026-01-01", updated_at: "2026-01-01", student_count: 2 },
    { id: "c2", teacher_id: "t1", name: "Physics 10B", status: "archived", created_at: "2026-01-01", updated_at: "2026-01-01", student_count: 1 },
  ])),
}));

function renderTeacherPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ThemeProvider>
        <LocaleProvider>
          <TeacherPage />
        </LocaleProvider>
      </ThemeProvider>
    </SWRConfig>
  );
}

describe("TeacherPage — D7 Teacher Learning Analytics Center", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockUser = { id: "t1", email: "teacher@b.com", full_name: "Марат Ержанов", role: "teacher", created_at: "2026-01-01" };
    mockStats = CLASS_STATS;
    mockOverview = [HEALTHY, STRUGGLING];
    mockDetail = DETAIL;
    mockRecentResults = [
      {
        id: "r1",
        student_id: "s-healthy",
        student_name: "Диёра Каримова",
        simulation_id: "sim-1",
        simulation_title: "Собери цепь",
        module: "electricity_lab",
        score: 95,
        duration_seconds: 120,
        completed_at: "2026-08-01T10:00:00Z",
      },
    ];
    mockModuleBreakdown = [{ module: "electricity_lab", average_score: 62.5, completed_count: 2, active_students: 2 }];
  });

  afterEach(() => {
    cleanup();
  });

  it("blocks a student from seeing the teacher dashboard (role protection)", async () => {
    mockUser = { id: "u1", email: "s@b.com", full_name: "Ученик", role: "student", created_at: "2026-01-01" };
    renderTeacherPage();
    expect(screen.queryByText(ru.teacher.pageTitle)).toBeNull();
  });

  it("renders real class KPIs from GET /api/results/stats, not fabricated numbers", async () => {
    renderTeacherPage();
    expect(await screen.findByText("3")).toBeDefined(); // total_students
    expect(await screen.findByText("2")).toBeDefined(); // active_students
    expect(await screen.findByText("87.5")).toBeDefined(); // average_score
    expect(await screen.findByText("42%")).toBeDefined(); // completion_rate
  });

  it("flags the struggling student in 'needs attention' with their real weak topic, not the healthy one", async () => {
    renderTeacherPage();
    const attentionSection = (await screen.findByText(ru.teacher.attention.title)).closest("section")!;
    expect(within(attentionSection).getByText("Фарход Расулов")).toBeDefined();
    expect(within(attentionSection).getByText("Амперметр")).toBeDefined();
    expect(within(attentionSection).queryByText("Диёра Каримова")).toBeNull();
  });

  it("shows the honest 'all good' empty state when no student needs attention", async () => {
    mockOverview = [HEALTHY];
    renderTeacherPage();
    await screen.findByText(ru.teacher.attention.title);
    expect(await screen.findByText(ru.teacher.attention.empty)).toBeDefined();
  });

  it("filters the student directory by search query", async () => {
    renderTeacherPage();
    await screen.findByTestId("teacher-student-row-s-healthy");
    const search = screen.getByTestId("teacher-directory-search");
    fireEvent.change(search, { target: { value: "Фарход" } });

    expect(await screen.findByTestId("teacher-student-row-s-struggling")).toBeDefined();
    await vi.waitFor(() => expect(screen.queryByTestId("teacher-student-row-s-healthy")).toBeNull());
  });

  it("re-fetches every analytics section for the selected classroom", async () => {
    renderTeacherPage();
    const classFilter = await screen.findByTestId("teacher-class-filter");
    fireEvent.change(classFilter, { target: { value: "c1" } });
    await vi.waitFor(() => expect(teacherClient.getTeacherStats).toHaveBeenCalledWith("c1"));
    expect(teacherClient.getStudentsOverview).toHaveBeenCalledWith("c1", "", "attention");
    expect(teacherClient.getClassRecentResults).toHaveBeenCalledWith(20, "c1");
    expect(teacherClient.getClassModuleBreakdown).toHaveBeenCalledWith("c1");
  });

  it("shows real analytics for the selected student, including weak topics and module breakdown", async () => {
    renderTeacherPage();
    const row = await screen.findByTestId("teacher-student-row-s-struggling");
    fireEvent.click(row);

    expect(await screen.findAllByText("Фарход Расулов")).toHaveLength(2); // directory row + detail heading
    expect(await screen.findByText("ammeter_parallel")).toBeDefined();
    const detailPanel = screen.getByTestId("teacher-detail-panel");
    expect(within(detailPanel).getByText("Electricity Lab")).toBeDefined(); // module breakdown label
  });

  it("shows the honest empty detail state when no student is selected", async () => {
    renderTeacherPage();
    expect(await screen.findByText(ru.teacher.detail.emptyTitle)).toBeDefined();
  });

  it("shows real recent class results, and an honest empty state when there are none", async () => {
    renderTeacherPage();
    const section = await screen.findByTestId("teacher-recent-results");
    expect(within(section).getByText("Собери цепь")).toBeDefined();
    expect(within(section).getByText("Диёра Каримова")).toBeDefined();
  });

  it("shows the recent-results empty state when the class has no completed labs", async () => {
    mockRecentResults = [];
    renderTeacherPage();
    expect(await screen.findByText(ru.teacher.recentResults.empty)).toBeDefined();
  });

  it("omits modules with zero real results from the world breakdown, never fabricating a row for GeoWorld", async () => {
    renderTeacherPage();
    const breakdownHeadings = await screen.findAllByText(ru.teacher.detail.moduleBreakdownTitle);
    const section = breakdownHeadings[breakdownHeadings.length - 1].closest("section")!;
    expect(within(section).getByText("Electricity Lab")).toBeDefined();
    expect(within(section).queryByText("GeoWorld")).toBeNull();
    expect(within(section).queryByText("Chemistry World")).toBeNull();
  });

  it("renders in English when the locale is set to en", async () => {
    window.localStorage.setItem("edumind:locale", "en");
    renderTeacherPage();
    expect(await screen.findByText(en.teacher.pageTitle)).toBeDefined();
    expect(await screen.findByText(en.teacher.kpi.totalStudents)).toBeDefined();
  });
});
