"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Target, X } from "lucide-react";
import { useChemistryLabExperience } from "@/components/core/ChemistryLabExperienceProvider";
import AutosaveBadge from "@/components/lab/AutosaveBadge";
import { autosaveEngine } from "@/lib/autosave-engine";
import { serializeChemistrySave } from "@/lib/chemistry-save-serializer";

/**
 * Chemistry World — Guided Laboratory Mode UI (Stage 5.6 & S-8).
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
    hydrationStatus,
    getSerializeOptions,
  } = useChemistryLabExperience();

  const [autosaveState, setAutosaveState] = useState(autosaveEngine.getStatus());

  useEffect(() => {
    return autosaveEngine.subscribe((s) => setAutosaveState(s));
  }, []);

  if (!selectedExperiment) return null;

  const totalSteps = selectedExperiment.steps.length;
  const progressPct = Math.round(((currentStepIndex + 1) / totalSteps) * 100);

  const isIntroStep = currentStep?.kind === "goal" || currentStep?.kind === "safety_briefing" || currentStep?.kind === "explain";
  const isStepDone = isCurrentStepUnlocked && !isIntroStep;

  return (
    <div className="glass-panel rounded-2xl border border-neon-violet/40 p-4" data-testid="guided-lab-panel">
      {/* Hidden elements for Playwright / automated tests */}
      <span
        data-testid="chemistry-autosave-state"
        className="hidden"
        style={{ display: "none" }}
      >
        {autosaveState}
      </span>
      <span
        data-testid="chemistry-hydration-state"
        data-hydrated={hydrationStatus === "hydrated" ? "true" : "false"}
        className="hidden"
        style={{ display: "none" }}
      >
        {hydrationStatus}
      </span>

      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-headline text-base font-semibold text-slate-100">{selectedExperiment.title}</h3>
          <p className="font-mono text-xs uppercase tracking-widest text-slate-500" data-testid="guided-lab-progress-label">
            Шаг {currentStepIndex + 1} / {totalSteps}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AutosaveBadge />
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
            isIntroStep
              ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-200"
              : isStepDone && modeConfig.showStepHighlighting
              ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
              : "border-glass-border bg-white/5 text-slate-200"
          }`}
          data-testid="guided-lab-current-step"
        >
          {isIntroStep ? (
            <Target size={14} className="mr-1.5 inline text-cyan-400" />
          ) : isStepDone && modeConfig.showStepHighlighting ? (
            <CheckCircle2 size={14} className="mr-1.5 inline text-emerald-400" />
          ) : null}
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

      <div className="flex flex-wrap items-center justify-between gap-3">
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

        {process.env.NODE_ENV !== "production" && (
          <div className="flex items-center gap-1.5 rounded-xl border border-glass-border bg-black/40 px-3 py-1.5 text-xs text-slate-400">
            <span className="font-mono uppercase tracking-widest text-[9px] text-slate-500">Dev Autosave:</span>
            <button
              type="button"
              onClick={() => {
                const opts = getSerializeOptions();
                if (opts) {
                  const snap = serializeChemistrySave(opts);
                  console.log("[Dev Diagnostics] Save Snapshot:", snap);
                  alert(JSON.stringify(snap, null, 2));
                } else {
                  alert("No serialize options available (select an experiment first)");
                }
              }}
              data-testid="dev-show-snapshot"
              className="rounded bg-white/5 border border-glass-border px-2 py-0.5 hover:bg-white/10 text-[10px] text-slate-300 transition"
            >
              Snapshot
            </button>
            <button
              type="button"
              onClick={() => {
                autosaveEngine.flush();
              }}
              data-testid="dev-save-now"
              className="rounded bg-neon-violet px-2 py-0.5 text-white hover:brightness-110 text-[10px] font-medium transition"
            >
              Save Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
