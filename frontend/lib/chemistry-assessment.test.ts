import { describe, expect, it } from "vitest";
import { assessExperiment, type AssessmentInput } from "./chemistry-assessment";

function baseInput(overrides: Partial<AssessmentInput> = {}): AssessmentInput {
  return {
    totalSteps: 8,
    stepsCompleted: 8,
    attempts: 5,
    hintsUsed: 0,
    safetyWarningCodesEncountered: [],
    hazardLevelsEncountered: ["none"],
    isComplete: true,
    conclusionText: "",
    mode: "guided",
    ...overrides,
  };
}

describe("chemistry-assessment — детерминированность", () => {
  it("одинаковые входы дают одинаковый результат (никакого Math.random)", () => {
    const input = baseInput();
    expect(assessExperiment(input)).toEqual(assessExperiment(input));
  });
});

describe("chemistry-assessment — completion", () => {
  it("100 баллов за завершение, если isComplete=true", () => {
    const report = assessExperiment(baseInput({ isComplete: true }));
    expect(report.completion.score).toBe(100);
  });

  it("пропорционально пройденным шагам, если не завершено", () => {
    const report = assessExperiment(baseInput({ isComplete: false, stepsCompleted: 4, totalSteps: 8 }));
    expect(report.completion.score).toBe(50);
  });
});

describe("chemistry-assessment — safety", () => {
  it("100 баллов, если не было ни одного реального предупреждения", () => {
    const report = assessExperiment(baseInput({ safetyWarningCodesEncountered: [], hazardLevelsEncountered: ["none"] }));
    expect(report.safety.score).toBe(100);
  });

  it("снижает балл за каждое реальное предупреждение Safety System", () => {
    const clean = assessExperiment(baseInput({ safetyWarningCodesEncountered: [] }));
    const warned = assessExperiment(baseInput({ safetyWarningCodesEncountered: ["empty_container_heated"] }));
    expect(warned.safety.score).toBeLessThan(clean.safety.score);
  });

  it("сильнее снижает балл за реально опасные уровни Hazard Engine (не просто warning)", () => {
    const report = assessExperiment(baseInput({ hazardLevelsEncountered: ["none", "container_rupture"] }));
    expect(report.safety.score).toBeLessThanOrEqual(80);
  });
});

describe("chemistry-assessment — understanding", () => {
  it("больше подсказок -> ниже балл понимания", () => {
    const noHints = assessExperiment(baseInput({ hintsUsed: 0 }));
    const manyHints = assessExperiment(baseInput({ hintsUsed: 5 }));
    expect(manyHints.understanding.score).toBeLessThan(noHints.understanding.score);
  });

  it("осмысленный вывод повышает балл понимания", () => {
    const noConclusion = assessExperiment(baseInput({ conclusionText: "" }));
    const withConclusion = assessExperiment(
      baseInput({ conclusionText: "Температура росла линейно, пока горелка была включена." })
    );
    expect(withConclusion.understanding.score).toBeGreaterThanOrEqual(noConclusion.understanding.score);
  });
});

describe("chemistry-assessment — observationQuality", () => {
  it("пустой вывод -> 0 баллов", () => {
    expect(assessExperiment(baseInput({ conclusionText: "" })).observationQuality.score).toBe(0);
  });

  it("длинный содержательный вывод -> высокий балл", () => {
    const long =
      "Температура росла линейно до 100 градусов, после чего началось активное парообразование и агрегатное состояние сменилось на газообразное. Это подтверждает, что точка кипения воды в данных условиях действительно составляет около 100 градусов Цельсия.";
    expect(long.length).toBeGreaterThanOrEqual(150);
    expect(assessExperiment(baseInput({ conclusionText: long })).observationQuality.score).toBe(100);
  });
});

describe("chemistry-assessment — correctProcedure", () => {
  it("не штрафует за ожидаемое число действий", () => {
    const report = assessExperiment(baseInput({ totalSteps: 8, attempts: 5 }));
    expect(report.correctProcedure.score).toBe(100);
  });

  it("штрафует за лишние действия сверх ожидаемых", () => {
    const efficient = assessExperiment(baseInput({ totalSteps: 8, attempts: 5 }));
    const messy = assessExperiment(baseInput({ totalSteps: 8, attempts: 15 }));
    expect(messy.correctProcedure.score).toBeLessThan(efficient.correctProcedure.score);
  });
});

describe("chemistry-assessment — overallScore", () => {
  it("является средним по 5 категориям", () => {
    const report = assessExperiment(baseInput());
    const manualAvg = Math.round(
      (report.completion.score + report.correctProcedure.score + report.safety.score + report.understanding.score + report.observationQuality.score) / 5
    );
    expect(report.overallScore).toBe(manualAvg);
  });

  it("summary содержит реальные посчитанные числа, не выдуманные", () => {
    const report = assessExperiment(baseInput());
    expect(report.summary).toContain(String(report.overallScore));
  });
});
