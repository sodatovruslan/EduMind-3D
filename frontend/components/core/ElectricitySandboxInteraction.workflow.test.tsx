// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import * as THREE from "three";
import { ExperimentStateProvider, useExperimentState } from "./ExperimentStateProvider";
import { WireDragProvider, useWireDrag } from "./WireDragProvider";
import { ElectricityLabExperienceProvider, useElectricityLabExperience } from "./ElectricityLabExperienceProvider";
import { solveCircuit, type CircuitComponent } from "@/lib/circuit-engine";
import { electricityAutosaveEngine } from "@/lib/electricity-autosave-engine";

/**
 * Stage S9.8 — Sandbox UX WORKFLOW test. A full realistic session driven
 * through the REAL interaction layer (WireDragProvider gestures + the same
 * click-to-remove action WireTube uses), not raw addConnection() calls:
 * build a circuit, make a wiring mistake, correct it, break a wire,
 * reconnect it, reset, and continue normally to a full guided-experiment
 * completion — proving the S9.8 interaction-layer audit findings didn't
 * regress anything built in S9.1-S9.7.
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

const SIMULATION_ID = "sim-electricity-sandbox-ux-workflow";

const INITIAL_COMPONENTS: CircuitComponent[] = [
  { id: "battery", kind: "battery", terminals: ["battery_pos", "battery_neg"], voltageV: 12 },
  { id: "switch", kind: "switch", terminals: ["switch_a", "switch_b"], isClosed: true },
  { id: "resistor", kind: "resistor", terminals: ["resistor_a", "resistor_b"], resistanceOhm: 4 },
  { id: "bulb", kind: "bulb", terminals: ["bulb_a", "bulb_b"], resistanceOhm: 2, ratedPowerW: 18 },
  { id: "ammeter", kind: "ammeter", terminals: ["ammeter_a", "ammeter_b"] },
  { id: "fuse", kind: "fuse", terminals: ["fuse_a", "fuse_b"], ratedCurrentA: 5, isBlown: false },
  { id: "voltmeter", kind: "voltmeter", terminals: ["voltmeter_a", "voltmeter_b"] },
];

const POS: Record<string, [number, number, number]> = {
  battery_pos: [-3.6, 0, 0],
  battery_neg: [-2.8, 0, 0],
  switch_a: [1.5, 0, 0],
  switch_b: [2.3, 0, 0],
  resistor_a: [-1.5, 0.4, 0],
  resistor_b: [-1.5, -0.4, 0],
  bulb_a: [0, 0.4, 0],
  bulb_b: [0, -0.4, 0],
  ammeter_a: [-0.6, 0, 0],
  ammeter_b: [-0.2, 0, 0],
  fuse_a: [0.6, 0, 0],
  fuse_b: [1.0, 0, 0],
  voltmeter_a: [-1.9, 0.5, 0],
  voltmeter_b: [-1.1, 0.5, 0],
};

function Bridge({ children }: { children: ReactNode }) {
  const { state } = useExperimentState();
  const solution = solveCircuit(state.components, state.connections);
  return (
    <ElectricityLabExperienceProvider simulationId={SIMULATION_ID} stepContext={{ components: state.components, connections: state.connections, solution }}>
      {children}
    </ElectricityLabExperienceProvider>
  );
}

function WireDragProviderBridge({ children }: { children: ReactNode }) {
  const { addConnection } = useExperimentState();
  return (
    <WireDragProvider onConnect={(fromId, toId) => addConnection({ id: `${fromId}-${toId}-${Date.now()}-${Math.random()}`, terminals: [fromId, toId] })}>
      {children}
    </WireDragProvider>
  );
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <ExperimentStateProvider initialComponents={INITIAL_COMPONENTS}>
      <WireDragProviderBridge>
        <Bridge>{children}</Bridge>
      </WireDragProviderBridge>
    </ExperimentStateProvider>
  );
}

function useBridge() {
  return { circuit: useExperimentState(), wire: useWireDrag(), lab: useElectricityLabExperience() };
}

function dragWire(wire: ReturnType<typeof useWireDrag>, fromId: string, toId: string) {
  wire.registerTerminalPosition(fromId, new THREE.Vector3(...POS[fromId]));
  wire.registerTerminalPosition(toId, new THREE.Vector3(...POS[toId]));
  wire.startDrag(fromId);
  wire.updatePendingPoint(new THREE.Vector3(...POS[toId]));
  wire.commitDrag(toId);
}

// находит id соединения по паре терминалов — то же самое, что делает
// пользователь: он видит именно ЭТОТ провод и кликает по нему
function connectionIdBetween(connections: { id: string; terminals: [string, string] }[], a: string, b: string): string {
  const c = connections.find(
    (c) => (c.terminals[0] === a && c.terminals[1] === b) || (c.terminals[0] === b && c.terminals[1] === a)
  );
  if (!c) throw new Error(`no connection between ${a} and ${b}`);
  return c.id;
}

function advanceToStep(result: { current: { lab: ReturnType<typeof useElectricityLabExperience> } }, stepId: string) {
  let guard = 0;
  while (result.current.lab.currentStep?.id !== stepId && guard < 10) {
    act(() => result.current.lab.advanceStep());
    guard += 1;
  }
}

describe("Sandbox UX workflow — собрать цепь, ошибиться, исправить, разорвать провод, переподключить, сбросить, продолжить как обычно", () => {
  it("полный реалистичный сеанс через реальный интерактивный слой (drag-жесты + клик-разрыв), не напрямую через addConnection", () => {
    const { result } = renderHook(() => useBridge(), { wrapper });

    // 1. Собираем базовую цепь (без амперметра пока)
    act(() => {
      dragWire(result.current.wire, "battery_pos", "switch_a");
      dragWire(result.current.wire, "switch_b", "resistor_a");
      dragWire(result.current.wire, "resistor_b", "bulb_a");
      dragWire(result.current.wire, "bulb_b", "fuse_a");
      dragWire(result.current.wire, "fuse_b", "battery_neg");
    });
    expect(result.current.circuit.state.connections).toHaveLength(5);
    expect(solveCircuit(result.current.circuit.state.components, result.current.circuit.state.connections).isCircuitActive).toBe(true);

    // 2. Ошибка подключения: студент выбирает работу "Измерение тока" и
    // тянет амперметр параллельно резистору вместо разрыва в проводе
    act(() => result.current.lab.selectExperiment("elec-beginner-measure-current"));
    act(() => {
      dragWire(result.current.wire, "ammeter_a", "resistor_a");
      dragWire(result.current.wire, "ammeter_b", "resistor_b");
    });
    advanceToStep(result, "assembly");
    expect(result.current.lab.isCurrentStepUnlocked).toBe(false);
    expect(result.current.lab.currentStepFeedback).toMatch(/шунтирует/);

    // 3. Исправление: разрываем провода-шунты кликом (та же реальная
    // операция, что делает WireTube.onClick) и подключаем амперметр
    // последовательно, разорвав провод резистор->лампа
    act(() => {
      const shunt1 = connectionIdBetween(result.current.circuit.state.connections, "ammeter_a", "resistor_a");
      const shunt2 = connectionIdBetween(result.current.circuit.state.connections, "ammeter_b", "resistor_b");
      result.current.circuit.removeConnection(shunt1);
      result.current.circuit.removeConnection(shunt2);
    });
    act(() => {
      const resistorToBulb = connectionIdBetween(result.current.circuit.state.connections, "resistor_b", "bulb_a");
      result.current.circuit.removeConnection(resistorToBulb); // 4. разрываем провод, чтобы вставить амперметр в разрыв
    });
    act(() => {
      dragWire(result.current.wire, "resistor_b", "ammeter_a"); // 5. переподключаем через амперметр
      dragWire(result.current.wire, "ammeter_b", "bulb_a");
    });
    expect(result.current.lab.isCurrentStepUnlocked).toBe(true);
    expect(result.current.lab.currentStepFeedback).toBeNull();

    advanceToStep(result, "measurement");
    act(() => result.current.lab.recordMeasurement());
    advanceToStep(result, "analysis");
    act(() => result.current.lab.answerQuestion("q-current-formula", 0));
    advanceToStep(result, "conclusion");
    act(() => result.current.lab.setConclusionDraft("Ток определяется законом Ома: I = U / R."));
    advanceToStep(result, "finish");

    // 6. Студент передумал и жмёт полный "Сбросить" ПОСЛЕ сборки, до
    // завершения работы — ожидаемо теряет прогресс собранной схемы (это
    // явное, осознанное действие пользователя, не баг)
    act(() => {
      result.current.circuit.resetExperiment(INITIAL_COMPONENTS);
      result.current.lab.resetLabSession();
    });
    expect(result.current.circuit.state.connections).toEqual([]);
    expect(result.current.lab.selectedExperiment).toBeNull();

    // 7. Продолжает как обычно: собирает цепь заново и доводит работу до конца
    act(() => result.current.lab.selectExperiment("elec-beginner-measure-current"));
    act(() => {
      dragWire(result.current.wire, "battery_pos", "switch_a");
      dragWire(result.current.wire, "switch_b", "resistor_a");
      dragWire(result.current.wire, "resistor_b", "ammeter_a");
      dragWire(result.current.wire, "ammeter_b", "bulb_a");
      dragWire(result.current.wire, "bulb_b", "fuse_a");
      dragWire(result.current.wire, "fuse_b", "battery_neg");
    });
    advanceToStep(result, "measurement");
    act(() => result.current.lab.recordMeasurement());
    advanceToStep(result, "analysis");
    act(() => result.current.lab.answerQuestion("q-current-formula", 0));
    advanceToStep(result, "conclusion");
    act(() => result.current.lab.setConclusionDraft("Ток определяется законом Ома: I = U / R."));
    advanceToStep(result, "finish");
    act(() => result.current.lab.completeExperiment());

    expect(result.current.lab.notebookEntries).toHaveLength(1);
    expect(result.current.lab.completedExperimentIds).toContain("elec-beginner-measure-current");
  });
});
