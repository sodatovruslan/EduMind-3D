// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MinimalShell from "./MinimalShell";
import { useQuality } from "@/lib/quality-context";
import type { User } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

let mockUser: User | null = { id: "u1", email: "a@b.com", full_name: "Test User", role: "student", created_at: "2026-01-01" };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: mockUser, isLoading: false, login: vi.fn(), register: vi.fn(), logout: vi.fn(), refreshUser: vi.fn() }),
}));

function QualityConsumer() {
  const { quality } = useQuality();
  return <span data-testid="quality-value">{quality}</span>;
}

describe("MinimalShell — D4 immersive route shell", () => {
  beforeEach(() => {
    mockUser = { id: "u1", email: "a@b.com", full_name: "Test User", role: "student", created_at: "2026-01-01" };
  });

  afterEach(() => {
    cleanup();
  });

  it("renders children with no navigation chrome (no Rail/TopBar/nav landmarks)", async () => {
    render(
      <MinimalShell>
        <p>simulation canvas</p>
      </MinimalShell>
    );
    await act(async () => {});

    expect(screen.getByText("simulation canvas")).toBeDefined();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("banner")).toBeNull();
  });

  it("provides QualityProvider to its children (required by Chemistry/Electricity useQuality())", async () => {
    render(
      <MinimalShell>
        <QualityConsumer />
      </MinimalShell>
    );
    await act(async () => {});

    expect(screen.getByTestId("quality-value").textContent).toBe("medium");
  });

  it("still enforces the auth guard (redirects when unauthenticated)", async () => {
    mockUser = null;
    render(
      <MinimalShell>
        <p>should not render for a logged-out visitor</p>
      </MinimalShell>
    );
    await act(async () => {});

    expect(screen.queryByText("should not render for a logged-out visitor")).toBeNull();
  });
});
