"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Target, X } from "lucide-react";
import { useChemistryLabExperience } from "@/components/core/ChemistryLabExperienceProvider";
import AutosaveBadge from "@/components/lab/AutosaveBadge";
import { autosaveEngine } from "@/lib/autosave-engine";
import { serializeChemistrySave } from "@/lib/chemistry-save-serializer";
import { useLocale } from "@/lib/locale-context";
import { localizeLabExperiment } from "@/lib/chemistry-lab-localization";

/**
 * Chemistry World — Guided Laboratory Mode UI (Stage 5.6 & S-8).
 *
 * D6.1 — moved from `.glass-panel`/`slate-*`/`neon-violet` onto D1 tokens
 * and `useLocale()`/t.chemistry.guidedLab.*. `currentStep.instruction`/
 * `.objectives`/`.safetyNotes` stay untranslated — they're per-experiment
 * catalog DATA (lib/chemistry-lab-catalog.ts), not static UI chrome; see
 * EDUMIND_DESIGN_SYSTEM_V2.md D6.1 notes for why that's a separate,
 * deferred follow-up rather than a presentation change. The dev-only
 * "Dev Autosave" block (NODE_ENV-gated) is left in its existing styling
 * and not localized — it's a developer tool, not product surface.
 */
export default function GuidedLabPanel() {
  const { t, locale } = useLocale();
  const g = t.chemistry.guidedLab;
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
  const localizedExperiment = localizeLabExperiment(selectedExperiment, locale);

  const totalSteps = selectedExperiment.steps.length;
  const progressPct = Math.round(((currentStepIndex + 1) / totalSteps) * 100);

  const isIntroStep = currentStep?.kind === "goal" || currentStep?.kind === "safety_briefing" || currentStep?.kind === "explain";
  const isStepDone = isCurrentStepUnlocked && !isIntroStep;

  return (
    <div className="ds-glass rounded-ds-panel border-accent/40 p-4" data-testid="guided-lab-panel">
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
          <h3 className="text-ds-title text-text-primary">{localizedExperiment.title}</h3>
          <p className="font-mono text-ds-caption uppercase tracking-widest text-text-muted" data-testid="guided-lab-progress-label">
            {g.stepCounter.replace("{current}", String(currentStepIndex + 1)).replace("{total}", String(totalSteps))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AutosaveBadge />
          <button
            type="button"
            onClick={exitExperiment}
            data-testid="guided-lab-exit"
            title={g.exitAria}
            aria-label={g.exitAria}
            className="ds-focus-ring rounded-ds-control text-text-muted transition-colors hover:text-text-primary"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div
        className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-text-primary/10"
        role="progressbar"
        aria-valuenow={progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={g.progressAria}
      >
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="mb-3">
        <h4 className="mb-1 font-mono text-ds-caption uppercase tracking-widest text-text-muted">{g.objectivesHeading}</h4>
        <ul className="space-y-0.5 text-ds-body text-text-secondary">
          {selectedExperiment.objectives.map((o) => (
            <li key={o}>• {o}</li>
          ))}
        </ul>
      </div>

      {modeConfig.showSafetyReminders && selectedExperiment.safetyNotes.length > 0 && (
        <div className="mb-3 rounded-ds-control border border-warning/40 bg-warning/10 p-3 text-ds-body text-warning" data-testid="guided-lab-safety">
          <div className="mb-1 flex items-center gap-1 font-medium">
            <AlertTriangle size={14} aria-hidden="true" /> {g.safetyHeading}
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
          className={`mb-3 rounded-ds-control border p-3 text-ds-body transition-colors ${
            isIntroStep
              ? "border-accent-geo/40 bg-accent-geo/10 text-accent-geo"
              : isStepDone && modeConfig.showStepHighlighting
              ? "border-success/40 bg-success/10 text-success"
              : "border-border/[0.1] bg-text-primary/5 text-text-primary"
          }`}
          data-testid="guided-lab-current-step"
        >
          {isIntroStep ? (
            <Target size={14} className="mr-1.5 inline text-accent-geo" aria-hidden="true" />
          ) : isStepDone && modeConfig.showStepHighlighting ? (
            <CheckCircle2 size={14} className="mr-1.5 inline text-success" aria-hidden="true" />
          ) : null}
          {currentStep.instruction}
        </div>
      )}

      {isLastStep && (
        <div className="mb-3">
          <label className="mb-1 block font-mono text-ds-caption uppercase tracking-widest text-text-muted" htmlFor="lab-conclusion">
            {g.conclusionLabel}
          </label>
          <textarea
            id="lab-conclusion"
            value={conclusionDraft}
            onChange={(e) => setConclusionDraft(e.target.value)}
            rows={3}
            data-testid="guided-lab-conclusion"
            className="ds-input ds-focus-ring"
            placeholder={g.conclusionPlaceholder}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={isLastStep ? completeExperiment : advanceStep}
          disabled={!isCurrentStepUnlocked}
          data-testid="guided-lab-advance"
          className="ds-focus-ring flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-ds-body font-medium text-white transition-all hover:brightness-110 disabled:opacity-40"
        >
          {isLastStep ? g.completeButton : g.nextButton}
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
