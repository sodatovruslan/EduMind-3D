// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RegisterPage from "./page";
import AuthShell from "@/components/auth/AuthShell";
import { LocaleProvider } from "@/lib/locale-context";
import { ThemeProvider } from "@/lib/theme-context";
import { ru } from "@/lib/i18n/dictionaries/ru";
import { ApiError } from "@/lib/api";

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

const registerMock = vi.fn();
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    login: vi.fn(),
    register: registerMock,
    logout: vi.fn(),
    refreshUser: vi.fn(),
  }),
}));

function renderRegister() {
  return render(
    <ThemeProvider>
      <LocaleProvider>
        <AuthShell>
          <RegisterPage />
        </AuthShell>
      </LocaleProvider>
    </ThemeProvider>
  );
}

function fillForm({ name, email, password }: { name: string; email: string; password: string }) {
  fireEvent.change(screen.getByLabelText(ru.auth.register.nameLabel), { target: { value: name } });
  fireEvent.change(screen.getByLabelText(ru.auth.register.emailLabel), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(ru.auth.register.passwordLabel), { target: { value: password } });
}

describe("RegisterPage — D3 auth shell", () => {
  beforeEach(() => {
    registerMock.mockReset();
    pushMock.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders only real fields (name, email, password) — no invented role selection", async () => {
    renderRegister();
    await act(async () => {});

    expect(screen.getByLabelText(ru.auth.register.nameLabel)).toBeDefined();
    expect(screen.getByLabelText(ru.auth.register.emailLabel)).toBeDefined();
    expect(screen.getByLabelText(ru.auth.register.passwordLabel)).toBeDefined();
    expect(screen.queryByText(/студент|учитель|student|teacher|role/i)).toBeNull();
  });

  it("keeps the client-side 8-character password check and does not call the API when it fails", async () => {
    renderRegister();
    await act(async () => {});

    fillForm({ name: "Иван Иванов", email: "ivan@example.com", password: "short" });
    fireEvent.click(screen.getByRole("button", { name: ru.auth.register.submit }));

    expect(await screen.findByText(ru.auth.register.passwordTooShortError)).toBeDefined();
    expect(registerMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("submits real fields and redirects to /dashboard on success (contract unchanged)", async () => {
    registerMock.mockResolvedValueOnce(undefined);
    renderRegister();
    await act(async () => {});

    fillForm({ name: "Иван Иванов", email: "ivan@example.com", password: "hunter22" });
    fireEvent.click(screen.getByRole("button", { name: ru.auth.register.submit }));

    await act(async () => {});

    expect(registerMock).toHaveBeenCalledWith("ivan@example.com", "hunter22", "Иван Иванов");
    expect(pushMock).toHaveBeenCalledWith("/dashboard");
  });

  it("shows the server error message on failure without redirecting", async () => {
    registerMock.mockRejectedValueOnce(new ApiError(409, "Пользователь с таким email уже существует"));
    renderRegister();
    await act(async () => {});

    fillForm({ name: "Иван Иванов", email: "ivan@example.com", password: "hunter22" });
    fireEvent.click(screen.getByRole("button", { name: ru.auth.register.submit }));

    expect(await screen.findByText("Пользователь с таким email уже существует")).toBeDefined();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("has a working link back to Login", async () => {
    renderRegister();
    await act(async () => {});

    const loginLink = screen.getByRole("link", { name: ru.auth.register.loginLink });
    expect(loginLink.getAttribute("href")).toBe("/login");
  });
});
