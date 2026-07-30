import { describe, expect, it } from "vitest";
import { getModeConfig, LEARNING_MODES } from "./chemistry-lab-modes";

describe("chemistry-lab-modes", () => {
  it("определяет ровно 3 режима", () => {
    expect(LEARNING_MODES).toEqual(["guided", "practice", "exam"]);
  });

  it("Guided Mode: полные подсказки, подсветка шагов, объяснения ИИ", () => {
    const cfg = getModeConfig("guided");
    expect(cfg.showFullHints).toBe(true);
    expect(cfg.showStepHighlighting).toBe(true);
    expect(cfg.showAIExplanations).toBe(true);
  });

  it("Practice Mode: только цели, минимум подсказок, без подсветки шагов", () => {
    const cfg = getModeConfig("practice");
    expect(cfg.showObjectivesOnly).toBe(true);
    expect(cfg.showFullHints).toBe(false);
    expect(cfg.showStepHighlighting).toBe(false);
  });

  it("Exam Mode: без подсказок, без подсветки, без объяснений ИИ, без прямых ответов", () => {
    const cfg = getModeConfig("exam");
    expect(cfg.showFullHints).toBe(false);
    expect(cfg.showStepHighlighting).toBe(false);
    expect(cfg.showAIExplanations).toBe(false);
    expect(cfg.allowDirectAIAnswers).toBe(false);
  });

  it("ни один режим не допускает прямых ответов ИИ", () => {
    for (const mode of LEARNING_MODES) {
      expect(getModeConfig(mode).allowDirectAIAnswers).toBe(false);
    }
  });
});
