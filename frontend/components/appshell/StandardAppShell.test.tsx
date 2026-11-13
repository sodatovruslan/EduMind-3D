// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StandardAppShell from "./StandardAppShell";
import { LocaleProvider } from "@/lib/locale-context";
import { ThemeProvider } from "@/lib/theme-context";
import { ru } from "@/lib/i18n/dictionaries/ru";
import { en } from "@/lib/i18n/dictionaries/en";
import type { User } from "@/lib/types";

const replaceMock = vi.fn();
let mockPathname = "/dashboard";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock }),
  usePathname: () => mockPathname,
}));

const logoutMock = vi.fn();
let mockUser: User | null = { id: "u1", email: "a@b.com", full_name: "Ирина Петрова", role: "student", created_at: "2026-01-01" };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: mockUser,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: logoutMock,
    refreshUser: vi.fn(),
  }),
}));

function renderShell() {
  return render(
    <ThemeProvider>
      <LocaleProvider>
        <StandardAppShell>
          <p>page content</p>
        </StandardAppShell>
      </LocaleProvider>
    </ThemeProvider>
  );
}

describe("StandardAppShell — D4 authenticated navigation", () => {
  beforeEach(() => {
    logoutMock.mockReset();
    replaceMock.mockReset();
    mockPathname = "/dashboard";
    mockUser = { id: "u1", email: "a@b.com", full_name: "Ирина Петрова", role: "student", created_at: "2026-01-01" };
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders no top-bar destinations for a student without a teacher, and no teacher-only destination", async () => {
    renderShell();
    await act(async () => {});

    // Пунктов нет вовсе — значит и пустого navigation-landmark быть не должно
    expect(screen.queryByRole("navigation", { name: ru.shell.nav.label })).toBeNull();
    expect(screen.queryByRole("link", { name: ru.shell.nav.teacherArea })).toBeNull();
    expect(replaceMock).not.toHaveBeenCalled(); // не разлогинило/не редиректнуло валидного пользователя
  });

  it("brand mark links to the landing page, and the account menu is the way back to /dashboard", async () => {
    renderShell();
    await act(async () => {});

    const brand = screen.getAllByRole("link", { name: /EduMind 3D/ })[0];
    expect(brand.getAttribute("href")).toBe("/");

    fireEvent.click(screen.getByRole("button", { name: ru.shell.account.menuLabel }));
    const dashboardItem = await screen.findByRole("menuitem", { name: new RegExp(ru.shell.nav.home) });
    expect(dashboardItem.getAttribute("href")).toBe("/dashboard");
  });

  it("renders the teacher navigation — Home + teacher area", async () => {
    mockUser = { id: "u2", email: "t@b.com", full_name: "Олег Смирнов", role: "teacher", created_at: "2026-01-01" };
    renderShell();
    await act(async () => {});

    expect(screen.getAllByRole("link", { name: new RegExp(ru.shell.nav.teacherArea) }).length).toBeGreaterThan(0);
  });

  it("marks the active route with aria-current", async () => {
    mockPathname = "/teacher";
    mockUser = { id: "u2", email: "t@b.com", full_name: "Олег Смирнов", role: "teacher", created_at: "2026-01-01" };
    renderShell();
    await act(async () => {});

    const teacherLinks = screen.getAllByRole("link", { name: new RegExp(ru.shell.nav.teacherArea) });
    expect(teacherLinks.some((link) => link.getAttribute("aria-current") === "page")).toBe(true);

    const classesLinks = screen.getAllByRole("link", { name: new RegExp(ru.shell.nav.classes) });
    expect(classesLinks.every((link) => link.getAttribute("aria-current") !== "page")).toBe(true);
  });

  it("mobile drawer opens via the TopBar trigger, closes on Escape", async () => {
    renderShell();
    await act(async () => {});

    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: ru.shell.mobile.openMenu }));
    expect(await screen.findByRole("dialog")).toBeDefined();

    fireEvent.keyDown(document, { key: "Escape" });
    // AnimatePresence keeps the drawer mounted through its exit transition —
    // `waitFor` gives that a moment instead of asserting synchronously
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("D9: closing the mobile drawer with Escape returns focus to its trigger button", async () => {
    renderShell();
    await act(async () => {});

    const trigger = screen.getByRole("button", { name: ru.shell.mobile.openMenu });
    fireEvent.click(trigger);
    await screen.findByRole("dialog");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(document.activeElement).toBe(trigger);
  });

  it("mobile drawer closes when a nav link is clicked", async () => {
    mockUser = { id: "u2", email: "t@b.com", full_name: "Олег Смирнов", role: "teacher", created_at: "2026-01-01" };
    renderShell();
    await act(async () => {});

    fireEvent.click(screen.getByRole("button", { name: ru.shell.mobile.openMenu }));
    const dialog = await screen.findByRole("dialog");
    const navLinkInDrawer = Array.from(dialog.querySelectorAll("a")).find((a) => a.textContent?.includes(ru.shell.nav.teacherArea));
    expect(navLinkInDrawer).toBeDefined();

    fireEvent.click(navLinkInDrawer!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("mobile drawer also carries the /dashboard link, since the brand mark now goes to the landing", async () => {
    renderShell();
    await act(async () => {});

    fireEvent.click(screen.getByRole("button", { name: ru.shell.mobile.openMenu }));
    const dialog = await screen.findByRole("dialog");
    const links = Array.from(dialog.querySelectorAll("a"));

    expect(links.some((a) => a.getAttribute("href") === "/dashboard")).toBe(true);
    expect(links.some((a) => a.getAttribute("href") === "/")).toBe(true);
  });

  it("account menu shows the real user's name/role and logout works", async () => {
    renderShell();
    await act(async () => {});

    fireEvent.click(screen.getByRole("button", { name: ru.shell.account.menuLabel }));
    expect(await screen.findByText("Ирина Петрова")).toBeDefined();
    expect(screen.getByText(ru.shell.role.student)).toBeDefined();

    fireEvent.click(screen.getByRole("menuitem", { name: new RegExp(ru.shell.account.logout) }));
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it("D9: closing the account menu with Escape returns focus to its trigger button", async () => {
    renderShell();
    await act(async () => {});

    const trigger = screen.getByRole("button", { name: ru.shell.account.menuLabel });
    fireEvent.click(trigger);
    await screen.findByRole("menu");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

    expect(document.activeElement).toBe(trigger);
  });

  it("switching language updates the rendered navigation labels", async () => {
    mockUser = { id: "u2", email: "t@b.com", full_name: "Олег Смирнов", role: "teacher", created_at: "2026-01-01" };
    renderShell();
    await act(async () => {});

    expect(screen.getAllByRole("link", { name: new RegExp(ru.shell.nav.teacherArea) }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("radio", { name: "English" })[0]);
    await act(async () => {});

    expect(screen.getAllByRole("link", { name: new RegExp(en.shell.nav.teacherArea) }).length).toBeGreaterThan(0);
  });

  it("keeps desktop navigation inside the top bar — no permanent vertical rail", async () => {
    mockUser = { id: "u2", email: "t@b.com", full_name: "Олег Смирнов", role: "teacher", created_at: "2026-01-01" };
    renderShell();
    await act(async () => {});

    // Единственный постоянный навигационный блок — горизонтальный, внутри
    // <header>. Боковой колонки (<aside>/complementary) в оболочке нет:
    // именно это и было смыслом замены Rail на пункты в TopBar.
    expect(document.querySelector("aside")).toBeNull();

    const banner = screen.getByRole("banner");
    const nav = screen.getByRole("navigation", { name: ru.shell.nav.label });
    expect(banner.contains(nav)).toBe(true);

    const labels = Array.from(nav.querySelectorAll("a")).map((a) => a.textContent ?? "");
    expect(labels.some((l) => l.includes(ru.shell.nav.teacherArea))).toBe(true);
    expect(labels.some((l) => l.includes(ru.shell.nav.classes))).toBe(true);
  });
});
