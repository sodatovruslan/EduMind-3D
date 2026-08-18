// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimMediaOwnership, releaseMediaOwnership, renewMediaOwnership } from "./mediaOwnership";

describe("multi-tab media ownership lease (brief §28)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("the first tab to claim a call's media lease owns it", () => {
    expect(claimMediaOwnership("call-1", "user-a", "tab-a")).toBe(true);
  });

  it("a second tab of the SAME user cannot claim media ownership while the first tab's lease is fresh", () => {
    expect(claimMediaOwnership("call-1", "user-a", "tab-a")).toBe(true);
    expect(claimMediaOwnership("call-1", "user-a", "tab-b")).toBe(false);
  });

  it("the SAME tab re-claiming its own lease succeeds (idempotent)", () => {
    expect(claimMediaOwnership("call-1", "user-a", "tab-a")).toBe(true);
    expect(claimMediaOwnership("call-1", "user-a", "tab-a")).toBe(true);
  });

  it("releasing lets another tab of the same user claim it", () => {
    expect(claimMediaOwnership("call-1", "user-a", "tab-a")).toBe(true);
    releaseMediaOwnership("call-1", "user-a", "tab-a");
    expect(claimMediaOwnership("call-1", "user-a", "tab-b")).toBe(true);
  });

  it("a tab cannot release a lease it doesn't own", () => {
    claimMediaOwnership("call-1", "user-a", "tab-a");
    releaseMediaOwnership("call-1", "user-a", "tab-b"); // no-op, tab-b never owned it
    expect(claimMediaOwnership("call-1", "user-a", "tab-c")).toBe(false); // tab-a's lease still fresh
  });

  it("a stale lease (owner never renewed) becomes claimable by another tab", () => {
    vi.useFakeTimers();
    try {
      claimMediaOwnership("call-1", "user-a", "tab-a");
      vi.advanceTimersByTime(20_000); // past the 15s staleness window, tab-a never renewed
      expect(claimMediaOwnership("call-1", "user-a", "tab-b")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("renewing keeps the SAME owner's lease from going stale", () => {
    vi.useFakeTimers();
    try {
      claimMediaOwnership("call-1", "user-a", "tab-a");
      vi.advanceTimersByTime(10_000);
      renewMediaOwnership("call-1", "user-a", "tab-a");
      vi.advanceTimersByTime(10_000); // 20s total, but renewed 10s ago — still fresh
      expect(claimMediaOwnership("call-1", "user-a", "tab-b")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("different calls have independent leases", () => {
    expect(claimMediaOwnership("call-1", "user-a", "tab-a")).toBe(true);
    expect(claimMediaOwnership("call-2", "user-a", "tab-b")).toBe(true);
  });

  it("BUG REGRESSION: two DIFFERENT real participants of the SAME call, each testing from their own tab of the same browser, never block each other", () => {
    // This is exactly the scenario a solo developer hits testing a 1:1
    // call with both accounts open in two tabs of one browser on one
    // machine: localStorage is shared per-origin, but call-1's caller and
    // callee are two different real people, not two tabs of one person.
    // Before the (callId, userId) scoping fix, the second claim below
    // returned false, silently stopping that participant's tab from ever
    // calling getUserMedia — surfacing as a mystifying "connection
    // failed" on the other side instead of a real media problem.
    expect(claimMediaOwnership("call-1", "teacher-1", "tab-teacher")).toBe(true);
    expect(claimMediaOwnership("call-1", "student-1", "tab-student")).toBe(true);
  });
});
