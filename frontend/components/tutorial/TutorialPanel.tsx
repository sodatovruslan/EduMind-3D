"use client";

import { Lightbulb, MousePointerClick } from "lucide-react";
import { useTutorial } from "@/components/tutorial/TutorialProvider";

/**
 * Guided Onboarding — панель обучения под 3D-сценой. Показывает текущий
 * шаг и текст задания всегда (чтобы новичок не терялся), а кнопка
 * "Показать подсказку" только включает мягкую подсветку нужных клемм в
 * сцене (через TutorialProvider/ConnectionPoint) — сама она ничего не
 * подключает.
 */
export default function TutorialPanel() {
  const { active, stepIndex, totalSteps, hintVisible, showHint, currentInstruction, skipTutorial } = useTutorial();

  if (!active || !currentInstruction) return null;

  return (
    <div
      className="glass-panel rounded-2xl border border-neon-violet/40 p-4 sm:col-span-2"
      data-testid="tutorial-panel"
      data-step={stepIndex}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="font-mono text-xs uppercase tracking-widest text-neon-violet">
          Обучение · Шаг {Math.min(stepIndex + 1, totalSteps)} / {totalSteps}
        </div>
        <button
          onClick={skipTutorial}
          data-testid="tutorial-skip-button"
          className="font-mono text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
        >
          Пропустить обучение
        </button>
      </div>

      <p className="text-sm text-slate-200" data-testid="tutorial-instruction">
        {currentInstruction}
      </p>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={showHint}
          disabled={hintVisible}
          data-testid="tutorial-hint-button"
          className="flex items-center gap-2 rounded-full border border-glass-border px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/5 disabled:opacity-50"
        >
          <Lightbulb size={16} />
          Показать подсказку
        </button>
        {hintVisible && (
          <span className="flex items-center gap-1 text-xs text-amber-300">
            <MousePointerClick size={14} />
            Нужные клеммы подсвечены на схеме
          </span>
        )}
      </div>
    </div>
  );
}
