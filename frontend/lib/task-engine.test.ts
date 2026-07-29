import { describe, expect, it } from "vitest";
import { solveCircuit, type CircuitComponent, type Connection } from "./circuit-engine";
import { TASKS, TaskStatus, deriveTaskStatus, validateTask, type CircuitState } from "./task-engine";

// те же id/терминалы, что и в реальной сцене (frontend/components/scenes/ElectricityLabScene.tsx
// INITIAL_COMPONENTS) — валидаторы заданий завязаны именно на них, как и сама сцена
function baseComponents(overrides?: Partial<Record<string, unknown>>): CircuitComponent[] {
  return [
    { id: "battery", kind: "battery", terminals: ["battery_pos", "battery_neg"], voltageV: (overrides?.voltageV as number) ?? 12 },
    { id: "resistor", kind: "resistor", terminals: ["resistor_a", "resistor_b"], resistanceOhm: (overrides?.resistorOhm as number) ?? 4 },
    { id: "bulb", kind: "bulb", terminals: ["bulb_a", "bulb_b"], resistanceOhm: 2, ratedPowerW: 18 },
    { id: "switch", kind: "switch", terminals: ["switch_a", "switch_b"], isClosed: (overrides?.switchClosed as boolean) ?? true },
    { id: "ammeter", kind: "ammeter", terminals: ["ammeter_a", "ammeter_b"] },
    { id: "fuse", kind: "fuse", terminals: ["fuse_a", "fuse_b"], ratedCurrentA: 5, isBlown: (overrides?.fuseBlown as boolean) ?? false },
    { id: "voltmeter", kind: "voltmeter", terminals: ["voltmeter_a", "voltmeter_b"] },
  ];
}

function makeState(components: CircuitComponent[], connections: Connection[]): CircuitState {
  return { components, connections, solution: solveCircuit(components, connections) };
}

function taskById(id: string) {
  const task = TASKS.find((t) => t.id === id);
  if (!task) throw new Error(`task ${id} not found`);
  return task;
}

describe("task-engine — Task 1: замкнуть цепь батарея+переключатель+лампа", () => {
  const task = taskById("task-1-close-loop");

  it("completes when battery, switch and bulb form a real closed active loop", () => {
    const components = baseComponents();
    const connections: Connection[] = [
      { id: "c1", terminals: ["battery_pos", "switch_a"] },
      { id: "c2", terminals: ["switch_b", "bulb_a"] },
      { id: "c3", terminals: ["bulb_b", "battery_neg"] },
    ];
    const result = validateTask(task, makeState(components, connections));
    expect(result.completed).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.measurements.currentA).toBeGreaterThan(0);
  });

  it("reports open_circuit when no wires connect anything", () => {
    const result = validateTask(task, makeState(baseComponents(), []));
    expect(result.completed).toBe(false);
    expect(result.errors.some((e) => e.code === "open_circuit")).toBe(true);
  });

  it("reports switch_open when the loop is closed but the switch is open", () => {
    const components = baseComponents({ switchClosed: false });
    const connections: Connection[] = [
      { id: "c1", terminals: ["battery_pos", "switch_a"] },
      { id: "c2", terminals: ["switch_b", "bulb_a"] },
      { id: "c3", terminals: ["bulb_b", "battery_neg"] },
    ];
    const result = validateTask(task, makeState(components, connections));
    expect(result.completed).toBe(false);
    expect(result.errors.some((e) => e.code === "switch_open")).toBe(true);
  });

  it("flags a direct short across the battery as a critical error", () => {
    const components = baseComponents();
    const connections: Connection[] = [{ id: "c1", terminals: ["battery_pos", "battery_neg"] }];
    const result = validateTask(task, makeState(components, connections));
    expect(result.completed).toBe(false);
    expect(result.errors.some((e) => e.code === "short_circuit" && e.critical)).toBe(true);
  });
});

describe("task-engine — Task 2: амперметр последовательно, не параллельно", () => {
  const task = taskById("task-2-ammeter-series");

  it("completes when the ammeter sits in series in the main loop", () => {
    const components = baseComponents();
    const connections: Connection[] = [
      { id: "c1", terminals: ["battery_pos", "switch_a"] },
      { id: "c2", terminals: ["switch_b", "bulb_a"] },
      { id: "c3", terminals: ["bulb_b", "ammeter_a"] },
      { id: "c4", terminals: ["ammeter_b", "battery_neg"] },
    ];
    const result = validateTask(task, makeState(components, connections));
    expect(result.completed).toBe(true);
    expect(result.measurements.currentA).toBeGreaterThan(0);
  });

  it("flags ammeter_parallel when it is wired across the same two nodes as the bulb", () => {
    const components = baseComponents();
    const connections: Connection[] = [
      { id: "c1", terminals: ["battery_pos", "switch_a"] },
      { id: "c2", terminals: ["switch_b", "bulb_a"] },
      { id: "c3", terminals: ["bulb_b", "battery_neg"] },
      // амперметр подключен своими выводами к тем же двум узлам, что и лампа — то есть в обход
      { id: "c4", terminals: ["ammeter_a", "bulb_a"] },
      { id: "c5", terminals: ["ammeter_b", "bulb_b"] },
    ];
    const result = validateTask(task, makeState(components, connections));
    expect(result.completed).toBe(false);
    expect(result.errors.some((e) => e.code === "ammeter_parallel")).toBe(true);
  });

  it("reports ammeter_missing when it has no wires at all", () => {
    const components = baseComponents();
    const connections: Connection[] = [
      { id: "c1", terminals: ["battery_pos", "switch_a"] },
      { id: "c2", terminals: ["switch_b", "bulb_a"] },
      { id: "c3", terminals: ["bulb_b", "battery_neg"] },
    ];
    const result = validateTask(task, makeState(components, connections));
    expect(result.completed).toBe(false);
    expect(result.errors.some((e) => e.code === "ammeter_missing")).toBe(true);
  });
});

describe("task-engine — Task 3: вольтметр параллельно нагрузке", () => {
  const task = taskById("task-3-voltmeter-parallel");

  it("completes when the voltmeter shares both nodes with the bulb", () => {
    const components = baseComponents();
    const connections: Connection[] = [
      { id: "c1", terminals: ["battery_pos", "switch_a"] },
      { id: "c2", terminals: ["switch_b", "bulb_a"] },
      { id: "c3", terminals: ["bulb_b", "battery_neg"] },
      { id: "c4", terminals: ["voltmeter_a", "bulb_a"] },
      { id: "c5", terminals: ["voltmeter_b", "bulb_b"] },
    ];
    const result = validateTask(task, makeState(components, connections));
    expect(result.completed).toBe(true);
  });

  it("fails when the voltmeter is not connected to the same node pair as any load", () => {
    const components = baseComponents();
    const connections: Connection[] = [
      { id: "c1", terminals: ["battery_pos", "switch_a"] },
      { id: "c2", terminals: ["switch_b", "bulb_a"] },
      { id: "c3", terminals: ["bulb_b", "battery_neg"] },
      { id: "c4", terminals: ["voltmeter_a", "switch_a"] },
      { id: "c5", terminals: ["voltmeter_b", "battery_neg"] },
    ];
    const result = validateTask(task, makeState(components, connections));
    expect(result.completed).toBe(false);
    expect(result.errors.some((e) => e.code === "voltmeter_not_parallel")).toBe(true);
  });
});

describe("task-engine — Task 4: подобрать ток 0.5 А", () => {
  const task = taskById("task-4-target-current");
  const loopConnections: Connection[] = [
    { id: "c1", terminals: ["battery_pos", "resistor_a"] },
    { id: "c2", terminals: ["resistor_b", "switch_a"] },
    { id: "c3", terminals: ["switch_b", "battery_neg"] },
  ];

  it("completes when the chosen voltage/resistance produce 0.5A within tolerance", () => {
    // I = V/R -> 0.5 = 10/20
    const components = baseComponents({ voltageV: 10, resistorOhm: 20 });
    const result = validateTask(task, makeState(components, loopConnections));
    expect(result.completed).toBe(true);
    expect(result.measurements.currentA).toBeCloseTo(0.5, 2);
  });

  it("reports current_out_of_range when current misses the target", () => {
    const components = baseComponents({ voltageV: 12, resistorOhm: 4 });
    const result = validateTask(task, makeState(components, loopConnections));
    expect(result.completed).toBe(false);
    expect(result.errors.some((e) => e.code === "current_out_of_range")).toBe(true);
  });
});

describe("task-engine — Task 5: найти обрыв цепи", () => {
  const task = taskById("task-5-find-break");

  it("fails with switch_open while the break has not been fixed", () => {
    const components = baseComponents({ switchClosed: false });
    const connections: Connection[] = [
      { id: "c1", terminals: ["battery_pos", "switch_a"] },
      { id: "c2", terminals: ["switch_b", "bulb_a"] },
      { id: "c3", terminals: ["bulb_b", "battery_neg"] },
    ];
    const result = validateTask(task, makeState(components, connections));
    expect(result.completed).toBe(false);
    expect(result.errors.some((e) => e.code === "switch_open")).toBe(true);
  });

  it("completes once the break is fixed and current actually flows", () => {
    const components = baseComponents({ switchClosed: true });
    const connections: Connection[] = [
      { id: "c1", terminals: ["battery_pos", "switch_a"] },
      { id: "c2", terminals: ["switch_b", "bulb_a"] },
      { id: "c3", terminals: ["bulb_b", "battery_neg"] },
    ];
    const result = validateTask(task, makeState(components, connections));
    expect(result.completed).toBe(true);
  });
});

describe("task-engine — Task 6: исправить короткое замыкание", () => {
  const task = taskById("task-6-fix-short");

  it("fails with a non-critical short_circuit error while the short is still present", () => {
    const components = baseComponents();
    const connections: Connection[] = [{ id: "c1", terminals: ["battery_pos", "battery_neg"] }];
    const result = validateTask(task, makeState(components, connections));
    expect(result.completed).toBe(false);
    const shortError = result.errors.find((e) => e.code === "short_circuit");
    expect(shortError).toBeDefined();
    expect(shortError?.critical).toBeFalsy();
  });

  it("completes once the short is removed and current flows through the load", () => {
    const components = baseComponents();
    const connections: Connection[] = [
      { id: "c1", terminals: ["battery_pos", "switch_a"] },
      { id: "c2", terminals: ["switch_b", "bulb_a"] },
      { id: "c3", terminals: ["bulb_b", "battery_neg"] },
    ];
    const result = validateTask(task, makeState(components, connections));
    expect(result.completed).toBe(true);
  });
});

describe("task-engine — deriveTaskStatus", () => {
  it("is NOT_STARTED before any interaction", () => {
    const result = validateTask(taskById("task-1-close-loop"), makeState(baseComponents(), []));
    expect(deriveTaskStatus(result, false)).toBe(TaskStatus.NOT_STARTED);
  });

  it("is IN_PROGRESS once wiring started but not finished", () => {
    const components = baseComponents();
    const connections: Connection[] = [{ id: "c1", terminals: ["battery_pos", "switch_a"] }];
    const result = validateTask(taskById("task-1-close-loop"), makeState(components, connections));
    expect(deriveTaskStatus(result, true)).toBe(TaskStatus.IN_PROGRESS);
  });

  it("is FAILED on a critical error (short circuit) regardless of hasStarted", () => {
    const components = baseComponents();
    const connections: Connection[] = [{ id: "c1", terminals: ["battery_pos", "battery_neg"] }];
    const result = validateTask(taskById("task-1-close-loop"), makeState(components, connections));
    expect(deriveTaskStatus(result, true)).toBe(TaskStatus.FAILED);
  });

  it("is COMPLETED when the validator reports completed", () => {
    const components = baseComponents();
    const connections: Connection[] = [
      { id: "c1", terminals: ["battery_pos", "switch_a"] },
      { id: "c2", terminals: ["switch_b", "bulb_a"] },
      { id: "c3", terminals: ["bulb_b", "battery_neg"] },
    ];
    const result = validateTask(taskById("task-1-close-loop"), makeState(components, connections));
    expect(deriveTaskStatus(result, true)).toBe(TaskStatus.COMPLETED);
  });
});
