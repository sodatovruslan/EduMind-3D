// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./page";
import AuthShell from "@/components/auth/AuthShell";
import { LocaleProvider } from "@/lib/locale-context";
import { ThemeProvider } from "@/lib/theme-context";
import { ru } from "@/lib/i18n/dictionaries/ru";
import { en } from "@/lib/i18n/dictionaries/en";
import { ApiError } from "@/lib/api";

// jsdom не реализует IntersectionObserver — AuthShell рендерит HeroVisual
// (framer-motion `animate`, но также содержит whileInView-свободные mount
// эффекты через MotionConfig/motion.div с обычным animate — на всякий
// случай тот же стаб, что и в app/page.test.tsx).
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}
// @ts-expect-error — минимальный тестовый стаб
global.IntersectionObserver = IntersectionObserverStub;

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

const loginMock = vi.fn();
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    login: loginMock,
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  }),
}));

function renderLogin() {
  return render(
    <ThemeProvider>
      <LocaleProvider>
        <AuthShell>
          <LoginPage />
        </AuthShell>
      </LocaleProvider>
    </ThemeProvider>
  );
}

describe("LoginPage — D3 auth shell", () => {
  beforeEach(() => {
    loginMock.mockReset();
    pushMock.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders inside the auth shell (back-to-Landing link, ThemeToggle, LocaleSwitcher present)", async () => {
    renderLogin();
    await act(async () => {});

    expect(screen.getAllByRole("link", { name: /EduMind 3D/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("radiogroup", { name: "Тема оформления" })).toBeDefined();
    expect(screen.getByRole("radiogroup", { name: "Язык / Language / Забон" })).toBeDefined();
  });

  it("has no forgot-password link or flow (not supported by the backend contract)", async () => {
    renderLogin();
    await act(async () => {});

    expect(screen.queryByText(/забыли пароль/i)).toBeNull();
    expect(screen.queryByText(/forgot password/i)).toBeNull();
  });

  it("switching language updates the visible auth copy", async () => {
    renderLogin();
    await act(async () => {});

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(ru.auth.login.title);

    fireEvent.click(screen.getAllByRole("radio", { name: "English" })[0]);

    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.textContent).toBe(en.auth.login.title);
  });

  it("submits email/password and redirects to /dashboard on success (contract unchanged)", async () => {
    loginMock.mockResolvedValueOnce(undefined);
    renderLogin();
    await act(async () => {});

    fireEvent.change(screen.getByLabelText(ru.auth.login.emailLabel), { target: { value: "student@example.com" } });
    fireEvent.change(screen.getByLabelText(ru.auth.login.passwordLabel), { target: { value: "hunter22" } });
    fireEvent.click(screen.getByRole("button", { name: ru.auth.login.submit }));

    await act(async () => {});

    expect(loginMock).toHaveBeenCalledWith("student@example.com", "hunter22");
    expect(pushMock).toHaveBeenCalledWith("/dashboard");
  });

  it("shows the server error message and does not redirect on failure", async () => {
    loginMock.mockRejectedValueOnce(new ApiError(401, "Неверный email или пароль"));
    renderLogin();
    await act(async () => {});

    fireEvent.change(screen.getByLabelText(ru.auth.login.emailLabel), { target: { value: "student@example.com" } });
    fireEvent.change(screen.getByLabelText(ru.auth.login.passwordLabel), { target: { value: "wrongpass" } });
    fireEvent.click(screen.getByRole("button", { name: ru.auth.login.submit }));

    expect(await screen.findByText("Неверный email или пароль")).toBeDefined();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("disables the submit button and shows loading copy while the request is in flight", async () => {
    let resolveLogin: () => void = () => {};
    loginMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveLogin = resolve;
        })
    );
    renderLogin();
    await act(async () => {});

    fireEvent.change(screen.getByLabelText(ru.auth.login.emailLabel), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText(ru.auth.login.passwordLabel), { target: { value: "hunter22" } });
    fireEvent.click(screen.getByRole("button", { name: ru.auth.login.submit }));

    const loadingButton = await screen.findByRole("button", { name: ru.auth.login.submitLoading });
    expect((loadingButton as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      resolveLogin();
    });
  });

  it("password field toggles visibility via the show/hide control", async () => {
    renderLogin();
    await act(async () => {});

    const passwordInput = screen.getByLabelText(ru.auth.login.passwordLabel) as HTMLInputElement;
    expect(passwordInput.type).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "Показать пароль" }));
    expect(passwordInput.type).toBe("text");
  });
});
