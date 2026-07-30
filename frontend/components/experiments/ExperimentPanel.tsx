"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, XCircle } from "lucide-react";
import { ExperimentStatus } from "@/lib/experiment-validator";
import { useExperimentProgress } from "@/components/experiments/ExperimentProgressProvider";

/**
 * Chemistry World — UI поверх Experiment Validator, тот же принцип, что и
 * TaskPanel.tsx в Electricity Lab: панель ничего не проверяет и не
 * считает сама, completed/errors целиком приходят из experiment-validator.ts
 * через ExperimentProgressProvider.
 */
const STATUS_LABEL: Record<ExperimentStatus, string> = {
  [ExperimentStatus.NOT_STARTED]: "Не начато",
  [ExperimentStatus.IN_PROGRESS]: "В процессе",
  [ExperimentStatus.COMPLETED]: "Выполнено",
  [ExperimentStatus.FAILED]: "Не получилось",
};

const STATUS_COLOR: Record<ExperimentStatus, string> = {
  [ExperimentStatus.NOT_STARTED]: "text-slate-400 border-glass-border",
  [ExperimentStatus.IN_PROGRESS]: "text-amber-300 border-amber-400/40",
  [ExperimentStatus.COMPLETED]: "text-emerald-300 border-emerald-400/40",
  [ExperimentStatus.FAILED]: "text-red-400 border-red-400/40",
};

const DIFFICULTY_LABEL: Record<string, string> = { easy: "Легко", medium: "Средне", hard: "Сложно" };

export default function ExperimentPanel() {
  const { experimentIndex, experiment, totalXp, status, result, isLastExperiment, advance } = useExperimentProgress();

  return (
    <div className="glass-panel rounded-2xl p-4" data-testid="experiment-panel">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-mono text-xs uppercase tracking-widest text-slate-400">
          Эксперимент {experimentIndex + 1} / 4 · {DIFFICULTY_LABEL[experiment.difficulty]}
        </div>
        <div className="font-mono text-xs text-neon-violet" data-testid="experiment-xp">
          XP: {totalXp}
        </div>
      </div>

      <h3 className="text-base font-semibold text-slate-100" data-testid="experiment-title">
        {experiment.title}
      </h3>
      <p className="mt-1 text-sm text-slate-400">{experiment.description}</p>
      <p className="mt-1 text-xs text-slate-500">Цель: {experiment.goal}</p>

      <div
        className={`mt-3 rounded-xl border px-3 py-2 text-sm ${STATUS_COLOR[status]}`}
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
          <p className="text-emerald-300">✔ Эксперимент выполнен (+{experiment.xpReward} XP)</p>
        ) : (
          <ul className="space-y-0.5" data-testid="experiment-error-list">
            {result.errors.map((e) => (
              <li key={e.code} className={e.critical ? "text-red-400" : "text-slate-300"}>
                ❌ {e.message}
              </li>
            ))}
            {result.errors.length === 0 && <li className="text-slate-500">Начни эксперимент, чтобы увидеть проверку.</li>}
          </ul>
        )}
      </div>

      <div className="mt-3 flex justify-end">
        <button
          onClick={advance}
          disabled={status !== ExperimentStatus.COMPLETED || isLastExperiment}
          data-testid="experiment-next-button"
          className="flex items-center gap-2 rounded-full border border-glass-border px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/5 disabled:opacity-40"
        >
          {isLastExperiment && status === ExperimentStatus.COMPLETED ? "Все эксперименты пройдены" : "Следующий эксперимент"}
          {!(isLastExperiment && status === ExperimentStatus.COMPLETED) && <ArrowRight size={16} />}
        </button>
      </div>
    </div>
  );
}
