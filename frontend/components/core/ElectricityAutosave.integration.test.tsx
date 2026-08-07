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
 * Stage S9.7 — Autosave & Resume INTEGRATION tests. Real
 * ExperimentStateProvider + real ElectricityLabExperienceProvider, real
 * localStorage — no mocked save data. Each test simulates a page reload by
 * unmounting the whole provider tree (cleanup()) and mounting a brand-new
 * one with the SAME simulationId, exactly as a real browser refresh would.
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

const SIMULATION_ID = "sim-electricity-autosave-it";

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

describe("Autosave integration — реальный прогресс попадает в localStorage", () => {
  it("выбор эксперимента + сборка цепи + шаг сохраняются под ключом симуляции", () => {
    const { result } = renderHook(() => useBridge(), { wrapper });

    act(() => result.current.lab.selectExperiment("elec-beginner-measure-current"));
    act(() => wireCanonical(result.current.circuit));
    act(() => result.current.lab.advanceStep());
    flushAutosave();

    const saved = loadElectricitySave(SIMULATION_ID);
    expect(saved).not.toBeNull();
    expect(saved!.experiment.experimentId).toBe("elec-beginner-measure-current");
    expect(saved!.experiment.currentStepIndex).toBe(1);
    expect(saved!.circuit.connections).toHaveLength(CANONICAL_WIRING.length);
  });
});

describe("Autosave integration — resume после \"перезагрузки страницы\" (полное размонтирование провайдеров)", () => {
  it("восстанавливает проводку, шаг, измерения, подсказки и evidence один в один", () => {
    const first = renderHook(() => useBridge(), { wrapper });

    act(() => first.result.current.lab.selectExperiment("elec-beginner-measure-current"));
    act(() => wireCanonical(first.result.current.circuit));
    act(() => first.result.current.lab.advanceStep()); // -> theory
    act(() => first.result.current.lab.advanceStep()); // -> equipment
    act(() => first.result.current.lab.advanceStep()); // -> assembly (уже собрано)
    act(() => first.result.current.lab.advanceStep()); // -> measurement
    act(() => first.result.current.lab.recordMeasurement());
    act(() => first.result.current.lab.recordHintUsed());
    flushAutosave();

    const beforeReload = loadElectricitySave(SIMULATION_ID)!;
    expect(beforeReload.experiment.currentStepIndex).toBe(4);

    // "перезагрузка страницы" — полностью новое дерево провайдеров
    first.unmount();
    cleanup();
    electricityAutosaveEngine.destroy();

    const second = renderHook(() => useBridge(), { wrapper });
    expect(second.result.current.lab.pendingResume?.experiment.experimentId).toBe("elec-beginner-measure-current");
    expect(second.result.current.lab.selectedExperiment).toBeNull(); // ждёт решения студента

    act(() => second.result.current.lab.resumeSave(second.result.current.lab.pendingResume!));

    expect(second.result.current.lab.selectedExperiment?.id).toBe("elec-beginner-measure-current");
    expect(second.result.current.lab.currentStepIndex).toBe(4);
    expect(second.result.current.lab.currentStep?.id).toBe("measurement");
    expect(second.result.current.lab.measurements).toHaveLength(1);
    expect(second.result.current.circuit.state.connections).toHaveLength(CANONICAL_WIRING.length);
    expect(solveCircuit(second.result.current.circuit.state.components, second.result.current.circuit.state.connections).isCircuitActive).toBe(true);
  });
});

describe("Autosave integration — восстанавливает состояние предохранителя и переключателя", () => {
  it("isBlown/isClosed переживают resume, как реальная часть components", () => {
    const first = renderHook(() => useBridge(), { wrapper });

    act(() => first.result.current.lab.selectExperiment("elec-advanced-fuse-overload"));
    act(() => wireCanonical(first.result.current.circuit));
    act(() => {
      first.result.current.circuit.updateComponent("battery", { voltageV: 24 });
      first.result.current.circuit.updateComponent("resistor", { resistanceOhm: 0.5 });
      first.result.current.circuit.updateComponent("fuse", { isBlown: true });
      first.result.current.circuit.updateComponent("switch", { isClosed: false });
    });
    flushAutosave();

    first.unmount();
    cleanup();
    electricityAutosaveEngine.destroy();

    const second = renderHook(() => useBridge(), { wrapper });
    act(() => second.result.current.lab.resumeSave(second.result.current.lab.pendingResume!));

    const fuse = second.result.current.circuit.state.components.find((c) => c.id === "fuse");
    const sw = second.result.current.circuit.state.components.find((c) => c.id === "switch");
    expect(fuse?.isBlown).toBe(true);
    expect(sw?.isClosed).toBe(false);
  });
});

describe("Autosave integration — evidence/assessment-совместимое состояние переживает resume", () => {
  it("hintsUsed и evidenceEvents восстанавливаются и учитываются в итоговом assessment после завершения", () => {
    const first = renderHook(() => useBridge(), { wrapper });

    act(() => first.result.current.lab.selectExperiment("elec-beginner-measure-current"));
    act(() => first.result.current.lab.recordHintUsed());
    act(() => first.result.current.lab.recordHintUsed());
    flushAutosave();

    first.unmount();
    cleanup();
    electricityAutosaveEngine.destroy();

    const second = renderHook(() => useBridge(), { wrapper });
    act(() => second.result.current.lab.resumeSave(second.result.current.lab.pendingResume!));

    // завершаем работу уже после resume — hintsUsed должен учитывать ОБЕ подсказки
    act(() => wireCanonical(second.result.current.circuit));
    act(() => second.result.current.lab.recordMeasurement());
    act(() => second.result.current.lab.setConclusionDraft("Ток определяется законом Ома: I = U / R."));
    let guard = 0;
    while (second.result.current.lab.currentStep?.id !== "finish" && guard < 10) {
      act(() => second.result.current.lab.advanceStep());
      guard += 1;
    }
    expect(second.result.current.lab.currentStep?.id).toBe("finish");
    act(() => second.result.current.lab.completeExperiment());

    const entry = second.result.current.lab.lastNotebookEntry!;
    expect(entry.hintsUsed).toBe(2);
  });
});
