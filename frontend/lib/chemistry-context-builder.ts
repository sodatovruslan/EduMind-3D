/**
 * Chemistry World — Chemistry Context Builder (Stage 5). Полностью
 * аналогично Physics AI Context Builder (ai-context-builder.ts) для
 * Electricity Lab: чистая функция, собирает единый JSON-объект состояния
 * лаборатории из уже посчитанных Chemistry Engine + Reaction Engine +
 * Experiment Validator + Safety System. AI Teacher использует ТОЛЬКО этот
 * JSON — сам ничего не считает и не решает, безопасен ли эксперимент.
 */
import { aggregateStateOf, computeColorHex, totalMassG, totalVolumeMl, type AggregateState, type Container } from "./chemistry-engine";
import { getRegisteredReactions } from "./reaction-engine";
import type { ExperimentDefinition, ExperimentStatus, ExperimentValidationResult } from "./experiment-validator";
import type { SafetyWarning } from "./chemistry-safety";
import type { AccidentLogEntry, HazardResult } from "./hazard-engine";

export interface ChemistrySubstanceInfo {
  id: string;
  amountG: number;
  dissolved: boolean; // false — вещество в осадке, не растворено
}

export interface ChemistryReactionInfo {
  id: string;
  description: string;
  occurred: boolean;
}

export interface ChemistryAIContext {
  currentExperiment: { id: string; title: string; difficulty: string } | null;
  experimentStatus: ExperimentStatus;
  temperature: number;
  substances: ChemistrySubstanceInfo[];
  reactions: ChemistryReactionInfo[];
  validation: {
    completed: boolean;
    errors: { code: string; message: string }[];
    warnings: string[];
    measurements: Record<string, number | boolean | string>;
  };
  laboratoryState: {
    containerId: string;
    totalMassG: number;
    totalVolumeMl: number;
    colorHex: string;
    aggregateState: AggregateState;
  };
  safetyWarnings: SafetyWarning[];
  // Stage 5.5 v2 — Hazard Simulation: опционально, чтобы не ломать
  // существующих вызывающих (buildChemistryAIContext без hazard работает
  // ровно как раньше — hazard будет null). AI Teacher получает ТОЛЬКО эти
  // уже посчитанные детерминированные причины, сам физику не определяет.
  hazard: ChemistryHazardAIContext | null;
}

export interface ChemistryHazardAIContext {
  level: HazardResult["level"];
  causes: { code: string; message: string }[];
  temperatureC: number;
  pressureKPa: number;
  gasAmountG: number;
  pressureRatio: number;
  temperatureRatio: number;
  containerIntegrityLevel: string;
  isSealed: boolean;
  hasHeatSource: boolean;
  shouldStopExperiment: boolean;
  // последние несколько записей истории аварий этого эксперимента —
  // обрезано, чтобы не раздувать промпт AI Teacher бесконечно растущей историей
  recentAccidentLog: { at: number; level: string; event: string }[];
}

function buildHazardAIContext(hazard: HazardResult, accidentLog: AccidentLogEntry[]): ChemistryHazardAIContext {
  return {
    level: hazard.level,
    causes: hazard.causes.map((c) => ({ code: c.code, message: c.message })),
    temperatureC: hazard.temperatureC,
    pressureKPa: hazard.pressureKPa,
    gasAmountG: hazard.gasAmountG,
    pressureRatio: hazard.pressureRatio,
    temperatureRatio: hazard.temperatureRatio,
    containerIntegrityLevel: hazard.containerIntegrity.level,
    isSealed: hazard.explanationContext.isSealed,
    hasHeatSource: hazard.explanationContext.hasHeatSource,
    shouldStopExperiment: hazard.shouldStopExperiment,
    recentAccidentLog: accidentLog.slice(-10).map((e) => ({ at: e.at, level: e.level, event: e.event })),
  };
}

export function buildChemistryAIContext(params: {
  experiment: ExperimentDefinition;
  experimentStatus: ExperimentStatus;
  container: Container;
  occurredReactionIds: string[];
  validation: ExperimentValidationResult;
  safetyWarnings: SafetyWarning[];
  hazard?: HazardResult | null;
  accidentLog?: AccidentLogEntry[];
}): ChemistryAIContext {
  const { experiment, experimentStatus, container, occurredReactionIds, validation, safetyWarnings, hazard, accidentLog } = params;

  const substances: ChemistrySubstanceInfo[] = [
    ...container.contents.map((c) => ({ id: c.substanceId, amountG: c.grams, dissolved: true })),
    ...container.precipitate.map((c) => ({ id: c.substanceId, amountG: c.grams, dissolved: false })),
  ];

  const reactions: ChemistryReactionInfo[] = getRegisteredReactions().map((r) => ({
    id: r.id,
    description: r.description,
    occurred: occurredReactionIds.includes(r.id),
  }));

  return {
    currentExperiment: { id: experiment.id, title: experiment.title, difficulty: experiment.difficulty },
    experimentStatus,
    temperature: container.temperatureC,
    substances,
    reactions,
    validation: {
      completed: validation.completed,
      errors: validation.errors.map((e) => ({ code: e.code, message: e.message })),
      warnings: validation.warnings,
      measurements: validation.measurements,
    },
    laboratoryState: {
      containerId: container.id,
      totalMassG: totalMassG(container),
      totalVolumeMl: totalVolumeMl(container),
      colorHex: computeColorHex(container),
      aggregateState: aggregateStateOf(container),
    },
    safetyWarnings,
    hazard: hazard ? buildHazardAIContext(hazard, accidentLog ?? []) : null,
  };
}
