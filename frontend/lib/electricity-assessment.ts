/**
 * Electricity Lab — Deterministic Assessment Engine (Stage S9.6).
 *
 * Тот же дух, что и Chemistry World's ЖИВОЙ (реально вызываемый в
 * production) `assessExperiment` из chemistry-assessment.ts: чистая
 * функция от уже посчитанных агрегатов реальной сессии (evidence summary +
 * результаты вопросов), никакого LLM/рандома в формуле баллов. Chemistry
 * World's ВТОРОЙ движок (`computeDeterministicAssessment`,
 * evidenceEventIds/critera-с-весами) сознательно НЕ копируется — по
 * результатам аудита он не используется нигде в самом Chemistry World
 * (мёртвый код), поэтому реплицировать его архитектуру для Electricity Lab
 * означало бы дублировать не production-паттерн, а неиспользуемый
 * прототип.
 */
import type { ElectricityEvidenceSummary } from "./electricity-evidence";
import type { QuestionResult } from "./electricity-notebook";

export interface ElectricityAssessmentCategoryScore {
  score: number;
  explanation: string;
}

export interface ElectricityAssessmentReport {
  completion: ElectricityAssessmentCategoryScore;
  accuracy: ElectricityAssessmentCategoryScore;
  safety: ElectricityAssessmentCategoryScore;
  circuitBuilding: ElectricityAssessmentCategoryScore;
  overallScore: number;
  summary: string;
}

export interface ElectricityAssessmentInput {
  isComplete: boolean;
  totalSteps: number;
  evidence: ElectricityEvidenceSummary;
  questionResults: QuestionResult[];
  durationMs: number | null;
}

const MISTAKE_PENALTY_PER_INCIDENT = 15;
const SELF_CORRECTION_BONUS_PER_INCIDENT = 5;
const SAFETY_PENALTY_PER_INCIDENT = 25;
const HINT_PENALTY_PER_HINT = 2;
const MAX_HINT_PENALTY = 10;

function clamp(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function assessElectricityExperiment(input: ElectricityAssessmentInput): ElectricityAssessmentReport {
  const { evidence, questionResults } = input;

  const completionScore = input.isComplete
    ? 100
    : Math.round((evidence.stepsCompletedCount / Math.max(1, input.totalSteps)) * 100);

  const totalQuestions = questionResults.length;
  const correctQuestions = questionResults.filter((q) => q.correct).length;
  const accuracyScore = totalQuestions > 0 ? Math.round((correctQuestions / totalQuestions) * 100) : 100;

  const safetyScore = clamp(100 - evidence.safetyIncidentsCount * SAFETY_PENALTY_PER_INCIDENT);

  const circuitBuildingScore = clamp(
    100 - evidence.mistakesCount * MISTAKE_PENALTY_PER_INCIDENT + evidence.selfCorrectionsCount * SELF_CORRECTION_BONUS_PER_INCIDENT
  );

  const hintPenalty = Math.min(evidence.hintsUsed * HINT_PENALTY_PER_HINT, MAX_HINT_PENALTY);
  const overallScore = clamp(
    (completionScore + accuracyScore + safetyScore + circuitBuildingScore) / 4 - hintPenalty
  );

  const summaryParts: string[] = [`Эксперимент оценён на ${overallScore}/100.`];
  if (evidence.safetyIncidentsCount > 0) {
    summaryParts.push(`Обнаружено нарушений безопасности: ${evidence.safetyIncidentsCount}.`);
  }
  if (evidence.mistakesCount > 0) {
    const corrected =
      evidence.selfCorrectionsCount > 0 ? `, из них исправлено самостоятельно: ${evidence.selfCorrectionsCount}` : "";
    summaryParts.push(`Ошибок в подключении: ${evidence.mistakesCount}${corrected}.`);
  }
  if (evidence.hintsUsed > 0) {
    summaryParts.push(`Использовано подсказок: ${evidence.hintsUsed}.`);
  }

  return {
    completion: { score: completionScore, explanation: "Завершение работы" },
    accuracy: { score: accuracyScore, explanation: "Точность ответов на научные вопросы" },
    safety: { score: safetyScore, explanation: "Безопасное поведение (короткое замыкание, обход предохранителя, опасное измерение)" },
    circuitBuilding: { score: circuitBuildingScore, explanation: "Правильность сборки цепи и размещения приборов" },
    overallScore,
    summary: summaryParts.join(" "),
  };
}
