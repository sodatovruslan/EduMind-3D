"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, XCircle } from "lucide-react";
import { TaskStatus } from "@/lib/task-engine";
import { explainError } from "@/lib/error-explanations";
import { useTaskProgress } from "@/components/tasks/TaskProgressProvider";

/**
 * Interactive Learning System — UI поверх Task Validator. Состояние
 * прогресса (текущее задание/XP) владеет TaskProgressProvider — эта
 * панель только отображает его и вызывает advance(). Сама панель ничего
 * не проверяет и не считает: completed/errors целиком приходят из
 * task-engine.ts через провайдер.
 */
const STATUS_LABEL: Record<TaskStatus, string> = {
  [TaskStatus.NOT_STARTED]: "Не начато",
  [TaskStatus.IN_PROGRESS]: "В процессе",
  [TaskStatus.COMPLETED]: "Выполнено",
  [TaskStatus.FAILED]: "Не получилось",
};

const STATUS_COLOR: Record<TaskStatus, string> = {
  [TaskStatus.NOT_STARTED]: "text-slate-400 border-glass-border",
  [TaskStatus.IN_PROGRESS]: "text-amber-300 border-amber-400/40",
  [TaskStatus.COMPLETED]: "text-emerald-300 border-emerald-400/40",
  [TaskStatus.FAILED]: "text-red-400 border-red-400/40",
};

const DIFFICULTY_LABEL: Record<string, string> = { easy: "Легко", medium: "Средне", hard: "Сложно" };

export default function TaskPanel() {
  const { taskIndex, task, totalXp, status, result, isLastTask, advance } = useTaskProgress();

  return (
    <div className="glass-panel rounded-2xl p-4" data-testid="task-panel">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-mono text-xs uppercase tracking-widest text-slate-400">
          Задание {taskIndex + 1} / 6 · {DIFFICULTY_LABEL[task.difficulty]}
        </div>
        <div className="font-mono text-xs text-neon-violet" data-testid="task-xp">
          XP: {totalXp}
        </div>
      </div>

      <h3 className="text-base font-semibold text-slate-100" data-testid="task-title">
        {task.title}
      </h3>
      <p className="mt-1 text-sm text-slate-400">{task.description}</p>
      <p className="mt-1 text-xs text-slate-500">Цель: {task.goal}</p>

      <div
        className={`mt-3 rounded-xl border px-3 py-2 text-sm ${STATUS_COLOR[status]}`}
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
          <p className="text-emerald-300">✔ Задание выполнено (+{task.xpReward} XP)</p>
        ) : (
          <ul className="space-y-0.5" data-testid="task-error-list">
            {result.errors.map((e) => (
              <li key={e.code} className={e.critical ? "text-red-400" : "text-slate-300"}>
                ❌ {explainError(e.code, e.message)}
              </li>
            ))}
            {result.warnings.map((w) => (
              <li key={w} className="text-amber-300">
                ⚠ {w}
              </li>
            ))}
            {result.errors.length === 0 && result.warnings.length === 0 && (
              <li className="text-slate-500">Собери схему, чтобы увидеть проверку.</li>
            )}
          </ul>
        )}
      </div>

      <div className="mt-3 flex justify-end">
        <button
          onClick={advance}
          disabled={status !== TaskStatus.COMPLETED || isLastTask}
          data-testid="task-next-button"
          className="flex items-center gap-2 rounded-full border border-glass-border px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/5 disabled:opacity-40"
        >
          {isLastTask && status === TaskStatus.COMPLETED ? "Все задания пройдены" : "Следующее задание"}
          {!(isLastTask && status === TaskStatus.COMPLETED) && <ArrowRight size={16} />}
        </button>
      </div>
    </div>
  );
}
