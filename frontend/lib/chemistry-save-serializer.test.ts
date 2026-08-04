import { describe, expect, it } from "vitest";
import {
  hydrateChemistrySave,
  migrateSnapshot,
  serializeChemistrySave,
  validateSnapshot,
  type SerializeOptions,
} from "./chemistry-save-serializer";
import { observationLogger } from "./observation-logger";

describe("Stage S-8 — Chemistry Save Serializer, Hydrator & Schema Tests", () => {
  const sampleOptions: SerializeOptions = {
    saveId: "save-test-100",
    userId: "user-student-1",
    simulationId: "sim-chemistry-world",
    experimentId: "lab-water-heating",
    revision: 3,
    createdAt: "2026-08-04T12:00:00.000Z",
    updatedAt: "2026-08-04T12:05:00.000Z",
    workspace: {
      containers: [
        {
          id: "beaker-1",
          kind: "beaker",
          position: [2.6, 1.4],
          rotationY: 0,
          elevation: 0.65,
          storageSlotId: null,
          heatingSourceId: "burner-1",
          isSealed: false,
          pressureKPa: 101.3,
          data: {
            contents: [{ substanceId: "water", grams: 100 }],
            temperatureC: 85.5,
            aggregateState: "liquid",
            precipitate: [],
          },
          hazard: { level: "none" },
          capState: "open",
        },
        {
          id: "flask-1",
          kind: "flask",
          position: [-1.0, 0.5],
          rotationY: 1.57,
          elevation: 0.0,
          storageSlotId: "cabinet-1-slot-1",
          heatingSourceId: null,
          isSealed: true,
          pressureKPa: 120.0,
          data: {
            contents: [{ substanceId: "hydrochloric_acid", grams: 50 }],
            temperatureC: 22.0,
            aggregateState: "liquid",
            precipitate: [{ substanceId: "salt_ppt", grams: 2.5 }],
          },
          hazard: { level: "caution" },
          capState: "closed",
        },
      ],
      stockBottles: [
        {
          id: "bottle-water",
          substanceId: "water",
          substanceName: "Вода",
          remainingGrams: 450,
          capState: "closed",
          position: [0, 0],
          rotationY: 0,
          elevation: 0,
          storageSlotId: null,
        },
      ],
      burners: [
        {
          id: "burner-1",
          isOn: true,
          position: [2.6, 1.4],
          rotationY: 0,
          elevation: 0,
          storageSlotId: null,
        },
      ],
      cabinets: [
        {
          id: "cabinet-1",
          position: [-2.0, 0],
          rotationY: 0,
        },
      ],
      itemTransforms: [
        {
          id: "beaker-1",
          position: [2.6, 0.65, 1.4],
          rotationY: 0,
          elevation: 0.65,
          storageSlotId: null,
          heatingSourceId: "burner-1",
        },
      ],
    },
    experiment: {
      mode: "learning",
      currentStepIndex: 4,
      completedStepIds: ["goal", "safety", "prepare", "add-water"],
      taskStatus: "in_progress",
      startedAt: "2026-08-04T12:00:00.000Z",
      elapsedMs: 300000,
      hintsUsed: 1,
      conclusionDraft: "Вода нагревается равномерно",
    },
    progress: {
      xp: 40,
      achievements: ["first_heating"],
      completedExperimentIds: ["lab-intro"],
    },
    observation: {
      sessionId: "obs-session-999",
      lastSequence: 42,
      events: [{ eventId: "obs-session-999:42", eventType: "burner_toggled" }],
    },
    teacherReport: {
      latestReportId: "report-888",
      pendingSyncKeys: ["sync-key-1"],
    },
  };

  it("1. serialize -> hydrate preserves full domain state (Round-trip test)", () => {
    const snapshot = serializeChemistrySave(sampleOptions);
    expect(snapshot.schemaVersion).toBe("1.0");

    const hydrated = hydrateChemistrySave(snapshot);

    // Containers
    expect(hydrated.workspace.containers.length).toBe(2);
    const beaker = hydrated.workspace.containers.find((c) => c.id === "beaker-1");
    expect(beaker).toBeDefined();
    expect(beaker.data.temperatureC).toBe(85.5);
    expect(beaker.data.contents[0].grams).toBe(100);
    expect(beaker.heatingSourceId).toBe("burner-1");
    expect(beaker.capState).toBe("open");

    // Flask with precipitate and pressure
    const flask = hydrated.workspace.containers.find((c) => c.id === "flask-1");
    expect(flask.pressureKPa).toBe(120.0);
    expect(flask.isSealed).toBe(true);
    expect(flask.data.precipitate[0].grams).toBe(2.5);

    // Experiment progress
    expect(hydrated.experiment.currentStepIndex).toBe(4);
    expect(hydrated.experiment.completedStepIds).toContain("add-water");
    expect(hydrated.experiment.conclusionDraft).toBe("Вода нагревается равномерно");

    // Progress
    expect(hydrated.progress.xp).toBe(40);
    expect(hydrated.progress.achievements).toContain("first_heating");
  });

  it("2. Observation sequence counter prevents duplication after resume (nextSequence = lastSequence + 1)", () => {
    const snapshot = serializeChemistrySave(sampleOptions);
    expect(snapshot.observation.lastSequence).toBe(42);

    const hydrated = hydrateChemistrySave(snapshot);
    expect(hydrated.observation.lastSequence).toBe(42);

    observationLogger.restoreSession(
      hydrated.observation.sessionId,
      hydrated.observation.lastSequence,
      hydrated.observation.events
    );

    const nextEvt = observationLogger.appendEvent("burner_toggled", "interaction", {
      burnerId: "burner-1",
      isOn: false,
    });

    expect(nextEvt.sequence).toBe(43);
    expect(nextEvt.eventId).toBe("obs-session-999:43");
  });

  it("3. Runtime UI state is completely excluded from snapshot and reset to safe defaults", () => {
    const snapshot = serializeChemistrySave(sampleOptions);
    const hydrated = hydrateChemistrySave(snapshot);

    expect((snapshot as any).heldId).toBeUndefined();
    expect((snapshot as any).draggingId).toBeUndefined();
    expect((snapshot as any).placementCandidate).toBeUndefined();

    expect(hydrated.runtimeDefaults.cameraMode).toBe("orbit");
    expect(hydrated.runtimeDefaults.heldId).toBeNull();
    expect(hydrated.runtimeDefaults.placementCandidate).toBeNull();
    expect(hydrated.runtimeDefaults.activePour).toBe(false);
  });

  it("4. Deterministic serialization: array order by ID yields identical JSON snapshot", () => {
    const optionsA = { ...sampleOptions };
    // Reverse workspace item array order in optionsB
    const optionsB = {
      ...sampleOptions,
      workspace: {
        ...sampleOptions.workspace,
        containers: [...sampleOptions.workspace.containers].reverse(),
      },
    };

    const snapA = serializeChemistrySave(optionsA);
    const snapB = serializeChemistrySave(optionsB);

    expect(JSON.stringify(snapA)).toBe(JSON.stringify(snapB));
  });

  it("5. validateSnapshot rejects unknown schema version", () => {
    const badSnapshot = { ...serializeChemistrySave(sampleOptions), schemaVersion: "9.9" };
    const res = validateSnapshot(badSnapshot);
    expect(res.isValid).toBe(false);
    expect(res.errors[0]).toContain("Unsupported schema version");
  });

  it("6. validateSnapshot rejects negative substance mass", () => {
    const snap = serializeChemistrySave(sampleOptions);
    snap.workspace.containers[0].contents[0].grams = -50;

    const res = validateSnapshot(snap);
    expect(res.isValid).toBe(false);
    expect(res.errors[0]).toContain("Negative substance mass");
  });

  it("7. validateSnapshot rejects duplicate storage slot occupancy", () => {
    const snap = serializeChemistrySave(sampleOptions);
    snap.workspace.containers[0].storageSlotId = "slot-1";
    snap.workspace.containers[1].storageSlotId = "slot-1";

    const res = validateSnapshot(snap);
    expect(res.isValid).toBe(false);
    expect(res.errors[0]).toContain("Duplicate storage slot occupancy detected: slot-1");
  });

  it("8. validateSnapshot rejects invalid temperature range", () => {
    const snap = serializeChemistrySave(sampleOptions);
    snap.workspace.containers[0].temperatureC = -300; // below absolute zero

    const res = validateSnapshot(snap);
    expect(res.isValid).toBe(false);
    expect(res.errors[0]).toContain("Invalid temperature range");
  });

  it("9. migrateSnapshot passes valid 1.0 snapshot and throws on corrupt version", () => {
    const snap = serializeChemistrySave(sampleOptions);
    const migrated = migrateSnapshot(snap);
    expect(migrated.schemaVersion).toBe("1.0");

    expect(() => migrateSnapshot({ schemaVersion: "0.1" })).toThrow();
  });

  it("10. Measure snapshot payload size and execution time (Performance benchmark)", () => {
    const startSerialize = performance.now();
    const snap = serializeChemistrySave(sampleOptions);
    const serializeTimeMs = performance.now() - startSerialize;

    const jsonString = JSON.stringify(snap);
    const payloadSizeBytes = new TextEncoder().encode(jsonString).length;

    const startHydrate = performance.now();
    const hydrated = hydrateChemistrySave(snap);
    const hydrateTimeMs = performance.now() - startHydrate;

    // Log metrics for inspection
    console.log(`[Save Benchmark] Payload size: ${payloadSizeBytes} bytes (${(payloadSizeBytes / 1024).toFixed(2)} KB)`);
    console.log(`[Save Benchmark] Serialize time: ${serializeTimeMs.toFixed(3)} ms`);
    console.log(`[Save Benchmark] Hydrate time: ${hydrateTimeMs.toFixed(3)} ms`);

    expect(payloadSizeBytes).toBeLessThan(100 * 1024); // < 100 KB
    expect(serializeTimeMs).toBeLessThan(50); // < 50 ms
    expect(hydrateTimeMs).toBeLessThan(50); // < 50 ms
    expect(hydrated).toBeDefined();
  });

  it("11. burner.isOn is correctly serialized and hydrated with isOn = true", () => {
    const snap = serializeChemistrySave(sampleOptions);
    expect(snap.workspace.burners).toHaveLength(1);
    expect(snap.workspace.burners[0].id).toBe("burner-1");
    expect(snap.workspace.burners[0].isOn).toBe(true);

    const hydrated = hydrateChemistrySave(snap);
    expect(hydrated.workspace.burners).toHaveLength(1);
    expect(hydrated.workspace.burners[0].isOn).toBe(true);
  });
});
