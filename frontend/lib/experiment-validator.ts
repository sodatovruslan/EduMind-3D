/**
 * Chemistry World — Experiment Validator (Stage 5). Тот же принцип, что и
 * Task Validator в Electricity Lab (task-engine.ts): проверяет состояние,
 * уже посчитанное Chemistry Engine + Reaction Engine, ничего не считает
 * само и ничего не выдумывает. Реализация не переиспользует код
 * task-engine.ts — отдельный модуль той же архитектурной философии.
 */
import type { Container } from "./chemistry-engine";
import { aggregateStateOf } from "./chemistry-engine";

export enum ExperimentStatus {
  NOT_STARTED = "not_started",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  FAILED = "failed",
}

export interface ExperimentError {
  code: string;
  message: string;
  critical?: boolean;
}

export interface ExperimentValidationResult {
  completed: boolean;
  errors: ExperimentError[];
  warnings: string[];
  measurements: Record<string, number | boolean | string>;
}

export interface LabState {
  container: Container;
  // id реакций, реально сработавших в этом контейнере (из
  // reaction-engine.ts applyReactions) — не пересчитывается здесь заново
  occurredReactionIds: string[];
}

export type ExperimentDifficulty = "easy" | "medium" | "hard";

export interface ExperimentDefinition {
  id: string;
  title: string;
  description: string;
  goal: string;
  successConditions: string[];
  failureConditions: string[];
  difficulty: ExperimentDifficulty;
  xpReward: number;
  validate: (state: LabState) => ExperimentValidationResult;
}

function gramsOf(list: { substanceId: string; grams: number }[], substanceId: string): number {
  return list.find((c) => c.substanceId === substanceId)?.grams ?? 0;
}

// ---- Experiment 1: растворение соли

function validateDissolution(state: LabState): ExperimentValidationResult {
  const { container } = state;
  const errors: ExperimentError[] = [];

  const waterG = gramsOf(container.contents, "water");
  const naclDissolvedG = gramsOf(container.contents, "nacl");
  const naclPrecipitateG = gramsOf(container.precipitate, "nacl");

  if (waterG <= 0) errors.push({ code: "no_water", message: "в сосуде нет воды" });
  if (naclDissolvedG <= 0 && naclPrecipitateG <= 0) errors.push({ code: "no_salt", message: "соль ещё не добавлена" });
  if (naclPrecipitateG > 1e-6) {
    errors.push({
      code: "salt_not_dissolved",
      message: "часть соли не растворилась — превышен предел растворимости, добавь больше воды",
    });
  }

  const completed = waterG > 0 && naclDissolvedG > 0 && naclPrecipitateG <= 1e-6;
  return { completed, errors, warnings: [], measurements: { waterG, naclDissolvedG } };
}

// ---- Experiment 2: нейтрализация HCl + NaOH

function validateNeutralization(state: LabState): ExperimentValidationResult {
  const { container, occurredReactionIds } = state;
  const errors: ExperimentError[] = [];
  const reacted = occurredReactionIds.includes("neutralization-hcl-naoh");

  const hasHcl = gramsOf(container.contents, "hcl") > 0;
  const hasNaoh = gramsOf(container.contents, "naoh") > 0;

  if (!reacted) {
    if (!hasHcl && !hasNaoh) {
      errors.push({ code: "missing_reagents", message: "добавь в сосуд соляную кислоту (HCl) и гидроксид натрия (NaOH)" });
    } else if (hasHcl && !hasNaoh) {
      errors.push({ code: "missing_base", message: "добавлена только кислота — нужен ещё гидроксид натрия (NaOH)" });
    } else if (hasNaoh && !hasHcl) {
      errors.push({ code: "missing_acid", message: "добавлена только щёлочь — нужна ещё соляная кислота (HCl)" });
    }
  }

  const naclFormedG = gramsOf(container.contents, "nacl");
  return {
    completed: reacted,
    errors,
    warnings: [],
    measurements: { naclFormedG, temperatureC: container.temperatureC },
  };
}

// ---- Experiment 3: осаждение (AgNO3 + NaCl -> AgCl)

function validatePrecipitation(state: LabState): ExperimentValidationResult {
  const { container, occurredReactionIds } = state;
  const errors: ExperimentError[] = [];
  const reacted = occurredReactionIds.includes("precipitation-agno3-nacl");
  const precipitateG = gramsOf(container.precipitate, "agcl");

  const hasAgno3 = gramsOf(container.contents, "agno3") > 0;
  const hasNacl = gramsOf(container.contents, "nacl") > 0;

  if (!reacted) {
    if (!hasAgno3 && !hasNacl) {
      errors.push({ code: "missing_reagents", message: "добавь нитрат серебра (AgNO₃) и раствор поваренной соли (NaCl)" });
    } else if (hasAgno3 && !hasNacl) {
      errors.push({ code: "missing_salt", message: "добавлен только нитрат серебра — нужен ещё раствор NaCl" });
    } else if (hasNacl && !hasAgno3) {
      errors.push({ code: "missing_silver", message: "добавлена только соль — нужен ещё нитрат серебра (AgNO₃)" });
    }
  }

  return { completed: reacted && precipitateG > 0, errors, warnings: [], measurements: { precipitateG } };
}

// ---- Experiment 4: нагрев воды до кипения

function validateHeatingWater(state: LabState): ExperimentValidationResult {
  const { container } = state;
  const errors: ExperimentError[] = [];
  const waterG = gramsOf(container.contents, "water");

  if (waterG <= 0) {
    errors.push({ code: "no_water", message: "добавь воду в сосуд перед нагревом" });
  } else if (container.temperatureC < 100) {
    errors.push({
      code: "not_hot_enough",
      message: `нужно довести воду до кипения (сейчас ${container.temperatureC.toFixed(0)}°C, нужно 100°C)`,
    });
  }

  const completed = waterG > 0 && container.temperatureC >= 100 && aggregateStateOf(container) === "gas";
  return { completed, errors, warnings: [], measurements: { temperatureC: container.temperatureC } };
}

export const EXPERIMENTS: ExperimentDefinition[] = [
  {
    id: "experiment-1-dissolve-salt",
    title: "Растворение соли",
    description: "Раствори поваренную соль (NaCl) в воде.",
    goal: "Вся добавленная соль должна раствориться, без осадка на дне.",
    successConditions: ["В сосуде есть вода", "Соль полностью растворена (нет осадка)"],
    failureConditions: ["Нет воды", "Соль не добавлена", "Превышен предел растворимости — есть осадок"],
    difficulty: "easy",
    xpReward: 10,
    validate: validateDissolution,
  },
  {
    id: "experiment-2-neutralization",
    title: "Нейтрализация",
    description: "Смешай соляную кислоту (HCl) и гидроксид натрия (NaOH) в одном сосуде.",
    goal: "Должна произойти реакция нейтрализации: HCl + NaOH → NaCl + H₂O.",
    successConditions: ["В сосуде одновременно есть HCl и NaOH", "Reaction Engine зафиксировал реакцию нейтрализации"],
    failureConditions: ["Добавлен только один из реагентов"],
    difficulty: "medium",
    xpReward: 15,
    validate: validateNeutralization,
  },
  {
    id: "experiment-3-precipitation",
    title: "Осаждение",
    description: "Смешай нитрат серебра (AgNO₃) и раствор поваренной соли (NaCl).",
    goal: "Должен образоваться белый осадок хлорида серебра (AgCl).",
    successConditions: ["В сосуде одновременно есть AgNO₃ и растворённый NaCl", "Reaction Engine зафиксировал осаждение AgCl"],
    failureConditions: ["Добавлен только один из реагентов"],
    difficulty: "medium",
    xpReward: 15,
    validate: validatePrecipitation,
  },
  {
    id: "experiment-4-heat-water",
    title: "Нагрев воды",
    description: "Нагрей воду в сосуде на горелке до кипения.",
    goal: "Температура воды должна достичь 100°C (переход в газообразное состояние).",
    successConditions: ["В сосуде есть вода", "Температура ≥ 100°C"],
    failureConditions: ["Нет воды", "Температура ниже 100°C"],
    difficulty: "easy",
    xpReward: 10,
    validate: validateHeatingWater,
  },
];

export function validateExperiment(experiment: ExperimentDefinition, state: LabState): ExperimentValidationResult {
  return experiment.validate(state);
}

export function deriveExperimentStatus(result: ExperimentValidationResult, hasStarted: boolean): ExperimentStatus {
  if (result.completed) return ExperimentStatus.COMPLETED;
  if (result.errors.some((e) => e.critical)) return ExperimentStatus.FAILED;
  return hasStarted ? ExperimentStatus.IN_PROGRESS : ExperimentStatus.NOT_STARTED;
}
