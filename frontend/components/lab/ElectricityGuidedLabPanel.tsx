"use client";

import { ArrowRight, CheckCircle2, Gauge, Target, X } from "lucide-react";
import { useElectricityLabExperience } from "@/components/core/ElectricityLabExperienceProvider";
import type { ElectricityLabStepKind } from "@/lib/electricity-lab-catalog";

/**
 * Electricity Lab — Guided Laboratory Workflow UI (Stage E-2, Task 2/4/5).
 * Показывает текущий шаг эксперимента (Introduction -> Theory -> Equipment
 * -> Assembly -> Measurement -> Analysis -> Conclusion -> Finish) и
 * продвигает его СТРОГО через useElectricityLabExperience().advanceStep(),
 * которая сама проверяет currentStep.isUnlocked(stepContext) — реальное
 * состояние Circuit Engine, а не факт нажатия кнопки. Подсветка нужной
 * клеммы (Task 4) — suggestedTerminals из провайдера, применяется в
 * ElectricityLabScene через useSuggestedTerminal().
 */
const STEP_LABEL: Record<ElectricityLabStepKind, string> = {
  introduction: "Введение",
  theory: "Теория",
  equipment: "Оборудование",
  assembly: "Сборка",
  measurement: "Измерение",
  analysis: "Анализ",
  conclusion: "Вывод",
  finish: "Завершение",
};

export default function ElectricityGuidedLabPanel() {
  const {
    selectedExperiment,
    exitExperiment,
    currentStepIndex,
    currentStep,
    isCurrentStepUnlocked,
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
    <div className="glass-panel rounded-2xl border border-neon-violet/40 p-4" data-testid="electricity-guided-lab-panel">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-headline text-base font-semibold text-slate-100">{selectedExperiment.title}</h3>
          <p className="font-mono text-xs uppercase tracking-widest text-slate-500" data-testid="electricity-guided-lab-progress-label">
            {STEP_LABEL[currentStep.kind]} · Шаг {currentStepIndex + 1} / {totalSteps}
          </p>
        </div>
        <button
          type="button"
          onClick={exitExperiment}
          data-testid="electricity-guided-lab-exit"
          title="Выйти из лабораторной работы"
          aria-label="Выйти из лабораторной работы"
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
        aria-label="Прогресс лабораторной работы"
      >
        <div className="h-full rounded-full bg-neon-violet transition-all" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="mb-3">
        <h4 className="mb-1 font-mono text-xs uppercase tracking-widest text-slate-400">Цель</h4>
        <p className="text-sm text-slate-300">{selectedExperiment.goal}</p>
      </div>

      {(() => {
        const isIntroStep = currentStep.kind === "introduction" || currentStep.kind === "theory" || currentStep.kind === "equipment";
        const isStepDone = isCurrentStepUnlocked && !isIntroStep;
        return (
          <div
            className={`mb-3 rounded-xl border p-3 text-sm transition ${
              isIntroStep
                ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-200"
                : isStepDone
                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                : "border-glass-border bg-white/5 text-slate-200"
            }`}
            data-testid="electricity-guided-lab-current-step"
          >
            {isIntroStep ? (
              <Target size={14} className="mr-1.5 inline text-cyan-400" aria-hidden="true" />
            ) : isStepDone ? (
              <CheckCircle2 size={14} className="mr-1.5 inline text-emerald-400" aria-hidden="true" />
            ) : null}
            {currentStep.instruction}
          </div>
        );
      })()}

      {currentStep.kind === "equipment" && (
        <ul className="mb-3 space-y-0.5 text-sm text-slate-300" data-testid="electricity-guided-lab-equipment">
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
            className="flex items-center gap-2 rounded-full border border-neon-violet/60 px-3 py-1.5 text-sm text-neon-violet transition hover:bg-neon-violet/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-neon-violet"
          >
            <Gauge size={14} /> Записать измерение
          </button>
          <div className="font-mono text-xs text-slate-500" aria-live="polite" data-testid="electricity-measurement-count">
            Записано измерений: {measurements.length}
          </div>
          {lastMeasurement && (
            <div
              className="rounded-lg border border-glass-border p-2 font-mono text-xs text-slate-300"
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
            <fieldset key={q.id} className="rounded-xl border border-glass-border p-3">
              <legend className="mb-2 px-0.5 text-sm text-slate-200">{q.prompt}</legend>
              <div className="space-y-1">
                {q.options.map((option, i) => (
                  <label key={i} className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                    <input
                      type="radio"
                      name={q.id}
                      checked={questionAnswers[q.id] === i}
                      onChange={() => answerQuestion(q.id, i)}
                      data-testid={`electricity-question-${q.id}-option-${i}`}
                      className="accent-neon-violet focus-visible:ring-2 focus-visible:ring-neon-violet"
                    />
                    {option}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          <div>
            <label className="mb-1 block font-mono text-xs uppercase tracking-widest text-slate-400" htmlFor="electricity-observations">
              Наблюдения
            </label>
            <textarea
              id="electricity-observations"
              value={observationsDraft}
              onChange={(e) => setObservationsDraft(e.target.value)}
              rows={2}
              data-testid="electricity-observations"
              className="w-full rounded-md border border-glass-border bg-white/5 p-2 text-sm text-slate-100 focus:border-neon-violet focus:outline-none"
              placeholder="Что ты заметил в ходе измерений?"
            />
          </div>
        </div>
      )}

      {currentStep.kind === "conclusion" && (
        <div className="mb-3">
          <label className="mb-1 block font-mono text-xs uppercase tracking-widest text-slate-400" htmlFor="electricity-conclusion">
            Вывод (Лабораторный журнал)
          </label>
          <textarea
            id="electricity-conclusion"
            value={conclusionDraft}
            onChange={(e) => setConclusionDraft(e.target.value)}
            rows={3}
            data-testid="electricity-conclusion"
            className="w-full rounded-md border border-glass-border bg-white/5 p-2 text-sm text-slate-100 focus:border-neon-violet focus:outline-none"
            placeholder="Что ты наблюдал и почему это произошло?"
          />
        </div>
      )}

      <button
        type="button"
        onClick={isLastStep ? completeExperiment : advanceStep}
        disabled={!isCurrentStepUnlocked}
        data-testid="electricity-guided-lab-advance"
        className="flex items-center gap-2 rounded-full bg-neon-violet px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        {isLastStep ? "Завершить лабораторную работу" : "Далее"}
        <ArrowRight size={16} />
      </button>
      {/* Task 5 — Educational Feedback: кнопка просто задизейблена без
          объяснения выглядит как "скрытая логика". Условие разблокировки
          всегда совпадает с инструкцией шага выше — эта подсказка не
          выдумывает новый текст, а прямо указывает, что дело именно в
          невыполненном условии, а не в баге/зависшей кнопке. */}
      {!isCurrentStepUnlocked && (
        <p className="mt-1.5 text-xs text-slate-500" role="status" data-testid="electricity-guided-lab-locked-hint">
          Кнопка станет активной, как только выполнится условие шага выше.
        </p>
      )}
    </div>
  );
}
