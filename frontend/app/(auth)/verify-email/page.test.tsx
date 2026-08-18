// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VerifyEmailPage from "./page";
import { LocaleProvider } from "@/lib/locale-context";
import { ru } from "@/lib/i18n/dictionaries/ru";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), useSearchParams: () => new URLSearchParams("email=student%40example.com") }));
const apiFetch = vi.fn();
vi.mock("@/lib/api", async (original) => ({ ...(await original<typeof import("@/lib/api")>()), apiFetch: (...args: unknown[]) => apiFetch(...args) }));

describe("VerifyEmailPage", () => {
  beforeEach(() => { apiFetch.mockReset(); push.mockReset(); });
  it("keeps leading zeroes and verifies the real email", async () => {
    apiFetch.mockResolvedValue({ verified: true });
    render(<LocaleProvider><VerifyEmailPage /></LocaleProvider>);
    fireEvent.change(screen.getByLabelText(ru.auth.verify.codeLabel), { target: { value: "004281" } });
    fireEvent.click(screen.getByRole("button", { name: ru.auth.verify.submit }));
    await act(async () => {});
    expect(apiFetch).toHaveBeenCalledWith("/api/auth/verify-email", expect.objectContaining({ body: JSON.stringify({ email: "student@example.com", code: "004281" }) }));
    expect(push).toHaveBeenCalledWith("/login?verified=1");
  });
  it("strips non-digits and limits input to six digits", () => {
    render(<LocaleProvider><VerifyEmailPage /></LocaleProvider>);
    const input = screen.getByLabelText(ru.auth.verify.codeLabel) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "12a34567" } });
    expect(input.value).toBe("123456");
  });
});
