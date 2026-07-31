import { describe, expect, it } from "vitest";
import { solveCircuit, type CircuitComponent, type Connection } from "./circuit-engine";
import { TASKS, TaskStatus, validateTask } from "./task-engine";
import { buildAIContext } from "./ai-context-builder";
import { getElectricityLabExperiment } from "./electricity-lab-catalog";

function baseComponents(overrides?: Partial<Record<string, unknown>>): CircuitComponent[] {
  return [
    { id: "battery", kind: "battery", terminals: ["battery_pos", "battery_neg"], voltageV: 12 },
    { id: "resistor", kind: "resistor", terminals: ["resistor_a", "resistor_b"], resistanceOhm: 4 },
    { id: "bulb", kind: "bulb", terminals: ["bulb_a", "bulb_b"], resistanceOhm: 2, ratedPowerW: 18 },
    { id: "switch", kind: "switch", terminals: ["switch_a", "switch_b"], isClosed: (overrides?.switchClosed as boolean) ?? true },
    { id: "ammeter", kind: "ammeter", terminals: ["ammeter_a", "ammeter_b"] },
    { id: "fuse", kind: "fuse", terminals: ["fuse_a", "fuse_b"], ratedCurrentA: 5, isBlown: (overrides?.fuseBlown as boolean) ?? false },
    { id: "voltmeter", kind: "voltmeter", terminals: ["voltmeter_a", "voltmeter_b"] },
  ];
}

describe("ai-context-builder — buildAIContext", () => {
  it("reflects an open switch and zero current — never invents an error that isn't in validation.errors", () => {
    const components = baseComponents({ switchClosed: false });
    const connections: Connection[] = [
      { id: "c1", terminals: ["battery_pos", "switch_a"] },
      { id: "c2", terminals: ["switch_b", "bulb_a"] },
      { id: "c3", terminals: ["bulb_b", "battery_neg"] },
    ];
    const solution = solveCircuit(components, connections);
    const task = TASKS[0];
    const validation = validateTask(task, { components, connections, solution });

    const ctx = buildAIContext({ task, taskStatus: TaskStatus.IN_PROGRESS, xp: 0, components, connections, solution, validation });

    expect(ctx.physics.switchState).toBe("OPEN");
    expect(ctx.physics.currentA).toBe(0);
    expect(ctx.physics.lampState).toBe("OFF");
    expect(ctx.validation.completed).toBe(false);
    expect(ctx.validation.errors.some((e) => e.code === "switch_open")).toBe(true);
    // ошибок ровно столько, сколько реально вернул Task Validator — не больше
    expect(ctx.validation.errors).toEqual(validation.errors.map((e) => ({ code: e.code, message: e.message })));
  });

  it("reports completed=true and lampState ON for a real closed active loop", () => {
    const components = baseComponents();
    const connections: Connection[] = [
      { id: "c1", terminals: ["battery_pos", "switch_a"] },
      { id: "c2", terminals: ["switch_b", "bulb_a"] },
      { id: "c3", terminals: ["bulb_b", "battery_neg"] },
    ];
    const solution = solveCircuit(components, connections);
    const task = TASKS[0];
    const validation = validateTask(task, { components, connections, solution });

    const ctx = buildAIContext({ task, taskStatus: TaskStatus.COMPLETED, xp: 10, components, connections, solution, validation });

    expect(ctx.validation.completed).toBe(true);
    expect(ctx.validation.errors).toHaveLength(0);
    expect(ctx.physics.lampState).toBe("ON");
    expect(ctx.physics.currentA).toBeGreaterThan(0);
    expect(ctx.xp).toBe(10);
  });

  it("serializes connections/components in a stable shape for the backend prompt", () => {
    const components = baseComponents();
    const connections: Connection[] = [{ id: "c1", terminals: ["battery_pos", "switch_a"] }];
    const solution = solveCircuit(components, connections);
    const task = TASKS[0];
    const validation = validateTask(task, { components, connections, solution });

    const ctx = buildAIContext({ task, taskStatus: TaskStatus.IN_PROGRESS, xp: 0, components, connections, solution, validation });

    expect(ctx.connections).toEqual([{ from: "battery_pos", to: "switch_a" }]);
    expect(ctx.components.find((c) => c.id === "battery")).toEqual({ id: "battery", kind: "battery" });
  });

  it("labExperience is null when no lab experiment is active (backward compatible with Stage 3)", () => {
    const components = baseComponents();
    const connections: Connection[] = [];
    const solution = solveCircuit(components, connections);
    const task = TASKS[0];
    const validation = validateTask(task, { components, connections, solution });

    const ctx = buildAIContext({ task, taskStatus: TaskStatus.NOT_STARTED, xp: 0, components, connections, solution, validation });

    expect(ctx.labExperience).toBeNull();
  });

  it("labExperience reflects the real selected experiment/step/measurement count, never invented", () => {
    const components = baseComponents();
    const connections: Connection[] = [];
    const solution = solveCircuit(components, connections);
    const task = TASKS[0];
    const validation = validateTask(task, { components, connections, solution });
    const experiment = getElectricityLabExperiment("elec-beginner-measure-current")!;
    const step = experiment.steps[0];

    const ctx = buildAIContext({
      task,
      taskStatus: TaskStatus.NOT_STARTED,
      xp: 0,
      components,
      connections,
      solution,
      validation,
      labExperiment: experiment,
      labStep: step,
      labStepUnlocked: true,
      labMeasurementsRecorded: 2,
      labCompletedExperimentIds: ["elec-beginner-measure-current"],
    });

    expect(ctx.labExperience).toEqual({
      currentExperiment: { id: experiment.id, title: experiment.title, difficulty: experiment.difficulty, goal: experiment.goal },
      currentStep: { kind: step.kind, instruction: step.instruction, unlocked: true },
      measurementsRecorded: 2,
      completedExperimentIds: ["elec-beginner-measure-current"],
    });
  });
});
