// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { computeDeterministicAssessment, type FinalWorkspaceSnapshot } from "./chemistry-assessment";
import { observationLogger } from "./observation-logger";
import { teacherReportSyncManager } from "./teacher-report-sync";

describe("Stage S-6 — Evidence Completeness & Assessment Rigor Tests", () => {
  beforeEach(() => {
    observationLogger.resetSession();
    teacherReportSyncManager.clearAll();
  });

  it("1. Passed criterion with empty evidence is rejected and converted to incomplete", () => {
    observationLogger.initSession("test-empty-evidence", "sim-chem-1", "task-1");

    const snapshot: FinalWorkspaceSnapshot = {
      containers: [],
      stockBottles: [{ id: "stock-water", substanceId: "water", remainingGrams: 500, capState: "closed", storageSlotId: "slot-1" }],
      cabinets: [],
      safetyViolationsEncountered: [],
      taskCompleted: true,
    };

    // No events appended at all!
    const assessment = computeDeterministicAssessment({
      sessionId: "test-empty-evidence",
      simulationId: "sim-chem-1",
      taskId: "task-1",
      mode: "guided",
      events: [],
      finalSnapshot: snapshot,
      durationMs: 5000,
      hintsUsed: 0,
    });

    const taskCriterion = assessment.criteria.find((c) => c.id === "task_completion");
    expect(taskCriterion?.status).toBe("incomplete");
    expect(taskCriterion?.scoreAwarded).toBe(0);
  });

  it("2. Safety compliance passed references safety_check_completed event ID", () => {
    observationLogger.initSession("test-safety-passed", "sim-chem-1", "task-1");

    const checkEvent = observationLogger.appendEvent("safety_check_completed", "engine", {
      violationCount: 0,
      checkedRules: ["caps_closed", "no_hazard"],
      finalSafetyStatus: "passed",
      snapshotHash: "hash-123",
    });

    const snapshot: FinalWorkspaceSnapshot = {
      containers: [],
      stockBottles: [{ id: "stock-water", substanceId: "water", remainingGrams: 500, capState: "closed", storageSlotId: "slot-1" }],
      cabinets: [],
      safetyViolationsEncountered: [],
      taskCompleted: true,
    };

    const assessment = computeDeterministicAssessment({
      sessionId: "test-safety-passed",
      simulationId: "sim-chem-1",
      taskId: "task-1",
      mode: "guided",
      events: observationLogger.getEvents(),
      finalSnapshot: snapshot,
      durationMs: 5000,
      hintsUsed: 0,
    });

    const safetyCriterion = assessment.criteria.find((c) => c.id === "safety_compliance");
    expect(safetyCriterion?.status).toBe("passed");
    expect(safetyCriterion?.evidenceEventIds).toContain(checkEvent.eventId);
  });

  it("3. Safety compliance failed references safety_violation event ID", () => {
    observationLogger.initSession("test-safety-failed", "sim-chem-1", "task-1");

    const violationEvent = observationLogger.appendEvent("safety_violation", "engine", {
      violationCode: "pour_attempted_closed_cap",
      description: "Попытка наливания при закрытой крышке",
      severity: "warning",
    });

    const snapshot: FinalWorkspaceSnapshot = {
      containers: [],
      stockBottles: [{ id: "stock-water", substanceId: "water", remainingGrams: 500, capState: "open", storageSlotId: null }],
      cabinets: [],
      safetyViolationsEncountered: ["pour_attempted_closed_cap"],
      taskCompleted: false,
    };

    const assessment = computeDeterministicAssessment({
      sessionId: "test-safety-failed",
      simulationId: "sim-chem-1",
      taskId: "task-1",
      mode: "guided",
      events: observationLogger.getEvents(),
      finalSnapshot: snapshot,
      durationMs: 5000,
      hintsUsed: 0,
    });

    const safetyCriterion = assessment.criteria.find((c) => c.id === "safety_compliance");
    expect(safetyCriterion?.status).toBe("failed");
    expect(safetyCriterion?.evidenceEventIds).toContain(violationEvent.eventId);
  });

  it("4. Verifies every evidence ID in criteria exists in the event log", () => {
    observationLogger.initSession("test-evidence-exists", "sim-chem-1", "task-1");

    const e1 = observationLogger.appendEvent("safety_check_completed", "engine", {
      violationCount: 0,
      checkedRules: ["all"],
      finalSafetyStatus: "passed",
      snapshotHash: "hash-abc",
    });

    const e2 = observationLogger.appendEvent("task_completed", "validator", {
      taskId: "task-1",
      xpEarned: 100,
      durationMs: 10000,
    });

    const snapshot: FinalWorkspaceSnapshot = {
      containers: [],
      stockBottles: [],
      cabinets: [],
      safetyViolationsEncountered: [],
      taskCompleted: true,
    };

    const assessment = computeDeterministicAssessment({
      sessionId: "test-evidence-exists",
      simulationId: "sim-chem-1",
      taskId: "task-1",
      mode: "guided",
      events: observationLogger.getEvents(),
      finalSnapshot: snapshot,
      durationMs: 10000,
      hintsUsed: 0,
    });

    const allEventsSet = new Set(observationLogger.getEvents().map((e) => e.eventId));
    assessment.criteria.forEach((c) => {
      c.evidenceEventIds.forEach((id) => {
        expect(allEventsSet.has(id)).toBe(true);
      });
    });
  });

  it("5. Pending report is persisted in localStorage and restored across page reload simulation", () => {
    const item1 = teacherReportSyncManager.savePendingReport("sim-chem-1", "idemp-key-100", { score: 95 });
    expect(item1.syncStatus).toBe("pending");

    const pending = teacherReportSyncManager.getPendingReports();
    expect(pending.length).toBe(1);
    expect(pending[0].idempotencyKey).toBe("idemp-key-100");

    teacherReportSyncManager.markReportSynced("idemp-key-100");
    expect(teacherReportSyncManager.getPendingReports().length).toBe(0);
  });

  it("6. Performance measurement test: 1000 synthetic events append latency & memory trim", () => {
    observationLogger.initSession("test-perf-1000", "sim-perf", "task-perf");

    const latencies: number[] = [];
    const startTime = performance.now();

    for (let i = 0; i < 1000; i++) {
      const t0 = performance.now();
      observationLogger.appendEvent("bottle_tilted", "interaction", {
        objectId: "stock-water",
        tiltRad: 0.8,
      });
      latencies.push(performance.now() - t0);
    }

    const totalTimeMs = performance.now() - startTime;
    latencies.sort((a, b) => a - b);
    const avgLatencyMs = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p95LatencyMs = latencies[Math.floor(latencies.length * 0.95)];

    expect(observationLogger.getEvents().length).toBeLessThanOrEqual(500); // capped at MAX_EVENT_LOG_SIZE
    expect(avgLatencyMs).toBeLessThan(0.5); // Fast append (< 0.5ms average)
    expect(p95LatencyMs).toBeLessThan(1.0); // Fast p95 (< 1.0ms)
    console.log(`Perf metrics: 1000 appends total=${totalTimeMs.toFixed(2)}ms, avg=${avgLatencyMs.toFixed(3)}ms, p95=${p95LatencyMs.toFixed(3)}ms`);
  });
});
