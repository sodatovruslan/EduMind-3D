import { describe, expect, it } from "vitest";
import {
  buildElectricityNotebookEntry,
  sortElectricityNotebookEntriesByDateDesc,
  bestElectricityScoreForExperiment,
  electricityAttemptsForExperiment,
  type ElectricityMeasurement,
  type QuestionResult,
} from "./electricity-notebook";

const MEASUREMENT: ElectricityMeasurement = { voltageV: 12, currentA: 2, resistanceOhm: 6, powerW: 24, at: 1000 };

function correctResult(): QuestionResult {
  return { questionId: "q1", prompt: "Почему ток такой?", selectedIndex: 0, correctIndex: 0, correct: true };
}

function wrongResult(): QuestionResult {
  return { questionId: "q1", prompt: "Почему ток такой?", selectedIndex: 1, correctIndex: 0, correct: false };
}

describe("electricity-notebook", () => {
  it("детерминированно строит запись из переданных данных (без побочного времени благодаря `now`)", () => {
    const entry = buildElectricityNotebookEntry({
      experimentId: "elec-beginner-measure-current",
      experimentTitle: "Измерение тока в простой цепи",
      difficulty: "beginner",
      objective: "Собрать цепь и измерить ток.",
      componentKinds: ["battery", "switch", "bulb"],
      connectionsCount: 6,
      measurements: [MEASUREMENT, MEASUREMENT, MEASUREMENT],
      questionResults: [correctResult()],
      observations: "Лампа загорелась ровно.",
      conclusion: "Ток оказался равен 2 А, что соответствует закону Ома при данных параметрах цепи.",
      hintsUsed: 0,
      now: () => 5000,
    });

    expect(entry.id).toBe("elec-beginner-measure-current-5000");
    expect(entry.dateIso).toBe(new Date(5000).toISOString());
    expect(entry.measurements).toHaveLength(3);
  });

  it("максимальный балл достигается при полных измерениях, верных ответах, содержательном выводе и без подсказок", () => {
    const entry = buildElectricityNotebookEntry({
      experimentId: "e1",
      experimentTitle: "Test",
      difficulty: "beginner",
      objective: "obj",
      componentKinds: ["battery"],
      connectionsCount: 1,
      measurements: [MEASUREMENT, MEASUREMENT, MEASUREMENT],
      questionResults: [correctResult()],
      observations: "",
      conclusion: "Это достаточно подробный вывод длиной больше шестидесяти символов для максимального балла.",
      hintsUsed: 0,
    });
    expect(entry.score).toBe(100);
  });

  it("неверный ответ, мало измерений, короткий вывод и подсказки снижают балл", () => {
    const weak = buildElectricityNotebookEntry({
      experimentId: "e1",
      experimentTitle: "Test",
      difficulty: "beginner",
      objective: "obj",
      componentKinds: ["battery"],
      connectionsCount: 1,
      measurements: [MEASUREMENT],
      questionResults: [wrongResult()],
      observations: "",
      conclusion: "",
      hintsUsed: 3,
    });
    expect(weak.score).toBeLessThan(50);

    const strong = buildElectricityNotebookEntry({
      experimentId: "e1",
      experimentTitle: "Test",
      difficulty: "beginner",
      objective: "obj",
      componentKinds: ["battery"],
      connectionsCount: 1,
      measurements: [MEASUREMENT, MEASUREMENT, MEASUREMENT],
      questionResults: [correctResult()],
      observations: "",
      conclusion: "Подробный содержательный вывод длиной более шестидесяти символов.",
      hintsUsed: 0,
    });
    expect(strong.score).toBeGreaterThan(weak.score);
  });

  it("teacherNote указывает на неверный вопрос, если такой был", () => {
    const entry = buildElectricityNotebookEntry({
      experimentId: "e1",
      experimentTitle: "Test",
      difficulty: "beginner",
      objective: "obj",
      componentKinds: ["battery"],
      connectionsCount: 1,
      measurements: [MEASUREMENT],
      questionResults: [wrongResult()],
      observations: "",
      conclusion: "",
      hintsUsed: 0,
    });
    expect(entry.teacherNote).toContain("Почему ток такой?");
  });

  it("сортировка/лучший балл/число попыток считаются по реально сохранённым записям", () => {
    const older = buildElectricityNotebookEntry({
      experimentId: "e1",
      experimentTitle: "Test",
      difficulty: "beginner",
      objective: "obj",
      componentKinds: [],
      connectionsCount: 0,
      measurements: [MEASUREMENT],
      questionResults: [wrongResult()],
      observations: "",
      conclusion: "",
      hintsUsed: 0,
      now: () => 1000,
    });
    const newer = buildElectricityNotebookEntry({
      experimentId: "e1",
      experimentTitle: "Test",
      difficulty: "beginner",
      objective: "obj",
      componentKinds: [],
      connectionsCount: 0,
      measurements: [MEASUREMENT, MEASUREMENT, MEASUREMENT],
      questionResults: [correctResult()],
      observations: "",
      conclusion: "Подробный вывод длиной более двадцати символов.",
      hintsUsed: 0,
      now: () => 2000,
    });

    const sorted = sortElectricityNotebookEntriesByDateDesc([older, newer]);
    expect(sorted[0]).toBe(newer);

    expect(bestElectricityScoreForExperiment([older, newer], "e1")).toBe(newer.score);
    expect(electricityAttemptsForExperiment([older, newer], "e1")).toBe(2);
    expect(bestElectricityScoreForExperiment([older, newer], "unknown")).toBeNull();
  });
});
