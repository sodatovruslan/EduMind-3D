/**
 * Chemistry World — Experiment Assessment (Stage 5.6). Детерминированное
 * учебное оценивание — НИКАКИХ случайных оценок. Каждая категория считается
 * по реальным числам сессии (сколько шагов пройдено, сколько раз ученик
 * пробовал, какие реальные предупреждения Safety System/Hazard Engine
 * встретились, сколько раз спрашивал AI-подсказку, насколько подробный
 * вывод написал). Это НЕ пересчитывает химию — только интерпретирует уже
 * готовые факты сессии в баллы 0..100.
 */
import type { HazardLevel } from "./hazard-engine";
import type { LearningMode } from "./chemistry-lab-modes";

// уровни опасности, которые реально означают "что-то пошло не по плану" —
// само перечисление берется из уже существующего HazardLevel (hazard-engine.ts),
// здесь только классифицируется, какие из них считаются "опасными" для
// оценки безопасности
const DANGEROUS_HAZARD_LEVELS: HazardLevel[] = [
  "pressure_buildup",
  "flash",
  "fire",
  "container_stress",
  "container_damage",
  "container_rupture",
  "explosion",
];

export interface AssessmentInput {
  totalSteps: number;
  stepsCompleted: number;
  attempts: number; // реальное число действий ученика (добавление/переливание/нагрев) за сессию эксперимента
  hintsUsed: number; // реальное число сообщений AI-преподавателю за сессию эксперимента
  safetyWarningCodesEncountered: string[]; // реальные коды из checkSafety(), встретившиеся хотя бы раз
  hazardLevelsEncountered: HazardLevel[]; // реальные уровни Hazard Engine, встретившиеся хотя бы раз
  isComplete: boolean;
  conclusionText: string; // вывод ученика в Лабораторном журнале
  mode: LearningMode;
}

export interface AssessmentCategoryScore {
  score: number; // 0..100, всегда целое
  explanation: string;
}

export interface AssessmentReport {
  correctProcedure: AssessmentCategoryScore;
  safety: AssessmentCategoryScore;
  understanding: AssessmentCategoryScore;
  observationQuality: AssessmentCategoryScore;
  completion: AssessmentCategoryScore;
  overallScore: number;
  summary: string;
}

function clamp(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function assessCompletion(input: AssessmentInput): AssessmentCategoryScore {
  if (input.isComplete) {
    return { score: 100, explanation: "Эксперимент полностью завершён — все условия подтверждены реальным состоянием симулятора." };
  }
  const ratio = input.totalSteps > 0 ? input.stepsCompleted / input.totalSteps : 0;
  return {
    score: clamp(ratio * 100),
    explanation: `Пройдено ${input.stepsCompleted} из ${input.totalSteps} шагов — эксперимент не завершён полностью.`,
  };
}

function assessCorrectProcedure(input: AssessmentInput): AssessmentCategoryScore {
  // "идеальное" число действий — примерно по одному на шаг; каждое
  // действие сверх этого (лишние попытки/исправления) снижает балл —
  // реальный счетчик attempts, не выдуманный
  const expectedActions = Math.max(1, input.totalSteps - 3); // минус информационные шаги (goal/safety/explain/finish не требуют действия)
  const extraActions = Math.max(0, input.attempts - expectedActions);
  const score = clamp(100 - extraActions * 8);
  return {
    score,
    explanation:
      extraActions > 0
        ? `Потребовалось на ${extraActions} действий больше ожидаемого — процедура была не полностью оптимальной.`
        : "Процедура выполнена без лишних действий.",
  };
}

function assessSafety(input: AssessmentInput): AssessmentCategoryScore {
  const dangerousEncountered = input.hazardLevelsEncountered.filter((level) => DANGEROUS_HAZARD_LEVELS.includes(level));
  const penalty = input.safetyWarningCodesEncountered.length * 10 + dangerousEncountered.length * 20;
  const score = clamp(100 - penalty);
  const parts: string[] = [];
  if (input.safetyWarningCodesEncountered.length > 0) {
    parts.push(`${input.safetyWarningCodesEncountered.length} предупреждение(й) Safety System`);
  }
  if (dangerousEncountered.length > 0) {
    parts.push(`опасные уровни: ${dangerousEncountered.join(", ")}`);
  }
  return {
    score,
    explanation: parts.length > 0 ? `Зафиксировано: ${parts.join("; ")}.` : "Ни одного реального предупреждения безопасности не зафиксировано.",
  };
}

function assessUnderstanding(input: AssessmentInput): AssessmentCategoryScore {
  const hintPenalty = input.hintsUsed * 8;
  const conclusionBonus = input.conclusionText.trim().length > 20 ? 10 : 0;
  const score = clamp(100 - hintPenalty + conclusionBonus);
  return {
    score,
    explanation:
      input.hintsUsed > 0
        ? `Использовано подсказок AI-преподавателя: ${input.hintsUsed}.`
        : "Эксперимент выполнен без обращения за подсказками.",
  };
}

function assessObservationQuality(input: AssessmentInput): AssessmentCategoryScore {
  const length = input.conclusionText.trim().length;
  let score: number;
  if (length === 0) score = 0;
  else if (length < 20) score = 30;
  else if (length < 60) score = 60;
  else if (length < 150) score = 85;
  else score = 100;
  return {
    score,
    explanation:
      length === 0
        ? "Вывод в Лабораторном журнале не записан."
        : `Записан вывод длиной ${length} символов.`,
  };
}

export function assessExperiment(input: AssessmentInput): AssessmentReport {
  const completion = assessCompletion(input);
  const correctProcedure = assessCorrectProcedure(input);
  const safety = assessSafety(input);
  const understanding = assessUnderstanding(input);
  const observationQuality = assessObservationQuality(input);

  const overallScore = clamp(
    (completion.score + correctProcedure.score + safety.score + understanding.score + observationQuality.score) / 5
  );

  const summary = `Итоговая оценка: ${overallScore}/100. Завершение: ${completion.score}, процедура: ${correctProcedure.score}, безопасность: ${safety.score}, понимание: ${understanding.score}, качество наблюдений: ${observationQuality.score}.`;

  return { correctProcedure, safety, understanding, observationQuality, completion, overallScore, summary };
}
