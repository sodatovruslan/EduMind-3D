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
}

export function buildChemistryAIContext(params: {
  experiment: ExperimentDefinition;
  experimentStatus: ExperimentStatus;
  container: Container;
  occurredReactionIds: string[];
  validation: ExperimentValidationResult;
  safetyWarnings: SafetyWarning[];
}): ChemistryAIContext {
  const { experiment, experimentStatus, container, occurredReactionIds, validation, safetyWarnings } = params;

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
  };
}
