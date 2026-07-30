"use client";

import { useChemistryLabExperience } from "@/components/core/ChemistryLabExperienceProvider";
import { getModeConfig, LEARNING_MODES } from "@/lib/chemistry-lab-modes";

export default function LabModeSelector() {
  const { mode, setMode } = useChemistryLabExperience();
  return (
    <div className="flex items-center gap-1 font-mono text-xs" data-testid="lab-mode-selector">
      {LEARNING_MODES.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          data-testid={`lab-mode-${m}`}
          aria-pressed={mode === m}
          className={`rounded-full border px-3 py-1 uppercase transition focus:outline-none focus-visible:ring-2 focus-visible:ring-neon-violet ${
            mode === m ? "border-neon-violet text-neon-violet" : "border-glass-border text-slate-500 hover:text-slate-300"
          }`}
        >
          {getModeConfig(m).label}
        </button>
      ))}
    </div>
  );
}
