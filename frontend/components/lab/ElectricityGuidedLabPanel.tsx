"use client";

import { ArrowRight, CheckCircle2, Gauge, Target, X } from "lucide-react";
import { useElectricityLabExperience } from "@/components/core/ElectricityLabExperienceProvider";
import ElectricityAutosaveBadge from "./ElectricityAutosaveBadge";
import { useLocale } from "@/lib/locale-context";

/**
 * Electricity Lab — Guided Laboratory Workflow UI (Stage E-2, Task 2/4/5).
 * Показывает текущий шаг эксперимента (Introduction -> Theory -> Equipment
 * -> Assembly -> Measurement -> Analysis -> Conclusion -> Finish) и
 * продвигает его СТРОГО через useElectricityLabExperience().advanceStep(),
 * которая сама проверяет currentStep.isUnlocked(stepContext) — реальное
 * состояние Circuit Engine, а не факт нажатия кнопки. Подсветка нужной
 * клеммы (Task 4) — suggestedTerminals из провайдера, применяется в
 * ElectricityLabScene через useSuggestedTerminal().
 *
 * D6.1 — moved from `.glass-panel`/`slate-*`/`neon-violet` onto D1 tokens
 * and `useLocale()`/t.electricity.guidedLab.*. `currentStep.instruction`,
 * `selectedExperiment.goal`/`.requiredComponents`, question prompts/options
 * stay untranslated — per-experiment catalog DATA
 * (lib/electricity-lab-catalog.ts), a separate deferred follow-up, not a
 * presentation change. `currentStepFeedback` (dynamic, from the
 * step-unlock engine) is also left untouched for the same reason — only
 * the STATIC fallback hint string is localized.
 */
export default function ElectricityGuidedLabPanel() {
  const { t } = useLocale();
  const g = t.electricity.guidedLab;
  const {
    selectedExperiment,
    exitExperiment,
    currentStepIndex,
    currentStep,
    isCurrentStepUnlocked,
    currentStepFeedback,
    advanceStep,
    isLastStep,
    measurements,
    recordMeasurement,
    questionAnswers,
    answerQuestion,
    observationsDraft,
    setObservationsDraft,
    conclusionDraft,
    setConclusionDraft,
    completeExperiment,
  } = useElectricityLabExperience();

  if (!selectedExperiment || !currentStep) return null;

  const totalSteps = selectedExperiment.steps.length;
  const progressPct = Math.round(((currentStepIndex + 1) / totalSteps) * 100);
  const lastMeasurement = measurements[measurements.length - 1];

  return (
    <div className="ds-glass rounded-ds-panel border-accent/40 p-4" data-testid="electricity-guided-lab-panel">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-headline text-base font-semibold text-text-primary">{selectedExperiment.title}</h3>
          <p className="font-mono text-ds-caption uppercase tracking-widest text-text-muted" data-testid="electricity-guided-lab-progress-label">
            {g.stepCounter
              .replace("{stepLabel}", g.stepLabels[currentStep.kind])
              .replace("{current}", String(currentStepIndex + 1))
              .replace("{total}", String(totalSteps))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ElectricityAutosaveBadge />
          <button
            type="button"
            onClick={exitExperiment}
            data-testid="electricity-guided-lab-exit"
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
        <h4 className="mb-1 font-mono text-ds-caption uppercase tracking-widest text-text-muted">{g.goalHeading}</h4>
        <p className="text-ds-body text-text-secondary">{selectedExperiment.goal}</p>
      </div>

      {(() => {
        const isIntroStep = currentStep.kind === "introduction" || currentStep.kind === "theory" || currentStep.kind === "equipment";
        const isStepDone = isCurrentStepUnlocked && !isIntroStep;
        return (
          <div
            className={`mb-3 rounded-ds-control border p-3 text-ds-body transition-colors ${
              isIntroStep
                ? "border-accent-geo/40 bg-accent-geo/10 text-accent-geo"
                : isStepDone
                ? "border-success/40 bg-success/10 text-success"
                : "border-border/[0.1] bg-text-primary/5 text-text-primary"
            }`}
            data-testid="electricity-guided-lab-current-step"
          >
            {isIntroStep ? (
              <Target size={14} className="mr-1.5 inline text-accent-geo" aria-hidden="true" />
            ) : isStepDone ? (
              <CheckCircle2 size={14} className="mr-1.5 inline text-success" aria-hidden="true" />
            ) : null}
            {currentStep.instruction}
          </div>
        );
      })()}

      {currentStep.kind === "equipment" && (
        <ul className="mb-3 space-y-0.5 text-ds-body text-text-secondary" data-testid="electricity-guided-lab-equipment">
          {selectedExperiment.requiredComponents.map((c) => (
            <li key={c}>• {c}</li>
          ))}
        </ul>
      )}

      {currentStep.kind === "measurement" && (
        <div className="mb-3 space-y-2">
          <button
            type="button"
            onClick={recordMeasurement}
            data-testid="electricity-record-measurement"
            className="ds-focus-ring flex items-center gap-2 rounded-full border border-accent/60 px-3 py-1.5 text-ds-body text-accent transition-colors hover:bg-accent/10"
          >
            <Gauge size={14} /> {g.recordMeasurement}
          </button>
          <div className="font-mono text-ds-caption text-text-muted" aria-live="polite" data-testid="electricity-measurement-count">
            {g.measurementCount.replace("{count}", String(measurements.length))}
          </div>
          {lastMeasurement && (
            <div
              className="rounded-ds-control border border-border/[0.1] p-2 font-mono text-ds-caption text-text-secondary"
              aria-live="polite"
              data-testid="electricity-last-measurement"
            >
              U = {lastMeasurement.voltageV.toFixed(2)} В · I = {lastMeasurement.currentA.toFixed(3)} А · R = {lastMeasurement.resistanceOhm.toFixed(1)} Ом · P = {lastMeasurement.powerW.toFixed(2)} Вт
            </div>
          )}
        </div>
      )}

      {currentStep.kind === "analysis" && selectedExperiment.questions.length > 0 && (
        <div className="mb-3 space-y-3" data-testid="electricity-questions">
          {selectedExperiment.questions.map((q) => (
            <fieldset key={q.id} className="rounded-ds-control border border-border/[0.1] p-3">
              <legend className="mb-2 px-0.5 text-ds-body text-text-primary">{q.prompt}</legend>
              <div className="space-y-1">
                {q.options.map((option, i) => (
                  <label key={i} className="flex cursor-pointer items-center gap-2 text-ds-body text-text-secondary">
                    <input
                      type="radio"
                      name={q.id}
                      checked={questionAnswers[q.id] === i}
                      onChange={() => answerQuestion(q.id, i)}
                      data-testid={`electricity-question-${q.id}-option-${i}`}
                      className="accent-accent focus-visible:ring-2 focus-visible:ring-accent"
                    />
                    {option}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          <div>
            <label className="mb-1 block font-mono text-ds-caption uppercase tracking-widest text-text-muted" htmlFor="electricity-observations">
              {g.observationsLabel}
            </label>
            <textarea
              id="electricity-observations"
              value={observationsDraft}
              onChange={(e) => setObservationsDraft(e.target.value)}
              rows={2}
              data-testid="electricity-observations"
              className="ds-input ds-focus-ring"
              placeholder={g.observationsPlaceholder}
            />
          </div>
        </div>
      )}

      {currentStep.kind === "conclusion" && (
        <div className="mb-3">
          <label className="mb-1 block font-mono text-ds-caption uppercase tracking-widest text-text-muted" htmlFor="electricity-conclusion">
            {g.conclusionLabel}
          </label>
          <textarea
            id="electricity-conclusion"
            value={conclusionDraft}
            onChange={(e) => setConclusionDraft(e.target.value)}
            rows={3}
            data-testid="electricity-conclusion"
            className="ds-input ds-focus-ring"
            placeholder={g.conclusionPlaceholder}
          />
        </div>
      )}

      <button
        type="button"
        onClick={isLastStep ? completeExperiment : advanceStep}
        disabled={!isCurrentStepUnlocked}
        data-testid="electricity-guided-lab-advance"
        className="ds-focus-ring flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-ds-body font-medium text-white transition-all hover:brightness-110 disabled:opacity-40"
      >
        {isLastStep ? g.completeButton : g.nextButton}
        <ArrowRight size={16} />
      </button>
      {/* Task 5 — Educational Feedback: кнопка просто задизейблена без
          объяснения выглядит как "скрытая логика". Условие разблокировки
          всегда совпадает с инструкцией шага выше — эта подсказка не
          выдумывает новый текст, а прямо указывает, что дело именно в
          невыполненном условии, а не в баге/зависшей кнопке. */}
      {!isCurrentStepUnlocked && (
        <p
          className={`mt-1.5 text-ds-caption ${currentStepFeedback ? "text-warning" : "text-text-muted"}`}
          role="status"
          data-testid="electricity-guided-lab-locked-hint"
        >
          {currentStepFeedback ?? g.lockedHintDefault}
        </p>
      )}
    </div>
  );
}
