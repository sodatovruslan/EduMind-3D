"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, X } from "lucide-react";
import { useChemistryLabExperience } from "@/components/core/ChemistryLabExperienceProvider";

/**
 * Chemistry World — Guided Laboratory Mode UI (Stage 5.6). Показывает
 * текущий шаг эксперимента и продвигает его СТРОГО через
 * useChemistryLabExperience().advanceStep(), которая сама проверяет
 * currentStep.isUnlocked(stepContext) — реальное состояние симулятора,
 * а не факт нажатия кнопки (кнопка "Далее" просто задизейблена, пока
 * условие не выполнено).
 */
export default function GuidedLabPanel() {
  const {
    selectedExperiment,
    exitExperiment,
    currentStepIndex,
    currentStep,
    isCurrentStepUnlocked,
    advanceStep,
    isLastStep,
    completeExperiment,
    modeConfig,
    conclusionDraft,
    setConclusionDraft,
  } = useChemistryLabExperience();

  if (!selectedExperiment) return null;

  const totalSteps = selectedExperiment.steps.length;
  const progressPct = Math.round(((currentStepIndex + 1) / totalSteps) * 100);

  return (
    <div className="glass-panel rounded-2xl border border-neon-violet/40 p-4" data-testid="guided-lab-panel">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-headline text-base font-semibold text-slate-100">{selectedExperiment.title}</h3>
          <p className="font-mono text-xs uppercase tracking-widest text-slate-500" data-testid="guided-lab-progress-label">
            Шаг {currentStepIndex + 1} / {totalSteps}
          </p>
        </div>
        <button
          type="button"
          onClick={exitExperiment}
          data-testid="guided-lab-exit"
          title="Выйти из эксперимента"
          aria-label="Выйти из эксперимента"
          className="text-slate-400 hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-neon-violet"
        >
          <X size={18} />
        </button>
      </div>

      <div
        className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-valuenow={progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Прогресс эксперимента"
      >
        <div className="h-full rounded-full bg-neon-violet transition-all" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="mb-3">
        <h4 className="mb-1 font-mono text-xs uppercase tracking-widest text-slate-400">Цели</h4>
        <ul className="space-y-0.5 text-sm text-slate-300">
          {selectedExperiment.objectives.map((o) => (
            <li key={o}>• {o}</li>
          ))}
        </ul>
      </div>

      {modeConfig.showSafetyReminders && selectedExperiment.safetyNotes.length > 0 && (
        <div className="mb-3 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-200" data-testid="guided-lab-safety">
          <div className="mb-1 flex items-center gap-1 font-medium">
            <AlertTriangle size={14} /> Безопасность
          </div>
          <ul className="space-y-0.5">
            {selectedExperiment.safetyNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {!modeConfig.showObjectivesOnly && currentStep && (
        <div
          className={`mb-3 rounded-xl border p-3 text-sm transition ${
            modeConfig.showStepHighlighting && isCurrentStepUnlocked
              ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
              : "border-glass-border text-slate-300"
          }`}
          data-testid="guided-lab-current-step"
        >
          {modeConfig.showStepHighlighting && isCurrentStepUnlocked && <CheckCircle2 size={14} className="mr-1 inline" />}
          {currentStep.instruction}
        </div>
      )}

      {isLastStep && (
        <div className="mb-3">
          <label className="mb-1 block font-mono text-xs uppercase tracking-widest text-slate-400" htmlFor="lab-conclusion">
            Вывод (Лабораторный журнал)
          </label>
          <textarea
            id="lab-conclusion"
            value={conclusionDraft}
            onChange={(e) => setConclusionDraft(e.target.value)}
            rows={3}
            data-testid="guided-lab-conclusion"
            className="w-full rounded-md border border-glass-border bg-white/5 p-2 text-sm text-slate-100 focus:border-neon-violet focus:outline-none"
            placeholder="Что ты наблюдал и почему это произошло?"
          />
        </div>
      )}

      <button
        type="button"
        onClick={isLastStep ? completeExperiment : advanceStep}
        disabled={!isCurrentStepUnlocked}
        data-testid="guided-lab-advance"
        className="flex items-center gap-2 rounded-full bg-neon-violet px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        {isLastStep ? "Завершить эксперимент" : "Далее"}
        <ArrowRight size={16} />
      </button>
    </div>
  );
}
