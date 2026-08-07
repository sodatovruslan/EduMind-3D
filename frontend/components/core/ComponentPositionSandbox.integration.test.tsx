// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import * as THREE from "three";
import { ExperimentStateProvider, useExperimentState } from "./ExperimentStateProvider";
import { ComponentDragProvider, useComponentDrag } from "./ComponentDragProvider";
import { solveCircuit, type CircuitComponent } from "@/lib/circuit-engine";
import { electricityAutosaveEngine, loadElectricitySave } from "@/lib/electricity-autosave-engine";

/**
 * Post-S9.9 acceptance fix — component repositioning INTEGRATION tests.
 * Real ExperimentStateProvider + real ComponentDragProvider, no mocks.
 *
 * Honest scope note: terminal world-position "follows the component" and
 * live wire-geometry updates are a property of the React Three Fiber scene
 * graph (a terminal is a child node of the component's group, so it
 * inherits the parent's transform for free) plus ConnectionPoint.tsx's
 * per-frame re-registration while a drag is active — neither is
 * exercisable without a real WebGL canvas, which this project's test
 * suite has never rendered (consistent with every prior S9 stage). What
 * IS tested here, at the real domain-state level, is the actual thing
 * that makes that mechanism correct: that a component's `position` field
 * is real, persisted circuit state, reachable through the same
 * ExperimentStateProvider action every other real interaction uses.
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

const SIMULATION_ID = "sim-electricity-component-position-it";

const INITIAL_COMPONENTS: CircuitComponent[] = [
  { id: "battery", kind: "battery", terminals: ["battery_pos", "battery_neg"], voltageV: 12 },
  { id: "switch", kind: "switch", terminals: ["switch_a", "switch_b"], isClosed: true },
  { id: "resistor", kind: "resistor", terminals: ["resistor_a", "resistor_b"], resistanceOhm: 4 },
  { id: "bulb", kind: "bulb", terminals: ["bulb_a", "bulb_b"], resistanceOhm: 2, ratedPowerW: 18 },
  { id: "ammeter", kind: "ammeter", terminals: ["ammeter_a", "ammeter_b"] },
  { id: "fuse", kind: "fuse", terminals: ["fuse_a", "fuse_b"], ratedCurrentA: 5, isBlown: false },
  { id: "voltmeter", kind: "voltmeter", terminals: ["voltmeter_a", "voltmeter_b"] },
];

function ComponentDragBridge({ children }: { children: ReactNode }) {
  const { updateComponent } = useExperimentState();
  return (
    <ComponentDragProvider onMove={(id, position) => updateComponent(id, { position })}>{children}</ComponentDragProvider>
  );
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <ExperimentStateProvider initialComponents={INITIAL_COMPONENTS}>
      <ComponentDragBridge>{children}</ComponentDragBridge>
    </ExperimentStateProvider>
  );
}

function useBridge() {
  return { circuit: useExperimentState(), drag: useComponentDrag() };
}

function dragComponentTo(drag: ReturnType<typeof useComponentDrag>, id: string, from: [number, number, number], to: [number, number, number]) {
  drag.startDrag(id, from);
  drag.updatePreviewPosition(new THREE.Vector3(to[0], to[1], to[2]));
  drag.commitDrag();
}

describe("Sandbox — переместить батарею", () => {
  it("committed position компонента реально обновляется в домене через ту же ExperimentStateProvider, что и любое другое действие", () => {
    const { result } = renderHook(() => useBridge(), { wrapper });

    act(() => dragComponentTo(result.current.drag, "battery", [-3.2, 0.28, 0], [1.5, 0.28, -2]));

    const battery = result.current.circuit.state.components.find((c) => c.id === "battery");
    expect(battery?.position).toEqual([1.5, 0.28, -2]);
  });
});

describe("Sandbox — переместить измерительный прибор (амперметр)", () => {
  it("работает одинаково для любого компонента, не только батареи", () => {
    const { result } = renderHook(() => useBridge(), { wrapper });

    act(() => dragComponentTo(result.current.drag, "ammeter", [3.2, 0.28, -0.45], [-2, 0.28, 2.5]));

    const ammeter = result.current.circuit.state.components.find((c) => c.id === "ammeter");
    expect(ammeter?.position).toEqual([-2, 0.28, 2.5]);
    // остальные компоненты не затронуты перемещением одного
    expect(result.current.circuit.state.components.find((c) => c.id === "battery")?.position).toBeUndefined();
  });
});

describe("Sandbox — блокировка камеры во время перемещения компонента (тот же контракт, что и у wire-drag)", () => {
  it("draggingComponentId истинно ровно между startDrag и commit/cancel — этим значением ElectricityCanvas гасит OrbitControls", () => {
    const { result } = renderHook(() => useBridge(), { wrapper });

    expect(result.current.drag.draggingComponentId).toBeNull();
    act(() => result.current.drag.startDrag("battery", [-3.2, 0.28, 0]));
    expect(result.current.drag.draggingComponentId).toBe("battery");
    act(() => result.current.drag.commitDrag());
    expect(result.current.drag.draggingComponentId).toBeNull();
  });
});

describe("Sandbox — восстановление после отпускания вне объекта/канваса", () => {
  it("отпускание в любом месте (window pointerup) корректно завершает перемещение, не оставляя состояние зависшим", () => {
    const { result } = renderHook(() => useBridge(), { wrapper });

    act(() => result.current.drag.startDrag("fuse", [1.4, 0.28, -1.6]));
    act(() => result.current.drag.updatePreviewPosition(new THREE.Vector3(0, 0, 0)));
    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup"));
    });

    expect(result.current.drag.draggingComponentId).toBeNull();
    expect(result.current.circuit.state.components.find((c) => c.id === "fuse")?.position).toEqual([0, 0.28, 0]);
  });
});

describe("Sandbox — солвер остаётся корректным после перемещения и повторного подключения", () => {
  it("position — чисто косметическое поле; реальная физика (Ом/КЗ/предохранитель) не зависит от него", () => {
    const { result } = renderHook(() => useBridge(), { wrapper });

    act(() => dragComponentTo(result.current.drag, "battery", [-3.2, 0.28, 0], [4, 0.28, 4]));
    act(() => dragComponentTo(result.current.drag, "resistor", [-1.5, 0.28, 0], [-4, 0.28, -1]));

    act(() => {
      result.current.circuit.addConnection({ id: "c1", terminals: ["battery_pos", "switch_a"] });
      result.current.circuit.addConnection({ id: "c2", terminals: ["switch_b", "resistor_a"] });
      result.current.circuit.addConnection({ id: "c3", terminals: ["resistor_b", "bulb_a"] });
      result.current.circuit.addConnection({ id: "c4", terminals: ["bulb_b", "fuse_a"] });
      result.current.circuit.addConnection({ id: "c5", terminals: ["fuse_b", "battery_neg"] });
    });

    const solution = solveCircuit(result.current.circuit.state.components, result.current.circuit.state.connections);
    expect(solution.isCircuitActive).toBe(true);
    expect(solution.currentA).toBeCloseTo(2, 3); // 12V / (4Ω+2Ω) — идентично сценарию без перемещений
  });
});

describe("Sandbox — автосохранение позиции компонента", () => {
  it("перемещённая позиция реально попадает в localStorage-снимок S9.7 без изменения его схемы", () => {
    electricityAutosaveEngine.init(
      `electricity-save-${SIMULATION_ID}`,
      SIMULATION_ID,
      1,
      () => ({
        components: [{ id: "battery", kind: "battery", terminals: ["battery_pos", "battery_neg"], voltageV: 12, position: [4, 0.28, 4] }],
        connections: [],
        experimentId: "elec-beginner-measure-current",
        currentStepIndex: 0,
        completedStepIds: [],
        taskStatus: "in_progress",
        startedAt: new Date(0).toISOString(),
        hintsUsed: 0,
        measurements: [],
        questionAnswers: {},
        observationsDraft: "",
        conclusionDraft: "",
        evidenceEvents: [],
        sessionObservations: {
          minVoltageV: 0, maxVoltageV: 0, minResistanceOhm: 0, maxResistanceOhm: 0, maxCurrentA: 0, maxBulbBrightness: 0,
          fuseBlownObserved: false, openCircuitObserved: false, shortCircuitObserved: false,
        },
      })
    );
    electricityAutosaveEngine.markDirty();
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    const saved = loadElectricitySave(SIMULATION_ID);
    expect(saved).not.toBeNull();
    expect(saved!.circuit.components.find((c) => c.id === "battery")?.position).toEqual([4, 0.28, 4]);
  });
});

describe("Sandbox — reload/resume восстанавливает позицию компонента", () => {
  it("resetExperiment с сохранённым снимком включает позиции обратно в реальное состояние (тот же путь, что resumeSave использует внутри)", () => {
    const { result } = renderHook(() => useBridge(), { wrapper });

    act(() => dragComponentTo(result.current.drag, "voltmeter", [-1.5, 1.05, 0.9], [2.2, 1.05, -2.2]));
    const movedComponents = result.current.circuit.state.components;
    expect(movedComponents.find((c) => c.id === "voltmeter")?.position).toEqual([2.2, 1.05, -2.2]);

    // симулируем "перезагрузку страницы + resume": новое дерево
    // провайдеров гидратируется напрямую из уже сохранённого массива
    // components (ровно то, что делает resumeSave() -> resetExperiment())
    cleanup();
    const second = renderHook(() => useBridge(), { wrapper });
    act(() => second.result.current.circuit.resetExperiment(movedComponents));

    expect(second.result.current.circuit.state.components.find((c) => c.id === "voltmeter")?.position).toEqual([2.2, 1.05, -2.2]);
  });
});
