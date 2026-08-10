"use client";

import { Clock, Play, RefreshCw } from "lucide-react";
import type { ElectricitySaveSnapshotV1 } from "@/lib/electricity-save-schema";
import { useLocale } from "@/lib/locale-context";
import { INTL_LOCALE_TAG } from "@/lib/i18n/locales";

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
 *
 * D6.2 — same D1-token + useLocale() treatment as its Chemistry sibling.
 */
export default function ElectricityResumeModal({ experimentTitle, snapshot, onContinue, onStartOver }: ElectricityResumeModalProps) {
  const { t, locale } = useLocale();
  const r = t.electricity.resume;

  const formattedDate = new Date(snapshot.updatedAt).toLocaleString(INTL_LOCALE_TAG[locale], {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const stepNumber = snapshot.experiment.currentStepIndex + 1;
  const [bodyBefore, bodyAfter] = r.body.split("{title}");

  return (
    <div className="rounded-ds-panel border border-accent/40 bg-surface-elevated p-5" data-testid="electricity-resume-modal">
      <div className="mb-3 flex items-center gap-2">
        <Clock className="text-accent" size={20} />
        <h3 className="font-headline text-base font-semibold text-text-primary">{r.heading}</h3>
      </div>

      <p className="mb-3 text-sm text-text-secondary">
        {bodyBefore}
        <strong className="text-text-primary">{experimentTitle}</strong>
        {bodyAfter}
      </p>

      <div className="mb-4 space-y-1.5 rounded-ds-control border border-border/[0.08] bg-surface p-3 font-mono text-xs text-text-secondary">
        <div className="flex items-center justify-between">
          <span className="text-text-muted">{r.lastSaveLabel}</span>
          <span className="text-accent">{formattedDate}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-text-muted">{r.progressLabel}</span>
          <span className="text-success">{r.stepValue.replace("{step}", String(stepNumber))}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-text-muted">{r.revisionLabel}</span>
          <span>#{snapshot.revision}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onStartOver}
          data-testid="electricity-resume-restart"
          className="ds-focus-ring flex items-center justify-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-4 py-2 text-sm font-medium text-warning transition-colors hover:bg-warning/20"
        >
          <RefreshCw size={15} />
          {r.restartButton}
        </button>
        <button
          type="button"
          onClick={onContinue}
          data-testid="electricity-resume-continue"
          className="ds-focus-ring flex items-center justify-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-medium text-white shadow-ds-sm transition-all hover:brightness-110"
        >
          <Play size={15} className="fill-white" />
          {r.continueButton}
        </button>
      </div>
    </div>
  );
}
