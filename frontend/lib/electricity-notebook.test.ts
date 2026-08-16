import { describe, expect, it } from "vitest";
import {
  buildElectricityNotebookEntry,
  sortElectricityNotebookEntriesByDateDesc,
  bestElectricityScoreForExperiment,
  electricityAttemptsForExperiment,
  type ElectricityMeasurement,
  type QuestionResult,
} from "./electricity-notebook";
import type { ElectricityEvidenceEvent } from "./electricity-evidence";

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

// Stage S9.6 — Assessment & Teacher Analytics: без evidenceEvents (старые
// вызовы, проверено выше) все новые поля нулевые и не влияют на score —
// эти тесты проверяют, что evidenceEvents реально доходят до записи.
describe("electricity-notebook — Stage S9.6 evidence и assessment", () => {
  it("без evidenceEvents все новые счётчики нулевые, а score/teacherNote не меняются (обратная совместимость)", () => {
    const entry = buildElectricityNotebookEntry({
      experimentId: "e1",
      experimentTitle: "Test",
      difficulty: "beginner",
      objective: "obj",
      componentKinds: ["battery"],
      connectionsCount: 1,
      measurements: [MEASUREMENT],
      questionResults: [correctResult()],
      observations: "",
      conclusion: "",
      hintsUsed: 0,
    });
    expect(entry.hintsUsed).toBe(0);
    expect(entry.mistakesCount).toBe(0);
    expect(entry.safetyIncidentsCount).toBe(0);
    expect(entry.measurementErrorsCount).toBe(0);
    expect(entry.selfCorrectionsCount).toBe(0);
    expect(entry.durationMs).toBeNull();
    expect(entry.assessment.overallScore).toBeGreaterThan(0);
  });

  it("реальные evidenceEvents доходят до записи как agregированные счётчики и влияют на assessment, не на score", () => {
    const events: ElectricityEvidenceEvent[] = [
      { code: "experiment_started", at: 0 },
      { code: "incorrect_wiring", at: 1, detail: "ammeter:parallel_invalid" },
      { code: "ammeter_placement_error", at: 1 },
      { code: "successful_correction", at: 2, detail: "ammeter" },
      { code: "unsafe_wiring", at: 3, detail: "short_circuit" },
      { code: "short_circuit_triggered", at: 3 },
      { code: "successful_correction", at: 4, detail: "short_circuit" },
      { code: "experiment_completed", at: 5 },
    ];

    const withEvidence = buildElectricityNotebookEntry({
      experimentId: "e1",
      experimentTitle: "Test",
      difficulty: "beginner",
      objective: "obj",
      componentKinds: ["battery"],
      connectionsCount: 1,
      measurements: [MEASUREMENT, MEASUREMENT, MEASUREMENT],
      questionResults: [correctResult()],
      observations: "",
      conclusion: "Подробный вывод длиной более двадцати символов для теста.",
      hintsUsed: 0,
      evidenceEvents: events,
    });

    expect(withEvidence.mistakesCount).toBe(2); // incorrect_wiring + unsafe_wiring
    expect(withEvidence.safetyIncidentsCount).toBe(2); // unsafe_wiring + short_circuit_triggered
    expect(withEvidence.measurementErrorsCount).toBe(1); // ammeter_placement_error
    expect(withEvidence.selfCorrectionsCount).toBe(2);

    // score (старая, протестированная формула) НЕ учитывает safety/mistakes —
    // это намеренно: score остаётся неизменной метрикой, assessment — новая,
    // более полная. Проверяем, что assessment реально ниже из-за инцидентов.
    const clean = buildElectricityNotebookEntry({
      experimentId: "e1",
      experimentTitle: "Test",
      difficulty: "beginner",
      objective: "obj",
      componentKinds: ["battery"],
      connectionsCount: 1,
      measurements: [MEASUREMENT, MEASUREMENT, MEASUREMENT],
      questionResults: [correctResult()],
      observations: "",
      conclusion: "Подробный вывод длиной более двадцати символов для теста.",
      hintsUsed: 0,
    });

    expect(withEvidence.score).toBe(clean.score); // score формула не тронута
    expect(withEvidence.assessment.overallScore).toBeLessThan(clean.assessment.overallScore); // assessment честно ниже
    expect(withEvidence.assessment.safety.score).toBeLessThan(100);
    expect(withEvidence.assessment.circuitBuilding.score).toBeLessThan(100);
  });

  it("teacherNote упоминает реальные нарушения безопасности и самостоятельные исправления, когда они есть", () => {
    const events: ElectricityEvidenceEvent[] = [
      { code: "unsafe_wiring", at: 1, detail: "short_circuit" },
      { code: "short_circuit_triggered", at: 1 },
    ];
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
      conclusion: "Подробный вывод длиной более двадцати символов для теста.",
      hintsUsed: 0,
      evidenceEvents: events,
    });
    expect(entry.teacherNote).toContain("нарушений безопасности: 2");
  });

  it("durationMs персистится на записи как есть, без пересчёта", () => {
    const entry = buildElectricityNotebookEntry({
      experimentId: "e1",
      experimentTitle: "Test",
      difficulty: "beginner",
      objective: "obj",
      componentKinds: [],
      connectionsCount: 0,
      measurements: [],
      questionResults: [],
      observations: "",
      conclusion: "",
      hintsUsed: 0,
      durationMs: 42000,
    });
    expect(entry.durationMs).toBe(42000);
  });
});
