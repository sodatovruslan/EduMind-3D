// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { ExperimentStateProvider, useExperimentState } from "./ExperimentStateProvider";
import { ElectricityLabExperienceProvider, useElectricityLabExperience } from "./ElectricityLabExperienceProvider";
import { solveCircuit, type CircuitComponent } from "@/lib/circuit-engine";
import { CANONICAL_WIRING } from "@/lib/electricity-lab-catalog";
import { electricityAutosaveEngine, loadElectricitySave } from "@/lib/electricity-autosave-engine";

/**
 * Stage S9.7 — Autosave & Resume WORKFLOW tests. Full realistic sessions:
 * start -> progress -> autosave -> "reload" (full provider tree
 * unmount/remount, same simulationId) -> resume -> finish. Real
 * ExperimentStateProvider + real ElectricityLabExperienceProvider + real
 * localStorage throughout — the same idiom as
 * ElectricityAutosave.integration.test.tsx, but end-to-end sessions
 * instead of single-state checks.
 */

afterEach(cleanup);
beforeEach(() => {
  window.localStorage.clear();
  electricityAutosaveEngine.destroy();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const SIMULATION_ID = "sim-electricity-autosave-workflow";

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
    <ElectricityLabExperienceProvider simulationId={SIMULATION_ID} stepContext={{ components: state.components, connections: state.connections, solution }}>
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

function flushAutosave() {
  act(() => {
    vi.advanceTimersByTime(1500);
  });
}

function reload() {
  cleanup();
  electricityAutosaveEngine.destroy();
  return renderHook(() => useBridge(), { wrapper });
}

function advanceToStep(result: { current: { lab: ReturnType<typeof useElectricityLabExperience> } }, stepId: string) {
  let guard = 0;
  while (result.current.lab.currentStep?.id !== stepId && guard < 10) {
    act(() => result.current.lab.advanceStep());
    guard += 1;
  }
}

describe("Workflow — старт, прогресс, автосохранение, пересоздание сессии, resume, завершение", () => {
  it("полный цикл ровно по требованиям S9.7: студент возвращается после закрытия вкладки и доводит работу до конца", () => {
    // 1. старт
    let session = renderHook(() => useBridge(), { wrapper });
    act(() => session.result.current.lab.selectExperiment("elec-beginner-measure-current"));

    // 2. прогресс
    act(() => wireCanonical(session.result.current.circuit));
    advanceToStep(session.result, "measurement");
    act(() => session.result.current.lab.recordMeasurement());

    // 3. автосохранение (debounce)
    flushAutosave();
    expect(loadElectricitySave(SIMULATION_ID)).not.toBeNull();

    // 4. пересоздание сессии — студент закрыл вкладку и вернулся
    session = reload();
    expect(session.result.current.lab.pendingResume).not.toBeNull();

    // 5. resume
    act(() => session.result.current.lab.resumeSave(session.result.current.lab.pendingResume!));
    expect(session.result.current.lab.currentStep?.id).toBe("measurement");
    expect(session.result.current.lab.measurements).toHaveLength(1);

    // 6. завершение
    advanceToStep(session.result, "analysis");
    act(() => session.result.current.lab.answerQuestion("q-current-formula", 0));
    advanceToStep(session.result, "conclusion");
    act(() => session.result.current.lab.setConclusionDraft("Ток определяется законом Ома: I = U / R."));
    advanceToStep(session.result, "finish");
    act(() => session.result.current.lab.completeExperiment());

    expect(session.result.current.lab.notebookEntries).toHaveLength(1);
    expect(session.result.current.lab.completedExperimentIds).toContain("elec-beginner-measure-current");
    // работа завершена -> резюмировать больше нечего
    expect(loadElectricitySave(SIMULATION_ID)).toBeNull();
  });
});

describe("Workflow — Start Over отклоняет старое сохранение и начинает работу с нуля", () => {
  it("после Start Over прогресс из старой сессии не просачивается в новую попытку", () => {
    let session = renderHook(() => useBridge(), { wrapper });
    act(() => session.result.current.lab.selectExperiment("elec-beginner-measure-current"));
    act(() => wireCanonical(session.result.current.circuit));
    act(() => session.result.current.lab.recordMeasurement());
    act(() => session.result.current.lab.recordHintUsed());
    flushAutosave();

    session = reload();
    expect(session.result.current.lab.pendingResume).not.toBeNull();

    act(() => session.result.current.lab.discardPendingResume());
    expect(session.result.current.lab.pendingResume).toBeNull();
    expect(loadElectricitySave(SIMULATION_ID)).toBeNull();

    // студент начинает ту же работу заново
    act(() => session.result.current.lab.selectExperiment("elec-beginner-measure-current"));
    expect(session.result.current.lab.currentStepIndex).toBe(0);
    expect(session.result.current.lab.measurements).toHaveLength(0); // старые измерения не просочились
  });
});

describe("Workflow — ошибка допущена до перезагрузки, исправлена после resume", () => {
  it("evidence-журнал остаётся непрерывным через границу reload: итоговая запись видит и ошибку, и исправление", () => {
    let session = renderHook(() => useBridge(), { wrapper });
    act(() => session.result.current.lab.selectExperiment("elec-beginner-measure-current"));
    advanceToStep(session.result, "assembly");

    // ошибка ДО перезагрузки: амперметр шунтирует резистор
    act(() => {
      session.result.current.circuit.addConnection({ id: "c1", terminals: ["battery_pos", "switch_a"] });
      session.result.current.circuit.addConnection({ id: "c2", terminals: ["switch_b", "resistor_a"] });
      session.result.current.circuit.addConnection({ id: "c3", terminals: ["resistor_b", "bulb_a"] });
      session.result.current.circuit.addConnection({ id: "c4", terminals: ["bulb_b", "fuse_a"] });
      session.result.current.circuit.addConnection({ id: "c5", terminals: ["fuse_b", "battery_neg"] });
      session.result.current.circuit.addConnection({ id: "c6", terminals: ["ammeter_a", "resistor_a"] });
      session.result.current.circuit.addConnection({ id: "c7", terminals: ["ammeter_b", "resistor_b"] });
    });
    expect(session.result.current.lab.isCurrentStepUnlocked).toBe(false);
    flushAutosave();

    // перезагрузка страницы ровно в момент ошибки
    session = reload();
    act(() => session.result.current.lab.resumeSave(session.result.current.lab.pendingResume!));
    expect(session.result.current.lab.isCurrentStepUnlocked).toBe(false); // ошибка восстановлена вместе с проводкой

    // исправление ПОСЛЕ resume
    act(() => {
      session.result.current.circuit.removeConnection("c3");
      session.result.current.circuit.removeConnection("c6");
      session.result.current.circuit.removeConnection("c7");
      session.result.current.circuit.addConnection({ id: "c8", terminals: ["resistor_b", "ammeter_a"] });
      session.result.current.circuit.addConnection({ id: "c9", terminals: ["ammeter_b", "bulb_a"] });
    });
    expect(session.result.current.lab.isCurrentStepUnlocked).toBe(true);

    advanceToStep(session.result, "measurement");
    act(() => session.result.current.lab.recordMeasurement());
    advanceToStep(session.result, "conclusion");
    act(() => session.result.current.lab.setConclusionDraft("После исправления подключения амперметра ток стабилен."));
    advanceToStep(session.result, "finish");
    act(() => session.result.current.lab.completeExperiment());

    const entry = session.result.current.lab.lastNotebookEntry!;
    expect(entry.measurementErrorsCount).toBeGreaterThan(0); // ошибка ДО reload учтена
    expect(entry.selfCorrectionsCount).toBeGreaterThan(0); // исправление ПОСЛЕ resume учтено
  });
});
