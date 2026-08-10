"use client";

import { Lightbulb, MousePointerClick } from "lucide-react";
import { useTutorial } from "@/components/tutorial/TutorialProvider";
import { useLocale } from "@/lib/locale-context";

/**
 * Guided Onboarding — панель обучения под 3D-сценой. Показывает текущий
 * шаг и текст задания всегда (чтобы новичок не терялся), а кнопка
 * "Показать подсказку" только включает мягкую подсветку нужных клемм в
 * сцене (через TutorialProvider/ConnectionPoint) — сама она ничего не
 * подключает.
 *
 * D6.2 — moved from `.glass-panel`/`slate-*`/`neon-violet` onto D1 tokens
 * and `useLocale()`/t.electricity.tutorial.*. `currentInstruction` stays
 * untranslated — per-step tutorial DATA, not static chrome.
 */
export default function TutorialPanel() {
  const { t } = useLocale();
  const u = t.electricity.tutorial;
  const { active, stepIndex, totalSteps, hintVisible, showHint, currentInstruction, skipTutorial } = useTutorial();

  if (!active || !currentInstruction) return null;

  return (
    <div
      className="rounded-ds-panel border border-accent/40 bg-surface p-4 sm:col-span-2"
      data-testid="tutorial-panel"
      data-step={stepIndex}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="font-mono text-xs uppercase tracking-widest text-accent">
          {u.stepCounter.replace("{current}", String(Math.min(stepIndex + 1, totalSteps))).replace("{total}", String(totalSteps))}
        </div>
        <button
          onClick={skipTutorial}
          data-testid="tutorial-skip-button"
          className="ds-focus-ring rounded-ds-control font-mono text-xs text-text-muted underline-offset-2 transition-colors hover:text-text-secondary hover:underline"
        >
          {u.skipButton}
        </button>
      </div>

      <p className="text-sm text-text-primary" data-testid="tutorial-instruction">
        {currentInstruction}
      </p>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={showHint}
          disabled={hintVisible}
          data-testid="tutorial-hint-button"
          className="ds-focus-ring flex items-center gap-2 rounded-full border border-border/[0.12] px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-text-primary/5 disabled:opacity-50"
        >
          <Lightbulb size={16} />
          {u.hintButton}
        </button>
        {hintVisible && (
          <span className="flex items-center gap-1 text-xs text-warning">
            <MousePointerClick size={14} />
            {u.hintVisibleNote}
          </span>
        )}
      </div>
    </div>
  );
}
