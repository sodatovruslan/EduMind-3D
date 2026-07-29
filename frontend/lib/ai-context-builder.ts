import type { CircuitComponent, CircuitSolution, Connection } from "@/lib/circuit-engine";
import type { TaskDefinition, TaskStatus, TaskValidationResult } from "@/lib/task-engine";

/**
 * AI Context Builder (Stage 3) — единственное место, где состояние
 * лаборатории превращается в объект, отправляемый AI Teacher. Чистая
 * функция: только читает уже посчитанные Physics/Circuit Engine
 * (CircuitSolution) и Task Validator (TaskValidationResult) — сама
 * ничего не считает и не решает, выполнено ли задание.
 */
export interface LabAIContext {
  currentTask: { id: string; title: string; difficulty: string } | null;
  taskStatus: TaskStatus;
  xp: number;
  physics: {
    currentA: number;
    voltageV: number;
    resistanceOhm: number;
    isCircuitActive: boolean;
    isShortCircuit: boolean;
    isClosedLoop: boolean;
    switchState: "OPEN" | "CLOSED";
    fuseState: "OK" | "BLOWN";
    lampState: "ON" | "OFF";
  };
  validation: {
    completed: boolean;
    errors: { code: string; message: string }[];
    warnings: string[];
    measurements: Record<string, number | boolean>;
  };
  connections: { from: string; to: string }[];
  components: { id: string; kind: string }[];
}

export function buildAIContext(params: {
  task: TaskDefinition;
  taskStatus: TaskStatus;
  xp: number;
  components: CircuitComponent[];
  connections: Connection[];
  solution: CircuitSolution;
  validation: TaskValidationResult;
}): LabAIContext {
  const { task, taskStatus, xp, components, connections, solution, validation } = params;

  const battery = components.find((c) => c.kind === "battery");
  const resistor = components.find((c) => c.kind === "resistor");
  const switchComponent = components.find((c) => c.kind === "switch");
  const fuse = components.find((c) => c.kind === "fuse");
  const bulb = components.find((c) => c.kind === "bulb");
  const bulbReading = bulb ? solution.readings[bulb.id] : undefined;

  return {
    currentTask: { id: task.id, title: task.title, difficulty: task.difficulty },
    taskStatus,
    xp,
    physics: {
      currentA: solution.currentA,
      voltageV: battery?.voltageV ?? 0,
      resistanceOhm: resistor?.resistanceOhm ?? 0,
      isCircuitActive: solution.isCircuitActive,
      isShortCircuit: solution.isShortCircuit,
      isClosedLoop: solution.isClosedLoop,
      switchState: switchComponent?.isClosed ? "CLOSED" : "OPEN",
      fuseState: fuse?.isBlown ? "BLOWN" : "OK",
      lampState: bulbReading && bulbReading.powerW > 0 ? "ON" : "OFF",
    },
    validation: {
      completed: validation.completed,
      errors: validation.errors.map((e) => ({ code: e.code, message: e.message })),
      warnings: validation.warnings,
      measurements: validation.measurements,
    },
    connections: connections.map((c) => ({ from: c.terminals[0], to: c.terminals[1] })),
    components: components.map((c) => ({ id: c.id, kind: c.kind })),
  };
}
