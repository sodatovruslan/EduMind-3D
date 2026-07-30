/**
 * Chemistry World — Laboratory Notebook (Stage 5.6). Чистая функция сборки
 * записи журнала из уже посчитанных реальных данных сессии — ничего не
 * придумывает и не пересчитывает химию. Хранение записей (localStorage)
 * реализовано в ChemistryLabExperienceProvider.tsx — этот файл только
 * описывает форму записи и то, как она детерминированно строится.
 */
import type { HazardLevel } from "./hazard-engine";
import type { AssessmentReport } from "./chemistry-assessment";
import type { LabDifficulty } from "./chemistry-lab-catalog";

export interface NotebookEntry {
  id: string; // уникальный id записи (experimentId + timestamp)
  experimentId: string;
  experimentTitle: string;
  difficulty: LabDifficulty;
  dateIso: string;
  studentActions: string[]; // человекочитаемый лог реальных действий (не выдуманный)
  reactionHistory: { reactionId: string; title: string; at: number }[];
  maxTemperatureC: number;
  maxPressureKPa: number;
  hazardsEncountered: HazardLevel[];
  safetyWarnings: string[];
  observedResults: string[]; // из expectedObservations эксперимента, помеченные как реально подтвержденные
  studentConclusion: string;
  aiFeedback: string | null;
  assessment: AssessmentReport;
}

export interface NotebookEntryInput {
  experimentId: string;
  experimentTitle: string;
  difficulty: LabDifficulty;
  studentActions: string[];
  reactionHistory: { reactionId: string; title: string; at: number }[];
  maxTemperatureC: number;
  maxPressureKPa: number;
  hazardsEncountered: HazardLevel[];
  safetyWarnings: string[];
  observedResults: string[];
  studentConclusion: string;
  aiFeedback: string | null;
  assessment: AssessmentReport;
  now?: () => number;
}

// детерминированная сборка записи — единственная "недетерминированная"
// часть (текущее время) вынесена в опциональный параметр `now`, чтобы
// это оставалось тестируемым без побочных эффектов
export function buildNotebookEntry(input: NotebookEntryInput): NotebookEntry {
  const now = input.now ? input.now() : Date.now();
  return {
    id: `${input.experimentId}-${now}`,
    experimentId: input.experimentId,
    experimentTitle: input.experimentTitle,
    difficulty: input.difficulty,
    dateIso: new Date(now).toISOString(),
    studentActions: input.studentActions,
    reactionHistory: input.reactionHistory,
    maxTemperatureC: input.maxTemperatureC,
    maxPressureKPa: input.maxPressureKPa,
    hazardsEncountered: input.hazardsEncountered,
    safetyWarnings: input.safetyWarnings,
    observedResults: input.observedResults,
    studentConclusion: input.studentConclusion,
    aiFeedback: input.aiFeedback,
    assessment: input.assessment,
  };
}

export function sortNotebookEntriesByDateDesc(entries: NotebookEntry[]): NotebookEntry[] {
  return [...entries].sort((a, b) => new Date(b.dateIso).getTime() - new Date(a.dateIso).getTime());
}

export function bestScoreForExperiment(entries: NotebookEntry[], experimentId: string): number | null {
  const relevant = entries.filter((e) => e.experimentId === experimentId);
  if (relevant.length === 0) return null;
  return Math.max(...relevant.map((e) => e.assessment.overallScore));
}

export function attemptsForExperiment(entries: NotebookEntry[], experimentId: string): number {
  return entries.filter((e) => e.experimentId === experimentId).length;
}
