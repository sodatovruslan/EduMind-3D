// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "./page";
import { LocaleProvider } from "@/lib/locale-context";
import { ThemeProvider } from "@/lib/theme-context";
import { ru } from "@/lib/i18n/dictionaries/ru";
import { en } from "@/lib/i18n/dictionaries/en";
import type { User } from "@/lib/types";

// jsdom не реализует IntersectionObserver — framer-motion's `whileInView`
// (WorldsShowcase/HowItWorks/ForStudents/ForTeachers)
// синхронно бросает при mount без него. Минимальный стаб — тот
// же прием, что и with matchMedia в theme-context.test.tsx.
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

// D2 — `/` no longer redirects (see app/page.tsx), so unlike the old
// page.test setup this suite never needs to assert on router.replace.
// useAuth is mocked directly (module-level) rather than rendering a real
// AuthProvider, so tests can flip between logged-out/logged-in
// deterministically without hitting the network.
let mockUser: User | null = null;
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: mockUser,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  }),
}));

function renderLanding() {
  return render(
    <ThemeProvider>
      <LocaleProvider>
        <HomePage />
      </LocaleProvider>
    </ThemeProvider>
  );
}

describe("HomePage ('/') — D2 public landing", () => {
  beforeEach(() => {
    mockUser = null;
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the public Landing (hero headline) instead of redirecting", async () => {
    renderLanding();
    await act(async () => {});

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(ru.hero.headlineLine1);
    // no authenticated sidebar/navbar text ("Мои симуляции") anywhere on the page
    expect(screen.queryByText("Мои симуляции")).toBeNull();
  });

  it("shows logged-out CTAs (Get Started → /register, Sign In → /login) when no user is present", async () => {
    mockUser = null;
    renderLanding();
    await act(async () => {});

    const getStartedLinks = screen.getAllByRole("link", { name: ru.common.getStarted });
    expect(getStartedLinks.length).toBeGreaterThan(0);
    getStartedLinks.forEach((link) => expect(link.getAttribute("href")).toBe("/register"));

    const signInLinks = screen.getAllByRole("link", { name: ru.nav.signIn });
    expect(signInLinks.length).toBeGreaterThan(0);
    signInLinks.forEach((link) => expect(link.getAttribute("href")).toBe("/login"));
  });

  it("navbar 'Sign in' goes straight to /dashboard when a user is authenticated", async () => {
    mockUser = { id: "u1", email: "a@b.com", full_name: "Test User", role: "student", created_at: "2026-01-01" };
    renderLanding();
    await act(async () => {});

    expect(screen.queryByRole("link", { name: ru.common.getStarted })).toBeNull();
    const signInLinks = screen.getAllByRole("link", { name: ru.nav.signIn });
    expect(signInLinks.length).toBeGreaterThan(0);
    signInLinks.forEach((link) => expect(link.getAttribute("href")).toBe("/dashboard"));

    const dashboardLinks = screen.getAllByRole("link", { name: ru.nav.openDashboard });
    expect(dashboardLinks.length).toBeGreaterThan(0);
    dashboardLinks.forEach((link) => expect(link.getAttribute("href")).toBe("/dashboard"));
  });

  it("mobile menu opens and closes, toggling aria-expanded", async () => {
    renderLanding();
    await act(async () => {});

    const toggle = screen.getByRole("button", { name: ru.nav.menu });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);
    const closeBtn = await screen.findByRole("button", { name: ru.nav.close });
    expect(closeBtn.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(closeBtn);
    const menuBtn = await screen.findByRole("button", { name: ru.nav.menu });
    expect(menuBtn.getAttribute("aria-expanded")).toBe("false");
  });

  it("switching language via the navbar LocaleSwitcher re-renders copy and persists the choice", async () => {
    renderLanding();
    await act(async () => {});

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(ru.hero.headlineLine1);

    const enButtons = screen.getAllByRole("radio", { name: "English" });
    fireEvent.click(enButtons[0]);

    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.textContent).toContain(en.hero.headlineLine1);
    expect(window.localStorage.getItem("edumind:locale")).toBe("en");
  });

  it("restores a persisted locale on mount", async () => {
    window.localStorage.setItem("edumind:locale", "en");
    renderLanding();
    await act(async () => {});

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(en.hero.headlineLine1);
  });

  it("worlds showcase presents all three real worlds", async () => {
    renderLanding();
    await act(async () => {});

    const worldsSection = document.getElementById("worlds");
    expect(worldsSection).not.toBeNull();
    const scoped = within(worldsSection as HTMLElement);
    expect(scoped.getByText("Electricity Lab")).toBeDefined();
    expect(scoped.getByText("Chemistry World")).toBeDefined();
    expect(scoped.getByText("GeoWorld")).toBeDefined();
  });
});
