"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, XCircle } from "lucide-react";
import { EXPERIMENTS, ExperimentStatus } from "@/lib/experiment-validator";
import { useExperimentProgress } from "@/components/experiments/ExperimentProgressProvider";
import { useLocale } from "@/lib/locale-context";

/**
 * Chemistry World — UI поверх Experiment Validator, тот же принцип, что и
 * TaskPanel.tsx в Electricity Lab: панель ничего не проверяет и не
 * считает сама, completed/errors целиком приходят из experiment-validator.ts
 * через ExperimentProgressProvider.
 *
 * D6.1 — moved from `.glass-panel`/`slate-*` onto D1 tokens and
 * `useLocale()`/t.chemistry.panel.*. `experiment.title`/`.description`/
 * `.goal` and validator error messages (`e.message`) stay untranslated —
 * catalog/validator DATA, not static chrome (see D6.1 notes).
 */
const STATUS_COLOR: Record<ExperimentStatus, string> = {
  [ExperimentStatus.NOT_STARTED]: "text-text-muted border-border/[0.1]",
  [ExperimentStatus.IN_PROGRESS]: "text-warning border-warning/40",
  [ExperimentStatus.COMPLETED]: "text-success border-success/40",
  [ExperimentStatus.FAILED]: "text-danger border-danger/40",
};

/** Numbered steps: done (check), current (highlighted), still locked (muted). Click an unlocked one to (re)play it. */
function ExperimentStepper({ label }: { label: string }) {
  const { experimentIndex, completedExperimentIds, isExperimentUnlocked, goToExperiment } = useExperimentProgress();
  return (
    <ol className="mb-3 flex items-center gap-1.5" aria-label={label} data-testid="experiment-stepper">
      {EXPERIMENTS.map((item, index) => {
        const done = completedExperimentIds.includes(item.id);
        const current = index === experimentIndex;
        return (
          <li key={item.id} className="flex min-w-0 flex-1 items-center gap-1.5" aria-current={current ? "step" : undefined}>
            <button
              type="button"
              onClick={() => goToExperiment(index)}
              disabled={!isExperimentUnlocked(index)}
              data-testid={`experiment-step-${index + 1}`}
              className="ds-focus-ring flex min-w-0 items-center gap-1.5 rounded-full pr-1 transition-opacity enabled:hover:opacity-75 disabled:cursor-not-allowed"
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-ds-caption ${
                  done
                    ? "border-success/60 bg-success/15 text-success"
                    : current
                      ? "border-accent text-accent"
                      : "border-border/[0.15] text-text-muted"
                }`}
              >
                {done ? <Check size={13} /> : index + 1}
              </span>
              <span className={`hidden truncate text-ds-caption sm:block ${current ? "font-medium text-text-primary" : "text-text-muted"}`}>
                {item.title}
              </span>
            </button>
            {index < EXPERIMENTS.length - 1 && <span className={`h-px min-w-3 flex-1 ${done ? "bg-success/50" : "bg-border/[0.15]"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

export default function ExperimentPanel() {
  const { t } = useLocale();
  const p = t.chemistry.panel;
  const STATUS_LABEL: Record<ExperimentStatus, string> = {
    [ExperimentStatus.NOT_STARTED]: p.statusNotStarted,
    [ExperimentStatus.IN_PROGRESS]: p.statusInProgress,
    [ExperimentStatus.COMPLETED]: p.statusCompleted,
    [ExperimentStatus.FAILED]: p.statusFailed,
  };
  const DIFFICULTY_LABEL: Record<string, string> = { easy: p.difficultyEasy, medium: p.difficultyMedium, hard: p.difficultyHard };
  const { experimentIndex, experiment, totalXp, status, result, isLastExperiment, advance } = useExperimentProgress();

  return (
    <div className="ds-glass rounded-ds-panel p-4" data-testid="experiment-panel">
      <ExperimentStepper label={p.stepperAria} />
      <div className="mb-3 flex items-center justify-between">
        <div className="font-mono text-ds-caption uppercase tracking-widest text-text-muted">
          {p.counter
            .replace("{index}", String(experimentIndex + 1))
            .replace("{total}", String(EXPERIMENTS.length))
            .replace("{difficulty}", DIFFICULTY_LABEL[experiment.difficulty])}
        </div>
        <div className="font-mono text-ds-caption text-accent" data-testid="experiment-xp">
          XP: {totalXp}
        </div>
      </div>

      <h3 className="text-ds-body font-semibold text-text-primary" data-testid="experiment-title">
        {experiment.title}
      </h3>
      <p className="mt-1 text-ds-body text-text-secondary">{experiment.description}</p>
      <p className="mt-1 text-ds-caption text-text-muted">
        {p.goalLabel}: {experiment.goal}
      </p>

      <motion.div
        key={status}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className={`mt-3 rounded-ds-control border px-3 py-2 text-ds-body ${STATUS_COLOR[status]}`}
        data-testid="experiment-status"
        data-status={status}
      >
        <div className="mb-1 flex items-center gap-2 font-medium">
          {status === ExperimentStatus.COMPLETED && <CheckCircle2 size={16} />}
          {status === ExperimentStatus.FAILED && <XCircle size={16} />}
          {status === ExperimentStatus.IN_PROGRESS && <AlertTriangle size={16} />}
          {STATUS_LABEL[status]}
        </div>

        {status === ExperimentStatus.COMPLETED ? (
          <p className="text-success">{p.completedMessage.replace("{xp}", String(experiment.xpReward))}</p>
        ) : (
          <ul className="space-y-0.5" data-testid="experiment-error-list">
            {result.errors.map((e) => (
              <li key={e.code} className={e.critical ? "text-danger" : "text-text-secondary"}>
                ❌ {e.message}
              </li>
            ))}
            {result.errors.length === 0 && <li className="text-text-muted">{p.emptyChecklist}</li>}
          </ul>
        )}
      </motion.div>

      <div className="mt-3 flex justify-end">
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={advance}
          disabled={status !== ExperimentStatus.COMPLETED || isLastExperiment}
          data-testid="experiment-next-button"
          className="ds-focus-ring flex items-center gap-2 rounded-full border border-border/[0.12] px-4 py-2 text-ds-body font-medium text-text-primary transition-colors hover:bg-text-primary/5 disabled:opacity-40"
        >
          {isLastExperiment && status === ExperimentStatus.COMPLETED ? p.allDone : p.nextButton}
          {!(isLastExperiment && status === ExperimentStatus.COMPLETED) && <ArrowRight size={16} />}
        </motion.button>
      </div>
    </div>
  );
}
