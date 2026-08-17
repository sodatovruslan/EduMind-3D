// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimMediaOwnership, releaseMediaOwnership, renewMediaOwnership } from "./mediaOwnership";

describe("multi-tab media ownership lease (brief §28)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("the first tab to claim a call's media lease owns it", () => {
    expect(claimMediaOwnership("call-1", "tab-a")).toBe(true);
  });

  it("a second tab cannot claim media ownership while the first tab's lease is fresh", () => {
    expect(claimMediaOwnership("call-1", "tab-a")).toBe(true);
    expect(claimMediaOwnership("call-1", "tab-b")).toBe(false);
  });

  it("the SAME tab re-claiming its own lease succeeds (idempotent)", () => {
    expect(claimMediaOwnership("call-1", "tab-a")).toBe(true);
    expect(claimMediaOwnership("call-1", "tab-a")).toBe(true);
  });

  it("releasing lets another tab claim it", () => {
    expect(claimMediaOwnership("call-1", "tab-a")).toBe(true);
    releaseMediaOwnership("call-1", "tab-a");
    expect(claimMediaOwnership("call-1", "tab-b")).toBe(true);
  });

  it("a tab cannot release a lease it doesn't own", () => {
    claimMediaOwnership("call-1", "tab-a");
    releaseMediaOwnership("call-1", "tab-b"); // no-op, tab-b never owned it
    expect(claimMediaOwnership("call-1", "tab-c")).toBe(false); // tab-a's lease still fresh
  });

  it("a stale lease (owner never renewed) becomes claimable by another tab", () => {
    vi.useFakeTimers();
    try {
      claimMediaOwnership("call-1", "tab-a");
      vi.advanceTimersByTime(20_000); // past the 15s staleness window, tab-a never renewed
      expect(claimMediaOwnership("call-1", "tab-b")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("renewing keeps the SAME owner's lease from going stale", () => {
    vi.useFakeTimers();
    try {
      claimMediaOwnership("call-1", "tab-a");
      vi.advanceTimersByTime(10_000);
      renewMediaOwnership("call-1", "tab-a");
      vi.advanceTimersByTime(10_000); // 20s total, but renewed 10s ago — still fresh
      expect(claimMediaOwnership("call-1", "tab-b")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("different calls have independent leases", () => {
    expect(claimMediaOwnership("call-1", "tab-a")).toBe(true);
    expect(claimMediaOwnership("call-2", "tab-b")).toBe(true);
  });
});
