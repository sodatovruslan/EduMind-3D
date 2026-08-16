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
import { assessElectricityExperiment, type ElectricityAssessmentReport } from "./electricity-assessment";
import { summarizeElectricityEvidence, type ElectricityEvidenceEvent, type ElectricityEvidenceSummary } from "./electricity-evidence";

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
  score: number; // 0..100, детерминированный расчёт (см. computeScore) — не тронут Stage S9.6, полная обратная совместимость
  // Stage S9.6 — Assessment & Teacher Analytics: реальные агрегаты из
  // Evidence Layer (electricity-evidence.ts), сохранённые на самой записи
  // (раньше hintsUsed использовался только для штрафа к score и терялся).
  hintsUsed: number;
  mistakesCount: number;
  safetyIncidentsCount: number;
  measurementErrorsCount: number;
  selfCorrectionsCount: number;
  durationMs: number | null;
  // детерминированная многокритериальная оценка (см. electricity-assessment.ts)
  // — тот же паттерн, что и Chemistry World's живой `assessExperiment`/
  // `NotebookEntry.assessment`, отдельно от `score` выше (обратная
  // совместимость: старые тесты/UI, читающие `score`, не тронуты)
  assessment: ElectricityAssessmentReport;
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
  // Stage S9.6 — необязательные, полностью аддитивные поля: старые вызовы
  // (существующие 5 тестов, вызовы без Evidence Layer) продолжают работать
  // без изменений — evidence по умолчанию пустой (все счётчики 0).
  evidenceEvents?: ElectricityEvidenceEvent[];
  totalSteps?: number;
  durationMs?: number | null;
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

// Stage S9.6 — дополнена (аддитивно) реальными данными Evidence Layer:
// безопасность/ошибки измерения/самостоятельные исправления. Прежнее
// поведение (общий комментарий по score + подсказка про измерения/неверный
// вопрос) не изменено ни на символ — только добавлены новые предложения.
function buildTeacherNote(
  score: number,
  questionResults: QuestionResult[],
  measurementsCount: number,
  evidence?: ElectricityEvidenceSummary
): string {
  const wrongQuestions = questionResults.filter((q) => !q.correct);
  const parts: string[] = [];
  if (score >= 85) parts.push("Отличная работа: эксперимент выполнен точно, все шаги подтверждены реальными данными.");
  else if (score >= 60) parts.push("Хорошая работа, но есть над чем поработать.");
  else parts.push("Эксперимент завершён, но стоит повторить материал внимательнее.");

  if (measurementsCount < 2) parts.push("Рекомендуется делать больше измерений для более надёжных выводов.");
  if (wrongQuestions.length > 0) {
    parts.push(`Обрати внимание на вопрос: «${wrongQuestions[0].prompt}» — ответ был неверным.`);
  }

  if (evidence) {
    if (evidence.safetyIncidentsCount > 0) {
      parts.push(
        `Во время работы было зафиксировано нарушений безопасности: ${evidence.safetyIncidentsCount} (короткое замыкание/обход предохранителя/опасное измерение) — обязательно повтори правила безопасной сборки цепи.`
      );
    }
    if (evidence.measurementErrorsCount > 0) {
      parts.push(
        `Приборы были подключены неправильно ${evidence.measurementErrorsCount} раз(а) — вспомни, что амперметр включается последовательно, а вольтметр параллельно.`
      );
    }
    if (evidence.selfCorrectionsCount > 0) {
      parts.push("Хорошо, что ошибки были исправлены самостоятельно — это ценный учебный результат.");
    }
    if (evidence.hintsUsed === 0 && evidence.mistakesCount === 0 && evidence.safetyIncidentsCount === 0) {
      parts.push("Работа выполнена без единой ошибки и без подсказок — уверенное владение материалом.");
    }
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

  // Stage S9.6: агрегат по реальным событиям Evidence Layer — пустой массив
  // (по умолчанию для старых вызовов) даёт все счётчики равными 0, что
  // сохраняет прежнее поведение score/teacherNote один в один.
  const evidence = summarizeElectricityEvidence(input.evidenceEvents ?? []);
  const durationMs = input.durationMs ?? null;
  // запись создаётся только по факту реального завершения (см. computeScore
  // выше — completionScore всегда 40 по той же причине), поэтому здесь
  // isComplete всегда true — оценка "завершения" в assessment честно
  // отражает это, а не выдумывает частичный прогресс
  const assessment = assessElectricityExperiment({
    isComplete: true,
    totalSteps: input.totalSteps ?? Math.max(1, evidence.stepsCompletedCount),
    evidence,
    questionResults: input.questionResults,
    durationMs,
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
    teacherNote: buildTeacherNote(score, input.questionResults, input.measurements.length, evidence),
    score,
    hintsUsed: input.hintsUsed,
    mistakesCount: evidence.mistakesCount,
    safetyIncidentsCount: evidence.safetyIncidentsCount,
    measurementErrorsCount: evidence.measurementErrorsCount,
    selfCorrectionsCount: evidence.selfCorrectionsCount,
    durationMs,
    assessment,
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
