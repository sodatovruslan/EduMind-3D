"use client";

import { Clock, Play, RefreshCw } from "lucide-react";
import type { ElectricitySaveSnapshotV1 } from "@/lib/electricity-save-schema";

interface ElectricityResumeModalProps {
  experimentTitle: string;
  snapshot: ElectricitySaveSnapshotV1;
  onContinue: () => void;
  onStartOver: () => void;
}

/**
 * Electricity Lab — Resume Save UI (Stage S9.7). Тот же паттерн, что и
 * Chemistry World's ResumeExperimentModal.tsx — минимальный UX (просто
 * "Продолжить"/"Начать заново"), без переизобретения дизайна лаборатории.
 * Не модальное окно поверх сцены, а карточка на месте каталога работ (нет
 * отдельного onCancel — пока не выбрано ни одно из двух действий, каталог
 * просто не показывается, ровно как и раньше при selectedExperiment).
 */
export default function ElectricityResumeModal({ experimentTitle, snapshot, onContinue, onStartOver }: ElectricityResumeModalProps) {
  const formattedDate = new Date(snapshot.updatedAt).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const stepNumber = snapshot.experiment.currentStepIndex + 1;

  return (
    <div className="glass-panel rounded-2xl border border-neon-violet/50 p-5" data-testid="electricity-resume-modal">
      <div className="mb-3 flex items-center gap-2">
        <Clock className="text-neon-violet" size={20} />
        <h3 className="font-headline text-base font-semibold text-slate-100">Найдено незавершённое сохранение</h3>
      </div>

      <p className="mb-3 text-sm text-slate-300">
        У тебя есть сохранённый прогресс по работе <strong className="text-slate-100">{experimentTitle}</strong>.
      </p>

      <div className="mb-4 space-y-1.5 rounded-xl border border-glass-border bg-white/5 p-3 font-mono text-xs text-slate-300">
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Последнее сохранение:</span>
          <span className="text-neon-violet">{formattedDate}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Прогресс:</span>
          <span className="text-emerald-400">Шаг {stepNumber}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Ревизия:</span>
          <span>#{snapshot.revision}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onStartOver}
          data-testid="electricity-resume-restart"
          className="flex items-center justify-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <RefreshCw size={15} />
          Начать заново
        </button>
        <button
          type="button"
          onClick={onContinue}
          data-testid="electricity-resume-continue"
          className="flex items-center justify-center gap-1.5 rounded-full bg-neon-violet px-5 py-2 text-sm font-medium text-white shadow-lg hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <Play size={15} className="fill-white" />
          Продолжить
        </button>
      </div>
    </div>
  );
}
