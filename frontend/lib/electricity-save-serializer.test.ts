import { describe, expect, it } from "vitest";
import type { CircuitComponent, Connection } from "./circuit-engine";
import {
  hydrateElectricitySave,
  serializeElectricitySave,
  validateElectricitySaveSnapshot,
  type SerializeElectricitySaveOptions,
} from "./electricity-save-serializer";
import type { ElectricitySaveSnapshotV1 } from "./electricity-save-schema";

const COMPONENTS: CircuitComponent[] = [
  { id: "battery", kind: "battery", terminals: ["battery_pos", "battery_neg"], voltageV: 12 },
  { id: "switch", kind: "switch", terminals: ["switch_a", "switch_b"], isClosed: true },
  { id: "resistor", kind: "resistor", terminals: ["resistor_a", "resistor_b"], resistanceOhm: 4 },
  { id: "fuse", kind: "fuse", terminals: ["fuse_a", "fuse_b"], ratedCurrentA: 5, isBlown: false },
];

const CONNECTIONS: Connection[] = [
  { id: "c2", terminals: ["switch_b", "resistor_a"] },
  { id: "c1", terminals: ["battery_pos", "switch_a"] },
];

function baseOptions(overrides: Partial<SerializeElectricitySaveOptions> = {}): SerializeElectricitySaveOptions {
  return {
    saveId: "electricity-save-sim-1",
    simulationId: "sim-1",
    revision: 3,
    components: COMPONENTS,
    connections: CONNECTIONS,
    experimentId: "elec-beginner-measure-current",
    currentStepIndex: 2,
    completedStepIds: ["introduction", "theory"],
    taskStatus: "in_progress",
    startedAt: new Date(1000).toISOString(),
    hintsUsed: 1,
    measurements: [{ voltageV: 12, currentA: 2, resistanceOhm: 6, powerW: 24, at: 500 }],
    questionAnswers: { "q-current-formula": 0 },
    observationsDraft: "Лампа горит ровно.",
    conclusionDraft: "",
    evidenceEvents: [{ code: "experiment_started", at: 0, detail: "elec-beginner-measure-current" }],
    sessionObservations: {
      minVoltageV: 12,
      maxVoltageV: 12,
      minResistanceOhm: 4,
      maxResistanceOhm: 4,
      maxCurrentA: 2,
      maxBulbBrightness: 0,
      fuseBlownObserved: false,
      openCircuitObserved: false,
      shortCircuitObserved: false,
    },
    now: () => 5000,
    ...overrides,
  };
}

describe("electricity-save-serializer — serializeElectricitySave", () => {
  it("детерминированно сортирует components/connections по id", () => {
    const snapshot = serializeElectricitySave(baseOptions());
    expect(snapshot.circuit.components.map((c) => c.id)).toEqual(["battery", "fuse", "resistor", "switch"]);
    expect(snapshot.circuit.connections.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("проставляет schemaVersion/updatedAt/createdAt и переданные метаданные", () => {
    const snapshot = serializeElectricitySave(baseOptions());
    expect(snapshot.schemaVersion).toBe("1.0");
    expect(snapshot.saveId).toBe("electricity-save-sim-1");
    expect(snapshot.simulationId).toBe("sim-1");
    expect(snapshot.revision).toBe(3);
    expect(snapshot.updatedAt).toBe(new Date(5000).toISOString());
    expect(snapshot.createdAt).toBe(new Date(5000).toISOString()); // не передан явно -> совпадает с updatedAt
  });

  it("createdAt, переданный явно, не перезаписывается", () => {
    const createdAt = new Date(100).toISOString();
    const snapshot = serializeElectricitySave(baseOptions({ createdAt }));
    expect(snapshot.createdAt).toBe(createdAt);
    expect(snapshot.updatedAt).not.toBe(createdAt);
  });

  it("два вызова с одинаковым состоянием дают идентичный JSON (детерминированность)", () => {
    const a = JSON.stringify(serializeElectricitySave(baseOptions()));
    const b = JSON.stringify(serializeElectricitySave(baseOptions()));
    expect(a).toBe(b);
  });
});

describe("electricity-save-serializer — validateElectricitySaveSnapshot", () => {
  it("принимает корректный снимок", () => {
    const snapshot = serializeElectricitySave(baseOptions());
    expect(validateElectricitySaveSnapshot(snapshot)).toEqual({ isValid: true, errors: [] });
  });

  it("отклоняет не-объект", () => {
    expect(validateElectricitySaveSnapshot(null).isValid).toBe(false);
    expect(validateElectricitySaveSnapshot("nope").isValid).toBe(false);
    expect(validateElectricitySaveSnapshot(42).isValid).toBe(false);
  });

  it("отклоняет неверный schemaVersion", () => {
    const snapshot = { ...serializeElectricitySave(baseOptions()), schemaVersion: "2.0" };
    const result = validateElectricitySaveSnapshot(snapshot);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("schemaVersion"))).toBe(true);
  });

  it("отклоняет отсутствующий saveId/simulationId", () => {
    const snapshot = serializeElectricitySave(baseOptions());
    const noSaveId = { ...snapshot, saveId: "" };
    expect(validateElectricitySaveSnapshot(noSaveId).isValid).toBe(false);
    const noSimId = { ...snapshot, simulationId: "" };
    expect(validateElectricitySaveSnapshot(noSimId).isValid).toBe(false);
  });

  it("отклоняет некорректную revision", () => {
    const snapshot = { ...serializeElectricitySave(baseOptions()), revision: 0 };
    expect(validateElectricitySaveSnapshot(snapshot).isValid).toBe(false);
  });

  it("отклоняет повреждённый circuit (не массивы)", () => {
    const snapshot = serializeElectricitySave(baseOptions()) as unknown as Record<string, unknown>;
    const broken = { ...snapshot, circuit: { components: "не массив", connections: [] } };
    expect(validateElectricitySaveSnapshot(broken).isValid).toBe(false);
  });

  it("отклоняет experiment без experimentId, с отрицательным currentStepIndex, или не-массивом measurements/evidenceEvents", () => {
    const base = serializeElectricitySave(baseOptions());
    expect(validateElectricitySaveSnapshot({ ...base, experiment: { ...base.experiment, experimentId: "" } }).isValid).toBe(false);
    expect(validateElectricitySaveSnapshot({ ...base, experiment: { ...base.experiment, currentStepIndex: -1 } }).isValid).toBe(false);
    expect(
      validateElectricitySaveSnapshot({ ...base, experiment: { ...base.experiment, measurements: "не массив" } }).isValid
    ).toBe(false);
    expect(
      validateElectricitySaveSnapshot({ ...base, experiment: { ...base.experiment, evidenceEvents: "не массив" } }).isValid
    ).toBe(false);
  });
});

describe("electricity-save-serializer — hydrateElectricitySave", () => {
  it("восстанавливает все значимые поля один в один", () => {
    const snapshot = serializeElectricitySave(baseOptions());
    const hydrated = hydrateElectricitySave(snapshot);

    expect(hydrated.experimentId).toBe("elec-beginner-measure-current");
    expect(hydrated.currentStepIndex).toBe(2);
    expect(hydrated.components).toHaveLength(14);
    for (const savedComponent of baseOptions().components) {
      expect(hydrated.components.find((component) => component.id === savedComponent.id)).toEqual(savedComponent);
    }
    expect(hydrated.connections).toHaveLength(2);
    expect(hydrated.measurements).toEqual(baseOptions().measurements);
    expect(hydrated.questionAnswers).toEqual({ "q-current-formula": 0 });
    expect(hydrated.observationsDraft).toBe("Лампа горит ровно.");
    expect(hydrated.hintsUsed).toBe(1);
    expect(hydrated.evidenceEvents).toHaveLength(1);
    expect(hydrated.sessionObservations.maxCurrentA).toBe(2);
    expect(hydrated.startedAtMs).toBe(1000);
  });

  it("выбрасывает исключение на невалидном снимке — не возвращает частично собранное состояние", () => {
    const broken = { schemaVersion: "1.0", saveId: "x" } as unknown as ElectricitySaveSnapshotV1;
    expect(() => hydrateElectricitySave(broken)).toThrow();
  });

  it("некорректная startedAt не ломает hydrate — startedAtMs получает валидное число (fallback на текущее время)", () => {
    const snapshot = serializeElectricitySave(baseOptions());
    const corrupted: ElectricitySaveSnapshotV1 = {
      ...snapshot,
      experiment: { ...snapshot.experiment, startedAt: "not-a-date" },
    };
    const hydrated = hydrateElectricitySave(corrupted);
    expect(Number.isNaN(hydrated.startedAtMs)).toBe(false);
  });
});
