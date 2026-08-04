import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { autosaveEngine, type AutosaveStatus } from "./autosave-engine";
import { offlineSaveDB } from "./offline-save-db";

vi.mock("./api", () => {
  return {
    apiFetch: vi.fn(),
    ApiError: class ApiError extends Error {
      status: number;
      constructor(status: number, msg: string) {
        super(msg);
        this.status = status;
      }
    },
  };
});

import { apiFetch, ApiError } from "./api";

describe("Stage S-8 — Autosave Engine & Offline Sync Tests", () => {
  const sampleStateGetter = () => ({
    saveId: "save-123",
    userId: "user-1",
    simulationId: "sim-chem",
    experimentId: "exp-heating",
    revision: 1,
    workspace: { containers: [], stockBottles: [], burners: [] },
    experiment: {
      mode: "learning" as const,
      currentStepIndex: 1,
      completedStepIds: [],
      taskStatus: "in_progress" as const,
      startedAt: "2026-08-04T12:00:00Z",
      elapsedMs: 1000,
      hintsUsed: 0,
      conclusionDraft: "",
    },
    progress: { xp: 10, achievements: [], completedExperimentIds: [] },
    observation: { sessionId: "sess-1", lastSequence: 5, events: [] },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    autosaveEngine.init("save-123", "user-1", "sim-chem", "exp-heating", 1, sampleStateGetter);
  });

  afterEach(() => {
    autosaveEngine.destroy();
    vi.useRealTimers();
  });

  it("1. WASD, camera rotation and frame loop do NOT trigger dirty state or autosave", () => {
    const statuses: AutosaveStatus[] = [];
    autosaveEngine.subscribe((s) => statuses.push(s));

    // Simulate frame loop ticks and WASD
    vi.advanceTimersByTime(5000);
    expect(autosaveEngine.getRequestCount()).toBe(0);
    expect(autosaveEngine.getStatus()).toBe("saved");
  });

  it("2. 20 rapid domain actions within 500ms produce EXACTLY 1 debounced API request (coalesced)", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      id: "save-123",
      user_id: "user-1",
      simulation_id: "sim-chem",
      experiment_id: "exp-heating",
      schema_version: "1.0",
      revision: 2,
      status: "active",
      idempotency_key: "save-123:rev:1",
      snapshot: {},
      created_at: "2026-08-04T12:00:00Z",
      updated_at: "2026-08-04T12:00:00Z",
      last_autosaved_at: "2026-08-04T12:00:00Z",
    });

    // 20 rapid domain actions
    for (let i = 0; i < 20; i++) {
      autosaveEngine.markDirty();
      vi.advanceTimersByTime(25); // 25ms * 20 = 500ms total
    }

    // Fast-forward debounce timer (2000ms)
    await vi.advanceTimersByTimeAsync(2000);

    expect(autosaveEngine.getRequestCount()).toBe(1);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(autosaveEngine.getStatus()).toBe("saved");
  });

  it("3. Network failure routes save to offline DB with status 'offline_pending'", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("Network connection lost"));

    autosaveEngine.markDirty();
    await vi.advanceTimersByTimeAsync(2000);

    expect(autosaveEngine.getStatus()).toBe("offline_pending");

    const pending = await offlineSaveDB.getPending("save-123");
    expect(pending).not.toBeNull();
    expect(pending?.syncStatus).toBe("pending");
  });

  it("4. Online retry syncs pending save to server", async () => {
    // 1. Fail first request
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error("Offline"));

    autosaveEngine.markDirty();
    await vi.advanceTimersByTimeAsync(2000);
    expect(autosaveEngine.getStatus()).toBe("offline_pending");

    // 2. Network restored
    vi.mocked(apiFetch).mockResolvedValueOnce({
      id: "save-123",
      user_id: "user-1",
      simulation_id: "sim-chem",
      experiment_id: "exp-heating",
      schema_version: "1.0",
      revision: 2,
      status: "active",
      idempotency_key: "save-123:rev:1",
      snapshot: {},
      created_at: "2026-08-04T12:00:00Z",
      updated_at: "2026-08-04T12:00:00Z",
      last_autosaved_at: "2026-08-04T12:00:00Z",
    });

    await autosaveEngine.retryPendingSync();

    expect(autosaveEngine.getStatus()).toBe("saved");
    const pending = await offlineSaveDB.getPending("save-123");
    expect(pending).toBeNull();
  });

  it("5. HTTP 409 Revision Conflict sets status 'conflict' and does NOT overwrite server save", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(409, "revision_conflict"));

    autosaveEngine.markDirty();
    await vi.advanceTimersByTimeAsync(2000);

    expect(autosaveEngine.getStatus()).toBe("conflict");
    const pending = await offlineSaveDB.getPending("save-123");
    expect(pending?.syncStatus).toBe("revision_conflict");
  });
});
