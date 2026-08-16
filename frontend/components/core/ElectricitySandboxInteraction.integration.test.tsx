// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import * as THREE from "three";
import { ExperimentStateProvider, useExperimentState } from "./ExperimentStateProvider";
import { WireDragProvider, useWireDrag } from "./WireDragProvider";
import { ElectricityLabExperienceProvider, useElectricityLabExperience } from "./ElectricityLabExperienceProvider";
import { solveCircuit, type CircuitComponent } from "@/lib/circuit-engine";
import { checkElectricalSafety } from "@/lib/electricity-safety";
import { electricityAutosaveEngine, loadElectricitySave } from "@/lib/electricity-autosave-engine";

/**
 * Stage S9.8 — Sandbox UX INTEGRATION tests. Wires connections through the
 * REAL interaction layer (WireDragProvider's startDrag/updatePendingPoint/
 * commitDrag — the exact sequence a pointer drag produces) instead of
 * calling circuit.addConnection() directly like every prior stage's tests
 * did — proving the interaction layer feeds the real solver/safety/
 * autosave pipeline correctly end to end, not just that the pipeline works
 * when fed by hand.
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

const SIMULATION_ID = "sim-electricity-sandbox-ux-it";

const INITIAL_COMPONENTS: CircuitComponent[] = [
  { id: "battery", kind: "battery", terminals: ["battery_pos", "battery_neg"], voltageV: 12 },
  { id: "switch", kind: "switch", terminals: ["switch_a", "switch_b"], isClosed: true },
  { id: "resistor", kind: "resistor", terminals: ["resistor_a", "resistor_b"], resistanceOhm: 4 },
  { id: "bulb", kind: "bulb", terminals: ["bulb_a", "bulb_b"], resistanceOhm: 2, ratedPowerW: 18 },
  { id: "ammeter", kind: "ammeter", terminals: ["ammeter_a", "ammeter_b"] },
  { id: "fuse", kind: "fuse", terminals: ["fuse_a", "fuse_b"], ratedCurrentA: 5, isBlown: false },
  { id: "voltmeter", kind: "voltmeter", terminals: ["voltmeter_a", "voltmeter_b"] },
];

// та же раскладка терминалов, что и в реальной 3D-сцене — только координаты
// не важны для физики, важен только факт "какой терминал где" для реестра
// WireDragProvider
const TERMINAL_POSITIONS: Record<string, [number, number, number]> = {
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

function wrapper({ children }: { children: ReactNode }) {
  return (
    <ExperimentStateProvider initialComponents={INITIAL_COMPONENTS}>
      <WireDragProviderBridge>
        <Bridge>{children}</Bridge>
      </WireDragProviderBridge>
    </ExperimentStateProvider>
  );
}

// та же связка, что ElectricityLabScene.tsx устанавливает между
// WireDragProvider.onConnect и ExperimentStateProvider.addConnection
function WireDragProviderBridge({ children }: { children: ReactNode }) {
  const { addConnection } = useExperimentState();
  return (
    <WireDragProvider onConnect={(fromId, toId) => addConnection({ id: `${fromId}-${toId}-${Date.now()}`, terminals: [fromId, toId] })}>
      {children}
    </WireDragProvider>
  );
}

function useBridge() {
  return { circuit: useExperimentState(), wire: useWireDrag(), lab: useElectricityLabExperience() };
}

// эмулирует РЕАЛЬНЫЙ жест: pointerDown на терминале A (startDrag),
// pointerMove по поверхности стенда (updatePendingPoint), pointerUp на
// терминале B (commitDrag) — ровно та последовательность, что производят
// ConnectionPoint.tsx/WireDragSurface в настоящей сцене
function dragWire(wire: ReturnType<typeof useWireDrag>, fromId: string, toId: string) {
  wire.registerTerminalPosition(fromId, new THREE.Vector3(...TERMINAL_POSITIONS[fromId]));
  wire.registerTerminalPosition(toId, new THREE.Vector3(...TERMINAL_POSITIONS[toId]));
  wire.startDrag(fromId);
  wire.updatePendingPoint(new THREE.Vector3(...TERMINAL_POSITIONS[toId]));
  wire.commitDrag(toId);
}

describe("Sandbox UX integration — контракт блокировки камеры во время протяжки провода", () => {
  it("draggingFrom истинно ровно между startDrag и commit/cancel — это и есть значение, которым ElectricityCanvas гасит OrbitControls (orbitEnabled={!draggingFrom})", () => {
    const { result } = renderHook(() => useBridge(), { wrapper });

    expect(result.current.wire.draggingFrom).toBeNull(); // камера разблокирована по умолчанию
    act(() => result.current.wire.registerTerminalPosition("battery_pos", new THREE.Vector3(...TERMINAL_POSITIONS.battery_pos)));
    act(() => result.current.wire.startDrag("battery_pos"));
    expect(result.current.wire.draggingFrom).not.toBeNull(); // камера должна быть заблокирована

    act(() => result.current.wire.cancelDrag());
    expect(result.current.wire.draggingFrom).toBeNull(); // камера обязана разблокироваться обратно
  });
});

describe("Sandbox UX integration — отмена протяжки провода не меняет реальную схему", () => {
  it("Escape во время драга не создаёт соединение и не портит уже собранную часть цепи", () => {
    const { result } = renderHook(() => useBridge(), { wrapper });

    act(() => dragWire(result.current.wire, "battery_pos", "switch_a"));
    expect(result.current.circuit.state.connections).toHaveLength(1);

    act(() => result.current.wire.registerTerminalPosition("switch_b", new THREE.Vector3(...TERMINAL_POSITIONS.switch_b)));
    act(() => result.current.wire.startDrag("switch_b"));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(result.current.wire.draggingFrom).toBeNull();
    expect(result.current.circuit.state.connections).toHaveLength(1); // отменённый жест не добавил вторую
  });
});

describe("Sandbox UX integration — сброс цепи безопасен даже во время активной протяжки провода", () => {
  it("после resetExperiment мид-драга можно завершить (или отменить) жест без ошибок — терминалы стенда фиксированы, их позиции не зависят от значений компонентов", () => {
    const { result } = renderHook(() => useBridge(), { wrapper });

    act(() => {
      result.current.wire.registerTerminalPosition("battery_pos", new THREE.Vector3(...TERMINAL_POSITIONS.battery_pos));
      result.current.wire.registerTerminalPosition("switch_a", new THREE.Vector3(...TERMINAL_POSITIONS.switch_a));
    });
    act(() => result.current.wire.startDrag("battery_pos"));

    // студент жмёт "Сбросить" прямо во время протяжки провода
    act(() => result.current.circuit.resetExperiment(INITIAL_COMPONENTS));
    expect(result.current.circuit.state.connections).toEqual([]);

    // жест всё ещё в процессе (сброс его не трогает) — завершение всё равно
    // корректно добавляет ОДНО новое соединение в уже пустой список
    act(() => result.current.wire.commitDrag("switch_a"));
    expect(result.current.circuit.state.connections).toHaveLength(1);
    expect(result.current.wire.draggingFrom).toBeNull();
  });
});

describe("Sandbox UX integration — небезопасная проводка, собранная РЕАЛЬНЫМ жестом, распознаётся S9.4 системой безопасности", () => {
  it("короткое замыкание, созданное через drag battery_pos -> battery_neg, флагуется checkElectricalSafety без дублирования логики", () => {
    const { result } = renderHook(() => useBridge(), { wrapper });

    act(() => dragWire(result.current.wire, "battery_pos", "battery_neg"));

    const solution = solveCircuit(result.current.circuit.state.components, result.current.circuit.state.connections);
    const warnings = checkElectricalSafety({
      components: result.current.circuit.state.components,
      connections: result.current.circuit.state.connections,
      solution,
    });
    expect(solution.isShortCircuit).toBe(true);
    expect(warnings.some((w) => w.code === "short_circuit" && w.severity === "danger")).toBe(true);
  });
});

describe("Sandbox UX integration — автосохранение реагирует на соединения, сделанные через реальный drag-жест", () => {
  it("wiring через WireDragProvider отмечает сессию грязной и попадает в localStorage ровно так же, как прямой addConnection", () => {
    const { result } = renderHook(() => useBridge(), { wrapper });

    act(() => result.current.lab.selectExperiment("elec-beginner-measure-current"));
    act(() => dragWire(result.current.wire, "battery_pos", "switch_a"));

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    const saved = loadElectricitySave(SIMULATION_ID);
    expect(saved).not.toBeNull();
    expect(saved!.circuit.connections).toHaveLength(1);
  });
});
