"use client";

import { useChemistryLabExperience } from "@/components/core/ChemistryLabExperienceProvider";
import { LEARNING_MODES, type LearningMode } from "@/lib/chemistry-lab-modes";
import { useLocale } from "@/lib/locale-context";

/**
 * D6.2 — moved from `neon-violet`/`glass-border`/`slate-*` onto D1 tokens.
 * Mode labels moved onto `useLocale()`/t.chemistry.hud.labMode* instead of
 * `getModeConfig(m).label` (which is hardcoded Russian in
 * lib/chemistry-lab-modes.ts) — that file itself isn't touched, only this
 * component's own display mapping, since only 3 short fixed labels
 * (Guided/Practice/Exam) are involved, not per-experiment catalog data.
 */
export default function LabModeSelector() {
  const { t } = useLocale();
  const { mode, setMode } = useChemistryLabExperience();
  const MODE_LABEL: Record<LearningMode, string> = {
    guided: t.chemistry.hud.labModeGuided,
    practice: t.chemistry.hud.labModePractice,
    exam: t.chemistry.hud.labModeExam,
  };
  return (
    <div className="flex items-center gap-1 font-mono text-xs" data-testid="lab-mode-selector">
      {LEARNING_MODES.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          data-testid={`lab-mode-${m}`}
          aria-pressed={mode === m}
          className={`ds-focus-ring rounded-full border px-3 py-1 uppercase transition-colors ${
            mode === m ? "border-accent text-accent" : "border-border/[0.12] text-text-muted hover:text-text-primary"
          }`}
        >
          {MODE_LABEL[m]}
        </button>
      ))}
    </div>
  );
}
