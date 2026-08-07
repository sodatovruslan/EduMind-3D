// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { cleanup, renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { ExperimentStateProvider, useExperimentState } from "./ExperimentStateProvider";
import { ElectricityLabExperienceProvider, useElectricityLabExperience } from "./ElectricityLabExperienceProvider";
import { solveCircuit, type CircuitComponent } from "@/lib/circuit-engine";
import { CANONICAL_WIRING } from "@/lib/electricity-lab-catalog";

/**
 * Stage S9.6 — Assessment & Teacher Analytics WORKFLOW tests. Distinct from
 * the single-state integration checks in
 * ElectricityAssessment.integration.test.tsx — these walk REALISTIC
 * multi-step student sessions end to end through the real
 * ExperimentStateProvider + real ElectricityLabExperienceProvider,
 * asserting on the final ElectricityNotebookEntry (evidence counters +
 * assessment report) exactly the way a completed attempt would look.
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

function advanceToStep(result: { current: { lab: ReturnType<typeof useElectricityLabExperience> } }, stepId: string) {
  let guard = 0;
  while (result.current.lab.currentStep?.id !== stepId && guard < 10) {
    act(() => result.current.lab.advanceStep());
    guard += 1;
  }
}

describe("Workflow — полное чистое прохождение производит финальный assessment/отчёт", () => {
  it("elec-intermediate-resistance-influence от выбора до completeExperiment без единой ошибки", () => {
    const { result } = renderHook(() => useBridge(), { wrapper });

    act(() => wireCanonical(result.current.circuit));
    act(() => result.current.lab.selectExperiment("elec-intermediate-resistance-influence"));
    advanceToStep(result, "measurement");

    act(() => result.current.circuit.updateComponent("resistor", { resistanceOhm: 20 }));
    act(() => result.current.lab.recordMeasurement());
    act(() => result.current.circuit.updateComponent("resistor", { resistanceOhm: 4 }));
    act(() => result.current.lab.recordMeasurement());

    advanceToStep(result, "analysis");
    act(() => result.current.lab.answerQuestion("q-resistance-influence", 0));
    advanceToStep(result, "conclusion");
    act(() => result.current.lab.setConclusionDraft("Ток уменьшился при росте сопротивления, как предсказывает закон Ома."));
    advanceToStep(result, "finish");
    act(() => result.current.lab.completeExperiment());

    const entry = result.current.lab.lastNotebookEntry!;
    expect(entry.assessment.overallScore).toBe(100);
    expect(entry.assessment.completion.score).toBe(100);
    expect(entry.assessment.accuracy.score).toBe(100);
    expect(result.current.lab.notebookEntries).toHaveLength(1);
    expect(result.current.lab.completedExperimentIds).toContain("elec-intermediate-resistance-influence");
  });
});

describe("Workflow — несколько реальных ошибок за одну сессию, все исправлены самостоятельно", () => {
  it("сначала неправильно подключённый амперметр, затем короткое замыкание — оба исправления учтены в итоговой записи", () => {
    const { result } = renderHook(() => useBridge(), { wrapper });

    act(() => result.current.lab.selectExperiment("elec-beginner-measure-current"));
    advanceToStep(result, "assembly");

    // ошибка №1: амперметр параллельно резистору
    act(() => {
      result.current.circuit.addConnection({ id: "c1", terminals: ["battery_pos", "switch_a"] });
      result.current.circuit.addConnection({ id: "c2", terminals: ["switch_b", "resistor_a"] });
      result.current.circuit.addConnection({ id: "c6", terminals: ["ammeter_a", "resistor_a"] });
      result.current.circuit.addConnection({ id: "c7", terminals: ["ammeter_b", "resistor_b"] });
    });
    expect(result.current.lab.isCurrentStepUnlocked).toBe(false);

    // студент замечает и полностью переподключает как надо
    act(() => {
      result.current.circuit.removeConnection("c6");
      result.current.circuit.removeConnection("c7");
      result.current.circuit.addConnection({ id: "c3", terminals: ["resistor_b", "ammeter_a"] });
      result.current.circuit.addConnection({ id: "c8", terminals: ["ammeter_b", "bulb_a"] });
      result.current.circuit.addConnection({ id: "c4", terminals: ["bulb_b", "fuse_a"] });
      result.current.circuit.addConnection({ id: "c5", terminals: ["fuse_b", "battery_neg"] });
    });
    expect(result.current.lab.isCurrentStepUnlocked).toBe(true);

    advanceToStep(result, "measurement");
    act(() => result.current.lab.recordMeasurement());
    advanceToStep(result, "conclusion");
    act(() => result.current.lab.setConclusionDraft("После исправления подключения ток стабильно течёт через амперметр."));
    advanceToStep(result, "finish");
    act(() => result.current.lab.completeExperiment());

    const entry = result.current.lab.lastNotebookEntry!;
    expect(entry.measurementErrorsCount).toBeGreaterThan(0);
    expect(entry.selfCorrectionsCount).toBeGreaterThan(0);
    expect(entry.assessment.overallScore).toBeLessThan(100);
    expect(entry.assessment.overallScore).toBeGreaterThan(0); // исправлено, а не провалено полностью
  });
});

describe("Workflow — использование подсказок штрафует только overallScore, не сами категории", () => {
  it("та же самая чистая сессия с 3 подсказками получает более низкий overallScore, чем без них", () => {
    function runCleanSession(useHints: boolean) {
      const { result } = renderHook(() => useBridge(), { wrapper });
      act(() => wireCanonical(result.current.circuit));
      act(() => result.current.lab.selectExperiment("elec-beginner-measure-current"));
      if (useHints) {
        act(() => result.current.lab.recordHintUsed());
        act(() => result.current.lab.recordHintUsed());
        act(() => result.current.lab.recordHintUsed());
      }
      advanceToStep(result, "measurement");
      act(() => result.current.lab.recordMeasurement());
      advanceToStep(result, "analysis");
      act(() => result.current.lab.answerQuestion("q-current-formula", 0));
      advanceToStep(result, "conclusion");
      act(() => result.current.lab.setConclusionDraft("Ток определяется законом Ома: I = U / R."));
      advanceToStep(result, "finish");
      act(() => result.current.lab.completeExperiment());
      return result.current.lab.lastNotebookEntry!;
    }

    const withoutHints = runCleanSession(false);
    const withHints = runCleanSession(true);

    expect(withoutHints.hintsUsed).toBe(0);
    expect(withHints.hintsUsed).toBe(3);
    expect(withHints.assessment.overallScore).toBeLessThan(withoutHints.assessment.overallScore);
    // категории сами по себе не штрафуются подсказками — только overallScore
    expect(withHints.assessment.completion.score).toBe(withoutHints.assessment.completion.score);
    expect(withHints.assessment.accuracy.score).toBe(withoutHints.assessment.accuracy.score);
  });
});

describe("Workflow — намеренное срабатывание защиты (перегорание предохранителя) всё равно учитывается как safety-инцидент", () => {
  it("elec-advanced-fuse-overload разрешает завершение (это цель работы), но assessment.safety честно ниже 100", () => {
    const { result } = renderHook(() => useBridge(), { wrapper });

    act(() => result.current.lab.selectExperiment("elec-advanced-fuse-overload"));
    advanceToStep(result, "assembly");
    act(() => wireCanonical(result.current.circuit));
    expect(result.current.lab.isCurrentStepUnlocked).toBe(true);

    advanceToStep(result, "measurement");
    // перегружаем предохранитель: высокое напряжение + низкое сопротивление
    act(() => {
      result.current.circuit.updateComponent("battery", { voltageV: 24 });
      result.current.circuit.updateComponent("resistor", { resistanceOhm: 0.5 });
    });
    const overloaded = solveCircuit(result.current.circuit.state.components, result.current.circuit.state.connections);
    expect(overloaded.fuseToBlowId).toBe("fuse");
    act(() => result.current.circuit.updateComponent("fuse", { isBlown: true })); // то же самое действие, что делает CircuitScene в реальной сцене

    advanceToStep(result, "analysis");
    act(() => result.current.lab.answerQuestion("q-fuse", 0));
    advanceToStep(result, "conclusion");
    act(() => result.current.lab.setConclusionDraft("Предохранитель перегорел, потому что ток превысил его номинал."));
    advanceToStep(result, "finish");
    expect(result.current.lab.currentStep?.kind).toBe("finish");
    expect(result.current.lab.isCurrentStepUnlocked).toBe(true); // fuse_blown разрешён именно для этой работы
    act(() => result.current.lab.completeExperiment());

    const entry = result.current.lab.lastNotebookEntry!;
    expect(entry.safetyIncidentsCount).toBeGreaterThan(0); // реально произошедший инцидент учтён, несмотря на разрешённый gating
    expect(entry.assessment.safety.score).toBeLessThan(100);
    expect(result.current.lab.completedExperimentIds).toContain("elec-advanced-fuse-overload"); // работа всё равно засчитана
  });
});
