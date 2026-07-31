import type { CircuitComponent, CircuitSolution, Connection } from "@/lib/circuit-engine";
import type { TaskDefinition, TaskStatus, TaskValidationResult } from "@/lib/task-engine";
import type { ElectricityLabExperiment, ElectricityLabStep } from "@/lib/electricity-lab-catalog";

/**
 * AI Context Builder (Stage 3, расширено в Stage E-2) — единственное
 * место, где состояние лаборатории превращается в объект, отправляемый
 * AI Teacher. Чистая функция: только читает уже посчитанные Physics/
 * Circuit Engine (CircuitSolution) и Task Validator (TaskValidationResult)
 * — сама ничего не считает и не решает, выполнено ли задание.
 *
 * Stage E-2 (Guided Laboratory Experience): поле `labExperience`
 * опционально, как и в Chemistry World — buildAIContext без него
 * работает ровно как раньше (labExperience будет null). AI Teacher
 * получает ТОЛЬКО уже посчитанное состояние учебного слоя (какая
 * лабораторная работа выбрана, какой шаг сейчас, разблокирован ли он,
 * сколько измерений сделано) — сам ничего не решает про прогресс.
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
  labExperience: LabExperienceAIContext | null;
}

export interface LabExperienceAIContext {
  currentExperiment: { id: string; title: string; difficulty: string; goal: string } | null;
  currentStep: { kind: string; instruction: string; unlocked: boolean } | null;
  measurementsRecorded: number;
  completedExperimentIds: string[];
}

function buildLabExperienceAIContext(
  experiment: ElectricityLabExperiment | null,
  step: ElectricityLabStep | null,
  stepUnlocked: boolean,
  measurementsRecorded: number,
  completedExperimentIds: string[]
): LabExperienceAIContext {
  return {
    currentExperiment: experiment ? { id: experiment.id, title: experiment.title, difficulty: experiment.difficulty, goal: experiment.goal } : null,
    currentStep: step ? { kind: step.kind, instruction: step.instruction, unlocked: stepUnlocked } : null,
    measurementsRecorded,
    completedExperimentIds,
  };
}

export function buildAIContext(params: {
  task: TaskDefinition;
  taskStatus: TaskStatus;
  xp: number;
  components: CircuitComponent[];
  connections: Connection[];
  solution: CircuitSolution;
  validation: TaskValidationResult;
  labExperiment?: ElectricityLabExperiment | null;
  labStep?: ElectricityLabStep | null;
  labStepUnlocked?: boolean;
  labMeasurementsRecorded?: number;
  labCompletedExperimentIds?: string[];
}): LabAIContext {
  const {
    task,
    taskStatus,
    xp,
    components,
    connections,
    solution,
    validation,
    labExperiment,
    labStep,
    labStepUnlocked,
    labMeasurementsRecorded,
    labCompletedExperimentIds,
  } = params;

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
    labExperience: labExperiment
      ? buildLabExperienceAIContext(
          labExperiment,
          labStep ?? null,
          labStepUnlocked ?? false,
          labMeasurementsRecorded ?? 0,
          labCompletedExperimentIds ?? []
        )
      : null,
  };
}
