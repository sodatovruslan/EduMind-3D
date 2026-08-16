// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { cleanup, renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { ExperimentStateProvider, useExperimentState } from "./ExperimentStateProvider";
import { ElectricityLabExperienceProvider, useElectricityLabExperience } from "./ElectricityLabExperienceProvider";
import { solveCircuit, type CircuitComponent } from "@/lib/circuit-engine";
import { CANONICAL_WIRING } from "@/lib/electricity-lab-catalog";

/**
 * Stage S9.5 — Guided Experiments WORKFLOW tests. Distinct from the plain
 * unit tests (electricity-lab-catalog.test.ts, single-context pure function
 * calls) and the plain integration tests
 * (ElectricityGuidedExperiment.integration.test.tsx, single-state checks
 * through the real providers) — these walk REALISTIC MULTI-STEP student
 * sessions end to end through the real ExperimentStateProvider + real
 * ElectricityLabExperienceProvider + real solveCircuit() + real safety/
 * measurement-validation, exactly the same lifecycle a student would see:
 * select -> step through -> complete/restart. No mocks anywhere in the
 * pipeline except the network call inside completeExperiment(), which is
 * fire-and-forget and already fails safe (see ElectricityLabExperienceProvider.tsx).
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

describe("Guided workflow — полное прохождение работы от начала до конца (elec-beginner-measure-current)", () => {
  it("студент проходит все шаги, отвечает верно и получает запись в журнале", () => {
    const { result } = renderHook(() => useBridge(), { wrapper });

    act(() => result.current.lab.selectExperiment("elec-beginner-measure-current"));
    act(() => result.current.lab.advanceStep()); // introduction -> theory
    act(() => result.current.lab.advanceStep()); // theory -> equipment
    act(() => result.current.lab.advanceStep()); // equipment -> assembly
    expect(result.current.lab.isCurrentStepUnlocked).toBe(false); // цепь ещё не собрана

    act(() => wireCanonical(result.current.circuit));
    expect(result.current.lab.isCurrentStepUnlocked).toBe(true);
    act(() => result.current.lab.advanceStep()); // assembly -> measurement

    act(() => result.current.lab.recordMeasurement());
    expect(result.current.lab.measurements).toHaveLength(1);
    act(() => result.current.lab.advanceStep()); // measurement -> analysis

    act(() => result.current.lab.answerQuestion("q-current-formula", 0)); // правильный вариант
    act(() => result.current.lab.setObservationsDraft("Ток стабилен, лампа горит ровно."));
    act(() => result.current.lab.advanceStep()); // analysis -> conclusion

    act(() => result.current.lab.setConclusionDraft("Ток в цепи определяется законом Ома: I = U / R."));
    act(() => result.current.lab.advanceStep()); // conclusion -> finish
    expect(result.current.lab.currentStep?.kind).toBe("finish");
    expect(result.current.lab.isCurrentStepUnlocked).toBe(true);

    act(() => result.current.lab.completeExperiment());

    expect(result.current.lab.selectedExperiment).toBeNull(); // сессия завершена
    expect(result.current.lab.notebookEntries).toHaveLength(1);
    expect(result.current.lab.notebookEntries[0].questionResults[0].correct).toBe(true);
    expect(result.current.lab.completedExperimentIds).toContain("elec-beginner-measure-current");
  });
});

describe("Guided workflow — неправильная проводка, затем исправление (elec-beginner-measure-voltage)", () => {
  it("вольтметр включён последовательно (ломает контур), студент исправляет на параллельное подключение", () => {
    const { result } = renderHook(() => useBridge(), { wrapper });

    act(() => result.current.lab.selectExperiment("elec-beginner-measure-voltage"));
    act(() => result.current.lab.advanceStep());
    act(() => result.current.lab.advanceStep());
    act(() => result.current.lab.advanceStep()); // -> assembly

    // ошибка: вольтметр воткнут прямо в разрыв провода (последовательно)
    act(() => {
      result.current.circuit.addConnection({ id: "c1", terminals: ["battery_pos", "switch_a"] });
      result.current.circuit.addConnection({ id: "c2", terminals: ["switch_b", "voltmeter_a"] });
      result.current.circuit.addConnection({ id: "c3", terminals: ["voltmeter_b", "resistor_a"] });
      result.current.circuit.addConnection({ id: "c4", terminals: ["resistor_b", "bulb_a"] });
      result.current.circuit.addConnection({ id: "c5", terminals: ["bulb_b", "fuse_a"] });
      result.current.circuit.addConnection({ id: "c6", terminals: ["fuse_b", "battery_neg"] });
    });
    expect(result.current.lab.isCurrentStepUnlocked).toBe(false);
    expect(result.current.lab.currentStepFeedback).toMatch(/последовательно/);

    // исправление: убираем вольтметр из основного провода, ставим его
    // параллельно резистору, восстанавливая прямую связь switch->resistor
    act(() => {
      result.current.circuit.removeConnection("c2");
      result.current.circuit.removeConnection("c3");
      result.current.circuit.addConnection({ id: "c7", terminals: ["switch_b", "resistor_a"] });
      result.current.circuit.addConnection({ id: "c8", terminals: ["voltmeter_a", "resistor_a"] });
      result.current.circuit.addConnection({ id: "c9", terminals: ["voltmeter_b", "resistor_b"] });
    });
    expect(result.current.lab.isCurrentStepUnlocked).toBe(true);
    expect(result.current.lab.currentStepFeedback).toBeNull();

    act(() => result.current.lab.advanceStep()); // assembly -> measurement
    act(() => result.current.lab.recordMeasurement());
    expect(result.current.lab.measurements[0].voltageV).toBeGreaterThan(0);
  });
});

describe("Guided workflow — намеренное КЗ, затем устранение (elec-advanced-short-circuit)", () => {
  it("студент создаёт короткое замыкание, система фиксирует его, затем требует безопасного восстановления перед finish", () => {
    const { result } = renderHook(() => useBridge(), { wrapper });

    act(() => result.current.lab.selectExperiment("elec-advanced-short-circuit"));
    act(() => result.current.lab.advanceStep());
    act(() => result.current.lab.advanceStep());
    act(() => result.current.lab.advanceStep()); // -> assembly

    // намеренное КЗ: провод напрямую через замкнутый переключатель
    act(() => {
      result.current.circuit.addConnection({ id: "short1", terminals: ["battery_pos", "switch_a"] });
      result.current.circuit.addConnection({ id: "short2", terminals: ["switch_b", "battery_neg"] });
    });
    const shorted = solveCircuit(result.current.circuit.state.components, result.current.circuit.state.connections);
    expect(shorted.isShortCircuit).toBe(true);
    expect(result.current.lab.isCurrentStepUnlocked).toBe(true); // assembly требует только isClosedLoop
    act(() => result.current.lab.advanceStep()); // assembly -> measurement

    expect(result.current.lab.isCurrentStepUnlocked).toBe(false); // shortCircuitObserved=true, но ещё 0 измерений
    act(() => result.current.lab.recordMeasurement());
    expect(result.current.lab.isCurrentStepUnlocked).toBe(true); // shortCircuitObserved=true и есть 1 измерение
    act(() => result.current.lab.advanceStep()); // measurement -> analysis

    expect(result.current.lab.isCurrentStepUnlocked).toBe(false); // цепь всё ещё замкнута накоротко

    // устраняет КЗ: убирает прямой мост, проводит цепь через нагрузку
    act(() => {
      result.current.circuit.removeConnection("short1");
      result.current.circuit.removeConnection("short2");
      wireCanonical(result.current.circuit);
    });
    const fixed = solveCircuit(result.current.circuit.state.components, result.current.circuit.state.connections);
    expect(fixed.isShortCircuit).toBe(false);
    expect(fixed.isCircuitActive).toBe(true);
    expect(result.current.lab.isCurrentStepUnlocked).toBe(true);

    act(() => result.current.lab.answerQuestion("q-short-circuit", 0));
    act(() => result.current.lab.advanceStep()); // analysis -> conclusion
    act(() => result.current.lab.setConclusionDraft("КЗ возникло из-за прямого провода в обход нагрузки; устранено повторной проводкой."));
    act(() => result.current.lab.advanceStep()); // conclusion -> finish

    expect(result.current.lab.currentStep?.kind).toBe("finish");
    expect(result.current.lab.isCurrentStepUnlocked).toBe(true);
    act(() => result.current.lab.completeExperiment());
    expect(result.current.lab.notebookEntries).toHaveLength(1);
    expect(result.current.lab.completedExperimentIds).toContain("elec-advanced-short-circuit");
  });
});

describe("Guided workflow — сценарий Restart: exit -> повторный выбор той же работы сбрасывает сессию", () => {
  it("измерения/шаг/черновики полностью сбрасываются, и работу можно пройти заново с нуля", () => {
    const { result } = renderHook(() => useBridge(), { wrapper });

    act(() => result.current.lab.selectExperiment("elec-beginner-measure-current"));
    act(() => result.current.lab.advanceStep()); // -> theory
    act(() => result.current.lab.recordHintUsed());
    act(() => wireCanonical(result.current.circuit));
    act(() => result.current.lab.recordMeasurement());
    expect(result.current.lab.currentStepIndex).toBe(1);
    expect(result.current.lab.measurements).toHaveLength(1);

    // студент выходит без завершения (например, сбросил цепь) и начинает заново
    act(() => result.current.lab.exitExperiment());
    expect(result.current.lab.selectedExperiment).toBeNull();

    act(() => result.current.lab.selectExperiment("elec-beginner-measure-current"));
    expect(result.current.lab.currentStepIndex).toBe(0); // шаг сброшен
    expect(result.current.lab.measurements).toHaveLength(0); // измерения сброшены
    expect(result.current.lab.observationsDraft).toBe("");
    expect(result.current.lab.conclusionDraft).toBe("");

    // цепь всё ещё собрана (реальное состояние ExperimentStateProvider не
    // трогалось перезапуском учебной сессии) -> можно пройти заново быстро
    act(() => result.current.lab.advanceStep());
    act(() => result.current.lab.advanceStep());
    act(() => result.current.lab.advanceStep()); // -> assembly, цепь уже собрана
    expect(result.current.lab.isCurrentStepUnlocked).toBe(true);
    act(() => result.current.lab.advanceStep()); // -> measurement
    act(() => result.current.lab.recordMeasurement());
    act(() => result.current.lab.advanceStep()); // -> analysis
    act(() => result.current.lab.advanceStep()); // -> conclusion
    act(() => result.current.lab.setConclusionDraft("Повторное прохождение: ток соответствует закону Ома."));
    act(() => result.current.lab.advanceStep()); // -> finish
    act(() => result.current.lab.completeExperiment());

    expect(result.current.lab.notebookEntries).toHaveLength(1); // только одна запись — из завершённой попытки
  });
});
