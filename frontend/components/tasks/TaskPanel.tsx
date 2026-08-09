"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, XCircle } from "lucide-react";
import { TaskStatus } from "@/lib/task-engine";
import { explainError } from "@/lib/error-explanations";
import { useTaskProgress } from "@/components/tasks/TaskProgressProvider";
import { useLocale } from "@/lib/locale-context";

/**
 * Interactive Learning System — UI поверх Task Validator. Состояние
 * прогресса (текущее задание/XP) владеет TaskProgressProvider — эта
 * панель только отображает его и вызывает advance(). Сама панель ничего
 * не проверяет и не считает: completed/errors целиком приходят из
 * task-engine.ts через провайдер.
 *
 * D6.1 — moved from `.glass-panel`/`slate-*` onto D1 tokens and
 * `useLocale()`/t.electricity.panel.*. `task.title`/`.description`/`.goal`
 * and validator error/warning messages stay untranslated — task-engine
 * DATA, not static chrome (see D6.1 notes).
 */
const STATUS_COLOR: Record<TaskStatus, string> = {
  [TaskStatus.NOT_STARTED]: "text-text-muted border-border/[0.1]",
  [TaskStatus.IN_PROGRESS]: "text-warning border-warning/40",
  [TaskStatus.COMPLETED]: "text-success border-success/40",
  [TaskStatus.FAILED]: "text-danger border-danger/40",
};

export default function TaskPanel() {
  const { t } = useLocale();
  const p = t.electricity.panel;
  const STATUS_LABEL: Record<TaskStatus, string> = {
    [TaskStatus.NOT_STARTED]: p.statusNotStarted,
    [TaskStatus.IN_PROGRESS]: p.statusInProgress,
    [TaskStatus.COMPLETED]: p.statusCompleted,
    [TaskStatus.FAILED]: p.statusFailed,
  };
  const DIFFICULTY_LABEL: Record<string, string> = { easy: p.difficultyEasy, medium: p.difficultyMedium, hard: p.difficultyHard };
  const { taskIndex, task, totalXp, status, result, isLastTask, advance } = useTaskProgress();

  return (
    <div className="ds-glass rounded-ds-panel p-4" data-testid="task-panel">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-mono text-ds-caption uppercase tracking-widest text-text-muted">
          {p.counter.replace("{index}", String(taskIndex + 1)).replace("{difficulty}", DIFFICULTY_LABEL[task.difficulty])}
        </div>
        <div className="font-mono text-ds-caption text-accent" data-testid="task-xp">
          XP: {totalXp}
        </div>
      </div>

      <h3 className="text-ds-body font-semibold text-text-primary" data-testid="task-title">
        {task.title}
      </h3>
      <p className="mt-1 text-ds-body text-text-secondary">{task.description}</p>
      <p className="mt-1 text-ds-caption text-text-muted">
        {p.goalLabel}: {task.goal}
      </p>

      <div
        className={`mt-3 rounded-ds-control border px-3 py-2 text-ds-body ${STATUS_COLOR[status]}`}
        data-testid="task-status"
        data-status={status}
      >
        <div className="mb-1 flex items-center gap-2 font-medium">
          {status === TaskStatus.COMPLETED && <CheckCircle2 size={16} />}
          {status === TaskStatus.FAILED && <XCircle size={16} />}
          {status === TaskStatus.IN_PROGRESS && <AlertTriangle size={16} />}
          {STATUS_LABEL[status]}
        </div>

        {status === TaskStatus.COMPLETED ? (
          <p className="text-success">{p.completedMessage.replace("{xp}", String(task.xpReward))}</p>
        ) : (
          <ul className="space-y-0.5" data-testid="task-error-list">
            {result.errors.map((e) => (
              <li key={e.code} className={e.critical ? "text-danger" : "text-text-secondary"}>
                ❌ {explainError(e.code, e.message)}
              </li>
            ))}
            {result.warnings.map((w) => (
              <li key={w} className="text-warning">
                ⚠ {w}
              </li>
            ))}
            {result.errors.length === 0 && result.warnings.length === 0 && (
              <li className="text-text-muted">{p.emptyChecklist}</li>
            )}
          </ul>
        )}
      </div>

      <div className="mt-3 flex justify-end">
        <button
          onClick={advance}
          disabled={status !== TaskStatus.COMPLETED || isLastTask}
          data-testid="task-next-button"
          className="ds-focus-ring flex items-center gap-2 rounded-full border border-border/[0.12] px-4 py-2 text-ds-body font-medium text-text-primary transition-colors hover:bg-text-primary/5 disabled:opacity-40"
        >
          {isLastTask && status === TaskStatus.COMPLETED ? p.allDone : p.nextButton}
          {!(isLastTask && status === TaskStatus.COMPLETED) && <ArrowRight size={16} />}
        </button>
      </div>
    </div>
  );
}
