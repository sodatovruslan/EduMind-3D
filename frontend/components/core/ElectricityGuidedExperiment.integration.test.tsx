// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { cleanup, renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { ExperimentStateProvider, useExperimentState } from "./ExperimentStateProvider";
import { ElectricityLabExperienceProvider, useElectricityLabExperience } from "./ElectricityLabExperienceProvider";
import { solveCircuit, type CircuitComponent } from "@/lib/circuit-engine";
import { CANONICAL_WIRING } from "@/lib/electricity-lab-catalog";

/**
 * Stage S9.5 — Guided Experiments INTEGRATION tests. Same idiom as
 * ElectricitySafety.integration.test.tsx: a real ExperimentStateProvider
 * (the same reducer ElectricityLabScene.tsx uses) feeds a real solveCircuit()
 * result into a real ElectricityLabExperienceProvider (the same guided-lab
 * provider the scene mounts) — no mocked circuit state, no reimplemented
 * gating. Multi-step lifecycles live in
 * ElectricityGuidedExperiment.workflow.test.tsx instead.
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

describe("ElectricityLabExperienceProvider — реальная проводка через ExperimentStateProvider", () => {
  it("шаг сборки для 'измерение тока' не разблокируется, пока амперметр реально не встал в контур последовательно", () => {
    const { result } = renderHook(() => useBridge(), { wrapper });

    act(() => result.current.lab.selectExperiment("elec-beginner-measure-current"));
    act(() => result.current.lab.advanceStep()); // introduction -> theory
    act(() => result.current.lab.advanceStep()); // theory -> equipment
    act(() => result.current.lab.advanceStep()); // equipment -> assembly
    expect(result.current.lab.currentStep?.id).toBe("assembly");

    // студент по ошибке шунтирует резистор амперметром вместо серии
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
    expect(result.current.lab.currentStepFeedback).toMatch(/шунтирует/);

    // исправляет реальным removeConnection/addConnection, не пересозданием ctx
    act(() => {
      result.current.circuit.removeConnection("c3");
      result.current.circuit.removeConnection("c6");
      result.current.circuit.removeConnection("c7");
      result.current.circuit.addConnection({ id: "c8", terminals: ["resistor_b", "ammeter_a"] });
      result.current.circuit.addConnection({ id: "c9", terminals: ["ammeter_b", "bulb_a"] });
    });

    expect(result.current.lab.isCurrentStepUnlocked).toBe(true);
    expect(result.current.lab.currentStepFeedback).toBeNull();
  });

  it("guided experiment реагирует на реальное короткое замыкание — блокирует finish, пока КЗ не устранено", () => {
    const { result } = renderHook(() => useBridge(), { wrapper });

    act(() => wireCanonical(result.current.circuit));
    act(() => result.current.lab.selectExperiment("elec-intermediate-resistance-influence"));
    act(() => result.current.lab.advanceStep()); // introduction -> theory
    act(() => result.current.lab.advanceStep()); // theory -> equipment
    act(() => result.current.lab.advanceStep()); // equipment -> assembly (circuit already wired)
    expect(result.current.lab.isCurrentStepUnlocked).toBe(true);
    act(() => result.current.lab.advanceStep()); // assembly -> measurement

    act(() => result.current.circuit.updateComponent("resistor", { resistanceOhm: 20 }));
    act(() => result.current.lab.recordMeasurement());
    act(() => result.current.circuit.updateComponent("resistor", { resistanceOhm: 4 }));
    act(() => result.current.lab.recordMeasurement());
    expect(result.current.lab.isCurrentStepUnlocked).toBe(true); // диапазон >= 10 Ом и 2 измерения выполнены
    act(() => result.current.lab.advanceStep()); // measurement -> analysis
    act(() => result.current.lab.advanceStep()); // analysis -> conclusion
    act(() => result.current.lab.setConclusionDraft("Ток уменьшился при росте сопротивления, как и предсказывает закон Ома."));
    act(() => result.current.lab.advanceStep()); // conclusion -> finish

    expect(result.current.lab.currentStep?.kind).toBe("finish");
    expect(result.current.lab.isCurrentStepUnlocked).toBe(true); // всё безопасно -> finish разблокирован

    // студент замыкает батарею напрямую — реальное КЗ через продакшн-солвер
    act(() => result.current.circuit.addConnection({ id: "short", terminals: ["battery_pos", "battery_neg"] }));
    expect(solveCircuit(result.current.circuit.state.components, result.current.circuit.state.connections).isShortCircuit).toBe(true);
    expect(result.current.lab.isCurrentStepUnlocked).toBe(false); // finish заблокирован реальным КЗ
    expect(result.current.lab.currentStepFeedback).toMatch(/[Кк]оротк/);

    act(() => result.current.circuit.removeConnection("short"));
    expect(solveCircuit(result.current.circuit.state.components, result.current.circuit.state.connections).isShortCircuit).toBe(false);
    expect(result.current.lab.isCurrentStepUnlocked).toBe(true); // устранили КЗ -> finish снова разблокирован
  });
});
