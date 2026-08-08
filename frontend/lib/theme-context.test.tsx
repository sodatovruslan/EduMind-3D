// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "@/lib/theme-context";

const STORAGE_KEY = "edumind:theme";

// jsdom не реализует window.matchMedia — мок с настраиваемым `matches` и
// поддержкой addEventListener('change', ...), как в реальном браузере, чтобы
// проверить и разрешение "system", и живую подписку на смену темы ОС
function installMatchMediaMock(initialMatches: boolean) {
  let matches = initialMatches;
  let changeListener: (() => void) | null = null;

  const mql = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    addEventListener: vi.fn((event: string, listener: () => void) => {
      if (event === "change") changeListener = listener;
    }),
    // очищаем сохраненный listener по-настоящему — иначе тест "once an
    // explicit theme is chosen, no longer reacts" не заметил бы регрессию,
    // если бы ThemeProvider забыл отписаться при уходе из "system"
    removeEventListener: vi.fn((event: string) => {
      if (event === "change") changeListener = null;
    }),
  };

  window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia;

  return {
    setSystemDark(next: boolean) {
      matches = next;
      changeListener?.();
    },
  };
}

function ThemeProbe() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={() => setTheme("light")}>light</button>
      <button onClick={() => setTheme("dark")}>dark</button>
      <button onClick={() => setTheme("system")}>system</button>
    </div>
  );
}

describe("ThemeProvider (Design System V2 §25 — Light/Dark/System)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("defaults to 'system' and resolves via prefers-color-scheme when nothing is stored", async () => {
    installMatchMediaMock(true);
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    await act(async () => {});

    expect(screen.getByTestId("theme").textContent).toBe("system");
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("setTheme('dark') persists to localStorage and applies the `dark` class", async () => {
    installMatchMediaMock(false);
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );
    await act(async () => {});

    act(() => screen.getByText("dark").click());

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("dark");
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("setTheme('light') persists and removes the `dark` class", async () => {
    installMatchMediaMock(true);
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );
    await act(async () => {});
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => screen.getByText("light").click());

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("light");
    expect(screen.getByTestId("resolved").textContent).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("restores a persisted preference on mount instead of defaulting to system", async () => {
    window.localStorage.setItem(STORAGE_KEY, "light");
    installMatchMediaMock(true); // системная тема темная — не должна победить сохраненный light
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );
    await act(async () => {});

    expect(screen.getByTestId("theme").textContent).toBe("light");
    expect(screen.getByTestId("resolved").textContent).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("in 'system' mode, stays subscribed and reacts live to an OS theme change", async () => {
    const media = installMatchMediaMock(false);
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );
    await act(async () => {});
    expect(screen.getByTestId("resolved").textContent).toBe("light");

    act(() => media.setSystemDark(true));

    expect(screen.getByTestId("resolved").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("once an explicit theme is chosen, no longer reacts to OS changes", async () => {
    const media = installMatchMediaMock(false);
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );
    await act(async () => {});

    act(() => screen.getByText("dark").click());
    expect(screen.getByTestId("resolved").textContent).toBe("dark");

    // системная тема "переключилась" на light — explicit "dark" должен остаться dark
    act(() => media.setSystemDark(false));
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
  });

  it("useTheme() throws when used outside a ThemeProvider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ThemeProbe />)).toThrow(/useTheme должен использоваться внутри/);
    consoleError.mockRestore();
  });
});
