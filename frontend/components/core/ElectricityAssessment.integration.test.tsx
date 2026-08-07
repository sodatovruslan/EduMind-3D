// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { cleanup, renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { ExperimentStateProvider, useExperimentState } from "./ExperimentStateProvider";
import { ElectricityLabExperienceProvider, useElectricityLabExperience } from "./ElectricityLabExperienceProvider";
import { solveCircuit, type CircuitComponent } from "@/lib/circuit-engine";
import { CANONICAL_WIRING } from "@/lib/electricity-lab-catalog";

/**
 * Stage S9.6 — Assessment & Teacher Analytics INTEGRATION tests. Same idiom
 * as Stage S9.5's ElectricityGuidedExperiment.integration.test.tsx: a real
 * ExperimentStateProvider feeds a real solveCircuit() result into a real
 * ElectricityLabExperienceProvider, and after a real completeExperiment()
 * we assert on the real ElectricityNotebookEntry produced (evidence
 * counters + assessment report) — nothing mocked, nothing hand-built.
 */

afterEach(cleanup);
beforeEach(() => {
  window.localStorage.clear();
});

const INITIAL_COMPONENTS: CircuitComponent[] = [
  { id: "battery", kind: "battery", terminals: ["battery_pos", "battery_neg"], voltageV: 12 },
  { id: "switch", kind: "switch", terminals: ["switch_a", "switch_b"], isClosed: true },
  { id: "resistor", kind: "resistor", terminals: ["resistor_a", "resistor_b"], resistanceOhm: 4 },
  { id: "bulb", kind: "bulb", terminals: ["bulb_a", "bulb_b"], resistanceOhm: 2, ratedPowerW: 18 },
  { id: "ammeter", kind: "ammeter", terminals: ["ammeter_a", "ammeter_b"] },
  { id: "fuse", kind: "fuse", terminals: ["fuse_a", "fuse_b"], ratedCurrentA: 5, isBlown: false },
  { id: "voltmeter", kind: "voltmeter", terminals: ["voltmeter_a", "voltmeter_b"] },
];

function Bridge({ children }: { children: ReactNode }) {
  const { state } = useExperimentState();
  const solution = solveCircuit(state.components, state.connections);
  return (
    <ElectricityLabExperienceProvider simulationId="sim-electricity" stepContext={{ components: state.components, connections: state.connections, solution }}>
      {children}
    </ElectricityLabExperienceProvider>
  );
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <ExperimentStateProvider initialComponents={INITIAL_COMPONENTS}>
      <Bridge>{children}</Bridge>
    </ExperimentStateProvider>
  );
}

function useBridge() {
  return { circuit: useExperimentState(), lab: useElectricityLabExperience() };
}

function wireCanonical(circuit: ReturnType<typeof useExperimentState>) {
  CANONICAL_WIRING.forEach(([a, b], i) => circuit.addConnection({ id: `c${i}`, terminals: [a, b] }));
}

// ВАЖНО: читает result.current заново на каждой итерации — advanceStep()
// захваченный из старого снапшота бесполезен, т.к. использует устаревший
// effectiveStepContext того рендера, когда был получен.
function advanceToStep(result: { current: { lab: ReturnType<typeof useElectricityLabExperience> } }, stepId: string) {
  let guard = 0;
  while (result.current.lab.currentStep?.id !== stepId && guard < 10) {
    act(() => result.current.lab.advanceStep());
    guard += 1;
  }
}

describe("Assessment integration — успешное прохождение без единой ошибки", () => {
  it("даёт lastNotebookEntry с нулевыми mistakes/safety и высоким assessment.overallScore", () => {
    const { result } = renderHook(() => useBridge(), { wrapper });

    act(() => wireCanonical(result.current.circuit));
    act(() => result.current.lab.selectExperiment("elec-beginner-measure-current"));
    advanceToStep(result, "measurement");
    act(() => result.current.lab.recordMeasurement());
    advanceToStep(result, "analysis");
    act(() => result.current.lab.answerQuestion("q-current-formula", 0));
    advanceToStep(result, "conclusion");
    act(() => result.current.lab.setConclusionDraft("Ток определяется законом Ома: I = U / R."));
    advanceToStep(result, "finish");
    act(() => result.current.lab.completeExperiment());

    const entry = result.current.lab.lastNotebookEntry!;
    expect(entry.mistakesCount).toBe(0);
    expect(entry.safetyIncidentsCount).toBe(0);
    expect(entry.measurementErrorsCount).toBe(0);
    expect(entry.selfCorrectionsCount).toBe(0);
    expect(entry.hintsUsed).toBe(0);
    expect(entry.durationMs).not.toBeNull();
    expect(entry.assessment.overallScore).toBe(100);
    expect(entry.assessment.safety.score).toBe(100);
    expect(entry.assessment.circuitBuilding.score).toBe(100);
  });
});

describe("Assessment integration — ошибка размещения амперметра, затем самостоятельное исправление", () => {
  it("реальный переход invalid->valid фиксируется как mistake + successful_correction на записи", () => {
    const { result } = renderHook(() => useBridge(), { wrapper });

    act(() => result.current.lab.selectExperiment("elec-beginner-measure-current"));
    advanceToStep(result, "assembly");

    // ошибка: амперметр шунтирует резистор
    act(() => {
      result.current.circuit.addConnection({ id: "c1", terminals: ["battery_pos", "switch_a"] });
      result.current.circuit.addConnection({ id: "c2", terminals: ["switch_b", "resistor_a"] });
      result.current.circuit.addConnection({ id: "c3", terminals: ["resistor_b", "bulb_a"] });
      result.current.circuit.addConnection({ id: "c4", terminals: ["bulb_b", "fuse_a"] });
      result.current.circuit.addConnection({ id: "c5", terminals: ["fuse_b", "battery_neg"] });
      result.current.circuit.addConnection({ id: "c6", terminals: ["ammeter_a", "resistor_a"] });
      result.current.circuit.addConnection({ id: "c7", terminals: ["ammeter_b", "resistor_b"] });
    });
    expect(result.current.lab.isCurrentStepUnlocked).toBe(false);

    // исправление
    act(() => {
      result.current.circuit.removeConnection("c3");
      result.current.circuit.removeConnection("c6");
      result.current.circuit.removeConnection("c7");
      result.current.circuit.addConnection({ id: "c8", terminals: ["resistor_b", "ammeter_a"] });
      result.current.circuit.addConnection({ id: "c9", terminals: ["ammeter_b", "bulb_a"] });
    });
    expect(result.current.lab.isCurrentStepUnlocked).toBe(true);

    advanceToStep(result, "measurement");
    act(() => result.current.lab.recordMeasurement());
    advanceToStep(result, "conclusion");
    act(() => result.current.lab.setConclusionDraft("Ток стабилен после исправления подключения амперметра."));
    advanceToStep(result, "finish");
    act(() => result.current.lab.completeExperiment());

    const entry = result.current.lab.lastNotebookEntry!;
    expect(entry.mistakesCount).toBeGreaterThan(0);
    expect(entry.measurementErrorsCount).toBeGreaterThan(0);
    expect(entry.selfCorrectionsCount).toBeGreaterThan(0);
    expect(entry.assessment.circuitBuilding.score).toBeLessThan(100);
    expect(entry.teacherNote).toMatch(/подключены неправильно/);
  });
});

describe("Assessment integration — небезопасная попытка (короткое замыкание), затем восстановление", () => {
  it("safetyIncidentsCount > 0 и assessment.safety снижен, даже когда финальное состояние безопасно", () => {
    const { result } = renderHook(() => useBridge(), { wrapper });

    act(() => result.current.lab.selectExperiment("elec-advanced-short-circuit"));
    advanceToStep(result, "assembly");

    act(() => {
      result.current.circuit.addConnection({ id: "short1", terminals: ["battery_pos", "switch_a"] });
      result.current.circuit.addConnection({ id: "short2", terminals: ["switch_b", "battery_neg"] });
    });
    expect(solveCircuit(result.current.circuit.state.components, result.current.circuit.state.connections).isShortCircuit).toBe(true);

    advanceToStep(result, "measurement");
    act(() => result.current.lab.recordMeasurement());
    // "measurement" сам разблокирован (shortCircuitObserved+1 запись) — но
    // "analysis" САМ требует устранённого КЗ, значит дальше "analysis"
    // продвинуться нельзя, пока КЗ активно
    advanceToStep(result, "analysis");
    expect(result.current.lab.currentStep?.id).toBe("analysis");
    advanceToStep(result, "conclusion");
    expect(result.current.lab.currentStep?.id).toBe("analysis"); // не продвинулось — КЗ ещё активно

    act(() => {
      result.current.circuit.removeConnection("short1");
      result.current.circuit.removeConnection("short2");
      wireCanonical(result.current.circuit);
    });
    advanceToStep(result, "conclusion");
    act(() => result.current.lab.answerQuestion("q-short-circuit", 0));
    act(() => result.current.lab.setConclusionDraft("КЗ устранено повторной проводкой цепи через нагрузку."));
    advanceToStep(result, "finish");
    act(() => result.current.lab.completeExperiment());

    const entry = result.current.lab.lastNotebookEntry!;
    expect(entry.safetyIncidentsCount).toBeGreaterThan(0);
    expect(entry.selfCorrectionsCount).toBeGreaterThan(0);
    expect(entry.assessment.safety.score).toBeLessThan(100);
    expect(entry.teacherNote).toMatch(/нарушений безопасности/);
  });
});

describe("Assessment integration — ошибка размещения вольтметра", () => {
  it("вольтметр включён последовательно -> measurementErrorsCount > 0 на итоговой записи", () => {
    const { result } = renderHook(() => useBridge(), { wrapper });

    act(() => result.current.lab.selectExperiment("elec-beginner-measure-voltage"));
    advanceToStep(result, "assembly");

    act(() => {
      result.current.circuit.addConnection({ id: "c1", terminals: ["battery_pos", "switch_a"] });
      result.current.circuit.addConnection({ id: "c2", terminals: ["switch_b", "voltmeter_a"] });
      result.current.circuit.addConnection({ id: "c3", terminals: ["voltmeter_b", "resistor_a"] });
      result.current.circuit.addConnection({ id: "c4", terminals: ["resistor_b", "bulb_a"] });
      result.current.circuit.addConnection({ id: "c5", terminals: ["bulb_b", "fuse_a"] });
      result.current.circuit.addConnection({ id: "c6", terminals: ["fuse_b", "battery_neg"] });
    });
    expect(result.current.lab.currentStepFeedback).toMatch(/последовательно/);

    act(() => {
      result.current.circuit.removeConnection("c2");
      result.current.circuit.removeConnection("c3");
      result.current.circuit.addConnection({ id: "c7", terminals: ["switch_b", "resistor_a"] });
      result.current.circuit.addConnection({ id: "c8", terminals: ["voltmeter_a", "resistor_a"] });
      result.current.circuit.addConnection({ id: "c9", terminals: ["voltmeter_b", "resistor_b"] });
    });
    advanceToStep(result, "measurement");
    act(() => result.current.lab.recordMeasurement());
    advanceToStep(result, "conclusion");
    act(() => result.current.lab.setConclusionDraft("Вольтметр теперь показывает напряжение на резисторе корректно."));
    advanceToStep(result, "finish");
    act(() => result.current.lab.completeExperiment());

    const entry = result.current.lab.lastNotebookEntry!;
    expect(entry.measurementErrorsCount).toBeGreaterThan(0);
    expect(entry.mistakesCount).toBeGreaterThan(0);
  });
});
