"use client";

import { Clock, Play, RefreshCw, X } from "lucide-react";
import type { ElectricitySaveSnapshotV1 } from "@/lib/electricity-save-schema";
import { useLocale } from "@/lib/locale-context";
import { INTL_LOCALE_TAG } from "@/lib/i18n/locales";

interface ElectricityResumeModalProps {
  experimentTitle: string;
  snapshot: ElectricitySaveSnapshotV1;
  onContinue: () => void;
  onStartOver: () => void;
  onCancel: () => void;
}

/**
 * Electricity Lab — Resume Save UI (Stage S9.7).
 *
 * D10 — unified with Chemistry World's `ResumeExperimentModal.tsx`: same
 * true overlay-modal treatment (`fixed inset-0` backdrop, close X, Cancel/
 * Restart/Continue action row) instead of the inline non-dismissable card
 * this used to be. This closes the real UX gap D9 found (Chemistry had 3
 * actions incl. Cancel, Electricity had 2 with no way to just look at the
 * catalog first) — WITHOUT inventing new backend capability: `onCancel`
 * only dismisses this confirmation for the current page load (see the
 * `dismissed` state in `ElectricityLabScene.tsx`'s
 * `ElectricityLabExperienceSection`), it does not discard the save. The
 * underlying data model is still genuinely different from Chemistry's (one
 * global `pendingResume` here vs. a real per-experiment active-save map
 * there — `useElectricityLabExperience` was not changed) — see
 * EDUMIND_DESIGN_SYSTEM_V2.md D10 notes for the documented remaining
 * asymmetry (no catalog-level "resume" badge on this side once dismissed).
 */
export default function ElectricityResumeModal({ experimentTitle, snapshot, onContinue, onStartOver, onCancel }: ElectricityResumeModalProps) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" data-testid="electricity-resume-modal">
      <div className="w-full max-w-md animate-in fade-in zoom-in-95 rounded-ds-panel border border-accent/40 bg-surface-elevated p-6 shadow-ds-lg duration-200">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Clock className="text-accent" size={22} />
            <h3 className="text-ds-title text-text-primary">{r.heading}</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={r.cancelButton}
            data-testid="electricity-resume-close"
            className="ds-focus-ring rounded-ds-control text-text-muted transition-colors hover:text-text-primary"
          >
            <X size={20} />
          </button>
        </div>

        <p className="mb-4 text-ds-body text-text-secondary">
          {bodyBefore}
          <strong className="text-text-primary">{experimentTitle}</strong>
          {bodyAfter}
        </p>

        <div className="mb-6 space-y-2 rounded-ds-control border border-border/[0.08] bg-surface p-3.5 font-mono text-ds-caption text-text-secondary">
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
            onClick={onCancel}
            data-testid="electricity-resume-cancel"
            className="ds-focus-ring rounded-full border border-border/[0.12] px-4 py-2 text-ds-body font-medium text-text-secondary transition-colors hover:bg-text-primary/5"
          >
            {r.cancelButton}
          </button>

          <button
            type="button"
            onClick={() => {
              if (window.confirm(r.restartConfirm)) onStartOver();
            }}
            data-testid="electricity-resume-restart"
            className="ds-focus-ring flex items-center justify-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-4 py-2 text-ds-body font-medium text-warning transition-colors hover:bg-warning/20"
          >
            <RefreshCw size={15} />
            {r.restartButton}
          </button>

          <button
            type="button"
            onClick={onContinue}
            data-testid="electricity-resume-continue"
            className="ds-focus-ring flex items-center justify-center gap-1.5 rounded-full bg-accent px-5 py-2 text-ds-body font-medium text-white shadow-ds-sm transition-all hover:brightness-110"
          >
            <Play size={15} className="fill-white" />
            {r.continueButton}
          </button>
        </div>
      </div>
    </div>
  );
}
