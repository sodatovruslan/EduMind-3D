"use client";

import { Clock, Play, RefreshCw, X } from "lucide-react";
import type { ChemistrySaveSnapshotV1 } from "@/lib/chemistry-save-schema";
import { useLocale } from "@/lib/locale-context";
import { INTL_LOCALE_TAG } from "@/lib/i18n/locales";

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
 *
 * D6.2 — moved from `.glass-panel`/`slate-*`/`neon-violet` onto D1 tokens
 * (solid `Surface`-style panel, not glass — dense structured data follows
 * the same glass-vs-solid rule as everywhere else in Design V2) and
 * `useLocale()`/t.chemistry.resume.*. The hardcoded `"ru-RU"` date format
 * now follows the active locale.
 */
export default function ResumeExperimentModal({
  isOpen,
  experimentTitle,
  saveSnapshot,
  onResume,
  onRestart,
  onCancel,
}: ResumeExperimentModalProps) {
  const { t, locale } = useLocale();
  const r = t.chemistry.resume;

  if (!isOpen || !saveSnapshot) return null;

  const formattedDate = new Date(saveSnapshot.updatedAt).toLocaleString(INTL_LOCALE_TAG[locale], {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const stepNumber = (saveSnapshot.experiment?.currentStepIndex ?? 0) + 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="resume-save-modal">
      <div className="w-full max-w-md rounded-ds-panel border border-accent/40 bg-surface-elevated p-6 shadow-ds-lg animate-in fade-in zoom-in-95 duration-200">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Clock className="text-accent" size={22} />
            <h3 className="font-headline text-lg font-semibold text-text-primary">{r.heading}</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={r.cancelButton}
            data-testid="resume-modal-close"
            className="ds-focus-ring rounded-ds-control text-text-muted transition-colors hover:text-text-primary"
          >
            <X size={20} />
          </button>
        </div>

        <p className="mb-4 text-sm text-text-secondary">
          {(() => {
            const [before, after] = r.body.split("{title}");
            return (
              <>
                {before}
                <strong className="text-text-primary">{experimentTitle}</strong>
                {after}
              </>
            );
          })()}
        </p>

        <div className="mb-6 rounded-ds-control border border-border/[0.08] bg-surface p-3.5 space-y-2 text-xs font-mono text-text-secondary">
          <div className="flex items-center justify-between">
            <span className="text-text-muted">{r.lastSaveLabel}</span>
            <span className="text-accent">{formattedDate}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-muted">{r.stepProgressLabel}</span>
            <span className="text-success">{r.stepValue.replace("{step}", String(stepNumber))}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-muted">{r.revisionLabel}</span>
            <span>#{saveSnapshot.revision}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            data-testid="resume-modal-cancel"
            className="ds-focus-ring rounded-full border border-border/[0.12] px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-text-primary/5"
          >
            {r.cancelButton}
          </button>

          <button
            type="button"
            onClick={onRestart}
            data-testid="resume-modal-restart"
            className="ds-focus-ring flex items-center justify-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-4 py-2 text-sm font-medium text-warning transition-colors hover:bg-warning/20"
          >
            <RefreshCw size={15} />
            {r.restartButton}
          </button>

          <button
            type="button"
            onClick={onResume}
            data-testid="resume-modal-continue"
            className="ds-focus-ring flex items-center justify-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-medium text-white shadow-ds-sm transition-all hover:brightness-110"
          >
            <Play size={15} className="fill-white" />
            {r.continueButton}
          </button>
        </div>
      </div>
    </div>
  );
}
