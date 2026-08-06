"use client";

import { Clock, Play, RefreshCw, X } from "lucide-react";
import type { ChemistrySaveSnapshotV1 } from "@/lib/chemistry-save-schema";

interface ResumeExperimentModalProps {
  isOpen: boolean;
  experimentTitle: string;
  saveSnapshot: ChemistrySaveSnapshotV1 | null;
  onResume: () => void;
  onRestart: () => void;
  onCancel: () => void;
}

/**
 * Chemistry World — Stage S-8 Resume Experiment Modal
 * Модальное окно подтверждения продолжения или сброса эксперимента при обнаружении сохранения.
 */
export default function ResumeExperimentModal({
  isOpen,
  experimentTitle,
  saveSnapshot,
  onResume,
  onRestart,
  onCancel,
}: ResumeExperimentModalProps) {
  if (!isOpen || !saveSnapshot) return null;

  const formattedDate = new Date(saveSnapshot.updatedAt).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const stepNumber = (saveSnapshot.experiment?.currentStepIndex ?? 0) + 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="resume-save-modal">
      <div className="glass-panel w-full max-w-md rounded-2xl border border-neon-violet/50 p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Clock className="text-neon-violet" size={22} />
            <h3 className="font-headline text-lg font-semibold text-slate-100">Найдено сохранение эксперимента</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            data-testid="resume-modal-close"
            className="text-slate-400 hover:text-slate-200 focus:outline-none"
          >
            <X size={20} />
          </button>
        </div>

        <p className="mb-4 text-sm text-slate-300">
          У тебя есть сохранённый прогресс по эксперименту <strong className="text-slate-100">{experimentTitle}</strong>.
        </p>

        <div className="mb-6 rounded-xl border border-glass-border bg-white/5 p-3.5 space-y-2 text-xs font-mono text-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Последнее сохранение:</span>
            <span className="text-neon-violet">{formattedDate}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Прогресс шагов:</span>
            <span className="text-emerald-400">Шаг {stepNumber}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Ревизия:</span>
            <span>#{saveSnapshot.revision}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            data-testid="resume-modal-cancel"
            className="rounded-full border border-glass-border px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/5 focus:outline-none"
          >
            Отмена
          </button>

          <button
            type="button"
            onClick={onRestart}
            data-testid="resume-modal-restart"
            className="flex items-center justify-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-500/20 focus:outline-none"
          >
            <RefreshCw size={15} />
            Начать заново
          </button>

          <button
            type="button"
            onClick={onResume}
            data-testid="resume-modal-continue"
            className="flex items-center justify-center gap-1.5 rounded-full bg-neon-violet px-5 py-2 text-sm font-medium text-white shadow-lg hover:brightness-110 focus:outline-none"
          >
            <Play size={15} className="fill-white" />
            Продолжить
          </button>
        </div>
      </div>
    </div>
  );
}
