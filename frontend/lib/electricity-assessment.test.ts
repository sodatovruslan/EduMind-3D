import { describe, expect, it } from "vitest";
import { assessElectricityExperiment, type ElectricityAssessmentInput } from "./electricity-assessment";
import type { ElectricityEvidenceSummary } from "./electricity-evidence";
import type { QuestionResult } from "./electricity-notebook";

function emptyEvidence(overrides: Partial<ElectricityEvidenceSummary> = {}): ElectricityEvidenceSummary {
  return {
    stepsCompletedCount: 8,
    hintsUsed: 0,
    mistakesCount: 0,
    safetyIncidentsCount: 0,
    measurementErrorsCount: 0,
    selfCorrectionsCount: 0,
    successfulMeasurementsCount: 0,
    ...overrides,
  };
}

function correctQ(): QuestionResult {
  return { questionId: "q1", prompt: "?", selectedIndex: 0, correctIndex: 0, correct: true };
}
function wrongQ(): QuestionResult {
  return { questionId: "q1", prompt: "?", selectedIndex: 1, correctIndex: 0, correct: false };
}

function baseInput(overrides: Partial<ElectricityAssessmentInput> = {}): ElectricityAssessmentInput {
  return {
    isComplete: true,
    totalSteps: 8,
    evidence: emptyEvidence(),
    questionResults: [correctQ()],
    durationMs: 60000,
    ...overrides,
  };
}

describe("electricity-assessment — assessElectricityExperiment", () => {
  it("чистое прохождение без ошибок/подсказок/нарушений даёт максимальный балл по всем категориям", () => {
    const report = assessElectricityExperiment(baseInput());
    expect(report.completion.score).toBe(100);
    expect(report.accuracy.score).toBe(100);
    expect(report.safety.score).toBe(100);
    expect(report.circuitBuilding.score).toBe(100);
    expect(report.overallScore).toBe(100);
  });

  it("нарушения безопасности снижают только safety-категорию (-25 за каждый инцидент)", () => {
    const report = assessElectricityExperiment(baseInput({ evidence: emptyEvidence({ safetyIncidentsCount: 2 }) }));
    expect(report.safety.score).toBe(50);
    expect(report.completion.score).toBe(100);
    expect(report.accuracy.score).toBe(100);
  });

  it("ошибки подключения снижают circuitBuilding, но самостоятельное исправление частично компенсирует", () => {
    const withoutCorrection = assessElectricityExperiment(
      baseInput({ evidence: emptyEvidence({ mistakesCount: 2 }) })
    );
    expect(withoutCorrection.circuitBuilding.score).toBe(70); // 100 - 2*15

    const withCorrection = assessElectricityExperiment(
      baseInput({ evidence: emptyEvidence({ mistakesCount: 2, selfCorrectionsCount: 1 }) })
    );
    expect(withCorrection.circuitBuilding.score).toBe(75); // 100 - 2*15 + 1*5
    expect(withCorrection.circuitBuilding.score).toBeGreaterThan(withoutCorrection.circuitBuilding.score);
  });

  it("точность вопросов считается по реальному отношению верных ответов, а не по score", () => {
    const report = assessElectricityExperiment(baseInput({ questionResults: [correctQ(), wrongQ()] }));
    expect(report.accuracy.score).toBe(50);
  });

  it("нет вопросов в эксперименте -> accuracy не штрафуется (100 по умолчанию, а не 0)", () => {
    const report = assessElectricityExperiment(baseInput({ questionResults: [] }));
    expect(report.accuracy.score).toBe(100);
  });

  it("подсказки штрафуют только overallScore, с потолком в 10 баллов", () => {
    const fewHints = assessElectricityExperiment(baseInput({ evidence: emptyEvidence({ hintsUsed: 2 }) }));
    expect(fewHints.overallScore).toBe(96); // 100 - 2*2

    const manyHints = assessElectricityExperiment(baseInput({ evidence: emptyEvidence({ hintsUsed: 20 }) }));
    expect(manyHints.overallScore).toBe(90); // штраф не может превысить 10
    expect(manyHints.completion.score).toBe(100); // категории сами по себе не тронуты штрафом за подсказки
  });

  it("баллы категорий никогда не уходят ниже нуля даже при экстремальном числе инцидентов", () => {
    const report = assessElectricityExperiment(baseInput({ evidence: emptyEvidence({ safetyIncidentsCount: 10, mistakesCount: 10 }) }));
    expect(report.safety.score).toBe(0);
    expect(report.circuitBuilding.score).toBe(0);
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
  });

  it("summary — детерминированный текст, упоминающий только реально произошедшие факты", () => {
    const clean = assessElectricityExperiment(baseInput());
    expect(clean.summary).not.toMatch(/нарушени|ошиб|подсказ/i);

    const messy = assessElectricityExperiment(
      baseInput({ evidence: emptyEvidence({ safetyIncidentsCount: 1, mistakesCount: 1, selfCorrectionsCount: 1, hintsUsed: 2 }) })
    );
    expect(messy.summary).toMatch(/нарушений безопасности: 1/);
    expect(messy.summary).toMatch(/Ошибок в подключении: 1/);
    expect(messy.summary).toMatch(/исправлено самостоятельно: 1/);
    expect(messy.summary).toMatch(/Использовано подсказок: 2/);
  });

  it("незавершённая попытка (гипотетическая, для будущего частичного прогресса) считает completion по доле пройденных шагов", () => {
    const report = assessElectricityExperiment(
      baseInput({ isComplete: false, totalSteps: 8, evidence: emptyEvidence({ stepsCompletedCount: 4 }) })
    );
    expect(report.completion.score).toBe(50);
  });
});
