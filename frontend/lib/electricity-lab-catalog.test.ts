import { describe, expect, it } from "vitest";
import { solveCircuit, type CircuitComponent, type Connection } from "./circuit-engine";
import {
  ELECTRICITY_LAB_CATALOG,
  CANONICAL_WIRING,
  getElectricityLabExperiment,
  isElectricityDifficultyUnlocked,
  snapshotMeasurement,
  type ElectricityLabStepContext,
} from "./electricity-lab-catalog";

const COMPONENTS: CircuitComponent[] = [
  { id: "battery", kind: "battery", terminals: ["battery_pos", "battery_neg"], voltageV: 12 },
  { id: "resistor", kind: "resistor", terminals: ["resistor_a", "resistor_b"], resistanceOhm: 4 },
  { id: "bulb", kind: "bulb", terminals: ["bulb_a", "bulb_b"], resistanceOhm: 2, ratedPowerW: 18 },
  { id: "switch", kind: "switch", terminals: ["switch_a", "switch_b"], isClosed: true },
  { id: "ammeter", kind: "ammeter", terminals: ["ammeter_a", "ammeter_b"] },
  { id: "fuse", kind: "fuse", terminals: ["fuse_a", "fuse_b"], ratedCurrentA: 5, isBlown: false },
  { id: "voltmeter", kind: "voltmeter", terminals: ["voltmeter_a", "voltmeter_b"] },
];

function makeCtx(overrides: Partial<ElectricityLabStepContext> = {}): ElectricityLabStepContext {
  const connections: Connection[] = overrides.connections ?? [];
  const components = overrides.components ?? COMPONENTS;
  const solution = overrides.solution ?? solveCircuit(components, connections);
  return {
    components,
    connections,
    solution,
    measurementsRecorded: 0,
    minVoltageVObserved: 12,
    maxVoltageVObserved: 12,
    minResistanceOhmObserved: 4,
    maxResistanceOhmObserved: 4,
    maxCurrentAObserved: 0,
    maxBulbBrightnessObserved: 0,
    fuseBlownObserved: false,
    openCircuitObserved: false,
    shortCircuitObserved: false,
    conclusionText: "",
    ...overrides,
  };
}

function wireAll(pairs: [string, string][]): Connection[] {
  return pairs.map(([a, b], i) => ({ id: `c${i}`, terminals: [a, b] as [string, string] }));
}

describe("electricity-lab-catalog", () => {
  it("содержит ровно 8 экспериментов, покрывающих все заявленные сценарии", () => {
    expect(ELECTRICITY_LAB_CATALOG).toHaveLength(8);
  });

  it("измерение тока: не завершено без записанного измерения, даже если цепь активна", () => {
    const exp = getElectricityLabExperiment("elec-beginner-measure-current")!;
    const connections = wireAll(CANONICAL_WIRING);
    const ctx = makeCtx({ connections, measurementsRecorded: 0 });
    expect(ctx.solution.isCircuitActive).toBe(true);
    expect(exp.isComplete(ctx)).toBe(false);

    const ctxWithMeasurement = makeCtx({ connections, measurementsRecorded: 1 });
    expect(exp.isComplete(ctxWithMeasurement)).toBe(true);
  });

  it("влияние сопротивления: не завершено, пока диапазон наблюдений меньше 10 Ом", () => {
    const exp = getElectricityLabExperiment("elec-intermediate-resistance-influence")!;
    const connections = wireAll(CANONICAL_WIRING);
    const narrowRange = makeCtx({ connections, measurementsRecorded: 2, minResistanceOhmObserved: 4, maxResistanceOhmObserved: 8 });
    expect(exp.isComplete(narrowRange)).toBe(false);

    const wideRange = makeCtx({ connections, measurementsRecorded: 2, minResistanceOhmObserved: 4, maxResistanceOhmObserved: 20 });
    expect(exp.isComplete(wideRange)).toBe(true);
  });

  it("перегрузка предохранителя: завершается только по реально зафиксированному перегоранию", () => {
    const exp = getElectricityLabExperiment("elec-advanced-fuse-overload")!;
    const connections = wireAll(CANONICAL_WIRING);
    const notBlown = makeCtx({ connections, fuseBlownObserved: false });
    expect(exp.isComplete(notBlown)).toBe(false);
    const blown = makeCtx({ connections, fuseBlownObserved: true });
    expect(exp.isComplete(blown)).toBe(true);
  });

  it("короткое замыкание: требует и наблюдения КЗ, и последующего восстановления активной цепи", () => {
    const exp = getElectricityLabExperiment("elec-advanced-short-circuit")!;
    const connections = wireAll(CANONICAL_WIRING);
    const onlyObserved = makeCtx({ connections, shortCircuitObserved: true, solution: solveCircuit(COMPONENTS, connections) });
    // isCircuitActive true и isShortCircuit false в этом наборе connections -> должно быть true
    expect(exp.isComplete(onlyObserved)).toBe(true);

    const stillShorted = makeCtx({
      connections,
      shortCircuitObserved: true,
      solution: { ...solveCircuit(COMPONENTS, connections), isShortCircuit: true },
    });
    expect(exp.isComplete(stillShorted)).toBe(false);
  });

  it("разблокировка сложности: intermediate/advanced требуют реального прогресса", () => {
    expect(isElectricityDifficultyUnlocked("beginner", [])).toBe(true);
    expect(isElectricityDifficultyUnlocked("intermediate", [])).toBe(false);
    expect(isElectricityDifficultyUnlocked("intermediate", ["elec-beginner-measure-current"])).toBe(true);
    expect(isElectricityDifficultyUnlocked("advanced", ["elec-beginner-measure-current"])).toBe(false);
    expect(isElectricityDifficultyUnlocked("advanced", ["elec-intermediate-voltage-influence"])).toBe(true);
  });

  it("snapshotMeasurement читает значения из реального решения, не выдумывает их", () => {
    const connections = wireAll(CANONICAL_WIRING);
    const solution = solveCircuit(COMPONENTS, connections);
    const snap = snapshotMeasurement({ components: COMPONENTS, solution });
    expect(snap.currentA).toBe(solution.currentA);
    expect(snap.resistanceOhm).toBe(4);
    expect(snap.voltageV).toBe(solution.readings.voltmeter?.voltageV);
  });

  it("каждый вопрос каждого эксперимента имеет ровно один корректный индекс в пределах options", () => {
    for (const exp of ELECTRICITY_LAB_CATALOG) {
      const ctx = makeCtx({ connections: wireAll(CANONICAL_WIRING) });
      for (const q of exp.questions) {
        const idx = q.correctIndex(ctx);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(q.options.length);
      }
    }
  });
});
