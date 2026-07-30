import { describe, expect, it } from "vitest";
import { assessExperiment } from "./chemistry-assessment";
import {
  attemptsForExperiment,
  bestScoreForExperiment,
  buildNotebookEntry,
  sortNotebookEntriesByDateDesc,
  type NotebookEntry,
} from "./chemistry-notebook";

const baseAssessment = assessExperiment({
  totalSteps: 8,
  stepsCompleted: 8,
  attempts: 5,
  hintsUsed: 0,
  safetyWarningCodesEncountered: [],
  hazardLevelsEncountered: ["none"],
  isComplete: true,
  conclusionText: "Вода закипела при 100 градусах.",
  mode: "guided",
});

function makeEntry(overrides: Partial<Parameters<typeof buildNotebookEntry>[0]> = {}, now = 1000): NotebookEntry {
  return buildNotebookEntry({
    experimentId: "lab-beginner-heating-water",
    experimentTitle: "Нагрев воды",
    difficulty: "beginner",
    studentActions: ["Добавлена вода (200г)", "Горелка включена"],
    reactionHistory: [],
    maxTemperatureC: 105,
    maxPressureKPa: 101.3,
    hazardsEncountered: ["none", "heating", "boiling"],
    safetyWarnings: [],
    observedResults: ["Температура растёт, пока горелка включена"],
    studentConclusion: "Вода закипела при 100 градусах.",
    aiFeedback: null,
    assessment: baseAssessment,
    now: () => now,
    ...overrides,
  });
}

describe("chemistry-notebook — buildNotebookEntry (детерминированность)", () => {
  it("одинаковые входы (включая now) дают одинаковую запись", () => {
    const a = makeEntry();
    const b = makeEntry();
    expect(a).toEqual(b);
  });

  it("id и dateIso строятся из переданного времени, а не из системных часов", () => {
    const entry = makeEntry({}, 123456789);
    expect(entry.id).toBe("lab-beginner-heating-water-123456789");
    expect(entry.dateIso).toBe(new Date(123456789).toISOString());
  });

  it("сохраняет реальные данные сессии без изменений", () => {
    const entry = makeEntry();
    expect(entry.maxTemperatureC).toBe(105);
    expect(entry.hazardsEncountered).toEqual(["none", "heating", "boiling"]);
    expect(entry.assessment.overallScore).toBe(baseAssessment.overallScore);
  });
});

describe("chemistry-notebook — сортировка и агрегаты", () => {
  it("sortNotebookEntriesByDateDesc сортирует от новых к старым", () => {
    const older = makeEntry({}, 1000);
    const newer = makeEntry({}, 2000);
    const sorted = sortNotebookEntriesByDateDesc([older, newer]);
    expect(sorted[0]).toBe(newer);
    expect(sorted[1]).toBe(older);
  });

  it("bestScoreForExperiment возвращает максимальный overallScore по эксперименту", () => {
    const low = makeEntry(
      {
        assessment: assessExperiment({
          totalSteps: 8,
          stepsCompleted: 4,
          attempts: 5,
          hintsUsed: 5,
          safetyWarningCodesEncountered: ["empty_container_heated"],
          hazardLevelsEncountered: ["none"],
          isComplete: false,
          conclusionText: "",
          mode: "guided",
        }),
      },
      1000
    );
    const high = makeEntry({}, 2000);
    const best = bestScoreForExperiment([low, high], "lab-beginner-heating-water");
    expect(best).toBe(Math.max(low.assessment.overallScore, high.assessment.overallScore));
  });

  it("bestScoreForExperiment возвращает null, если по эксперименту нет записей", () => {
    expect(bestScoreForExperiment([], "lab-beginner-heating-water")).toBeNull();
  });

  it("attemptsForExperiment считает реальное число попыток по конкретному эксперименту", () => {
    const e1 = makeEntry({}, 1000);
    const e2 = makeEntry({}, 2000);
    const other = makeEntry({ experimentId: "lab-beginner-state-changes" }, 3000);
    expect(attemptsForExperiment([e1, e2, other], "lab-beginner-heating-water")).toBe(2);
    expect(attemptsForExperiment([e1, e2, other], "lab-beginner-state-changes")).toBe(1);
  });
});
