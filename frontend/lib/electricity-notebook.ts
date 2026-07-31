/**
 * Electricity Lab — Measurement Notebook + Automatic Report (Stage E-2,
 * Tasks 3 & 6). Один и тот же объект служит и записью в Лабораторном
 * журнале (Task 3), и автоматическим отчётом (Task 6) — это не два
 * параллельных решения, а одна структура данных с двумя точками
 * отображения (ElectricityLabNotebookPanel = список, ElectricityLabReport
 * = детальный вид одной записи), чтобы не дублировать систему хранения.
 *
 * Всё содержимое строится ИСКЛЮЧИТЕЛЬНО из уже посчитанных данных:
 * измерения — из circuit-engine.ts (через snapshotMeasurement), ответы на
 * вопросы — из electricity-lab-catalog.ts (ScientificQuestion.correctIndex),
 * итоговый балл — детерминированная функция реальных счётчиков сессии.
 * Никаких случайных чисел, никакого обращения к AI для генерации отчёта.
 */
import type { LabDifficulty } from "./electricity-lab-catalog";

export interface ElectricityMeasurement {
  voltageV: number;
  currentA: number;
  resistanceOhm: number;
  powerW: number;
  at: number;
}

export interface QuestionResult {
  questionId: string;
  prompt: string;
  selectedIndex: number;
  correctIndex: number;
  correct: boolean;
}

export interface ElectricityNotebookEntry {
  id: string;
  experimentId: string;
  experimentTitle: string;
  difficulty: LabDifficulty;
  dateIso: string;
  objective: string;
  circuitUsed: { componentKinds: string[]; connectionsCount: number };
  measurements: ElectricityMeasurement[];
  questionResults: QuestionResult[];
  observations: string;
  conclusion: string;
  teacherNote: string;
  score: number; // 0..100, детерминированный расчёт (см. computeScore)
}

export interface ElectricityNotebookEntryInput {
  experimentId: string;
  experimentTitle: string;
  difficulty: LabDifficulty;
  objective: string;
  componentKinds: string[];
  connectionsCount: number;
  measurements: ElectricityMeasurement[];
  questionResults: QuestionResult[];
  observations: string;
  conclusion: string;
  hintsUsed: number;
  now?: () => number;
}

function clamp(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

// детерминированный балл: завершение (40, всегда — запись создаётся
// только по факту завершения), качество измерений (20 — минимум 3
// записи), правильность ответов на вопросы (30), качество вывода (10)
function computeScore(input: {
  measurementsCount: number;
  correctQuestions: number;
  totalQuestions: number;
  conclusionLength: number;
  hintsUsed: number;
}): number {
  const completionScore = 40;
  const measurementScore = Math.min(input.measurementsCount, 3) * (20 / 3);
  const questionScore = input.totalQuestions > 0 ? (input.correctQuestions / input.totalQuestions) * 30 : 30;
  let conclusionScore: number;
  if (input.conclusionLength === 0) conclusionScore = 0;
  else if (input.conclusionLength < 20) conclusionScore = 4;
  else if (input.conclusionLength < 60) conclusionScore = 7;
  else conclusionScore = 10;
  const hintPenalty = Math.min(input.hintsUsed * 3, 15);
  return clamp(completionScore + measurementScore + questionScore + conclusionScore - hintPenalty);
}

function buildTeacherNote(score: number, questionResults: QuestionResult[], measurementsCount: number): string {
  const wrongQuestions = questionResults.filter((q) => !q.correct);
  const parts: string[] = [];
  if (score >= 85) parts.push("Отличная работа: эксперимент выполнен точно, все шаги подтверждены реальными данными.");
  else if (score >= 60) parts.push("Хорошая работа, но есть над чем поработать.");
  else parts.push("Эксперимент завершён, но стоит повторить материал внимательнее.");

  if (measurementsCount < 2) parts.push("Рекомендуется делать больше измерений для более надёжных выводов.");
  if (wrongQuestions.length > 0) {
    parts.push(`Обрати внимание на вопрос: «${wrongQuestions[0].prompt}» — ответ был неверным.`);
  }
  return parts.join(" ");
}

export function buildElectricityNotebookEntry(input: ElectricityNotebookEntryInput): ElectricityNotebookEntry {
  const now = input.now ? input.now() : Date.now();
  const correctQuestions = input.questionResults.filter((q) => q.correct).length;
  const score = computeScore({
    measurementsCount: input.measurements.length,
    correctQuestions,
    totalQuestions: input.questionResults.length,
    conclusionLength: input.conclusion.trim().length,
    hintsUsed: input.hintsUsed,
  });

  return {
    id: `${input.experimentId}-${now}`,
    experimentId: input.experimentId,
    experimentTitle: input.experimentTitle,
    difficulty: input.difficulty,
    dateIso: new Date(now).toISOString(),
    objective: input.objective,
    circuitUsed: { componentKinds: input.componentKinds, connectionsCount: input.connectionsCount },
    measurements: input.measurements,
    questionResults: input.questionResults,
    observations: input.observations,
    conclusion: input.conclusion,
    teacherNote: buildTeacherNote(score, input.questionResults, input.measurements.length),
    score,
  };
}

export function sortElectricityNotebookEntriesByDateDesc(entries: ElectricityNotebookEntry[]): ElectricityNotebookEntry[] {
  return [...entries].sort((a, b) => new Date(b.dateIso).getTime() - new Date(a.dateIso).getTime());
}

export function bestElectricityScoreForExperiment(entries: ElectricityNotebookEntry[], experimentId: string): number | null {
  const relevant = entries.filter((e) => e.experimentId === experimentId);
  if (relevant.length === 0) return null;
  return Math.max(...relevant.map((e) => e.score));
}

export function electricityAttemptsForExperiment(entries: ElectricityNotebookEntry[], experimentId: string): number {
  return entries.filter((e) => e.experimentId === experimentId).length;
}
