"use client";

import { motion } from "framer-motion";
import { useChemistryTutorial } from "@/components/tutorial/ChemistryTutorialProvider";
import { useLocale } from "@/lib/locale-context";

/**
 * D6.2 — moved from `.glass-panel`/`slate-*`/`neon-violet` onto D1 tokens
 * and `useLocale()`/t.chemistry.tutorial.*. `currentInstruction` stays
 * untranslated — per-step tutorial DATA, not static chrome.
 */
export default function ChemistryTutorialPanel() {
  const { t } = useLocale();
  const u = t.chemistry.tutorial;
  const { active, stepIndex, totalSteps, currentInstruction, skipTutorial } = useChemistryTutorial();

  if (!active || !currentInstruction) return null;

  return (
    <motion.div
      key={stepIndex}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="rounded-ds-panel border border-accent/40 bg-surface p-4 sm:col-span-2"
      data-testid="chemistry-tutorial-panel"
      data-step={stepIndex}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="font-mono text-xs uppercase tracking-widest text-accent">
          {u.stepCounter.replace("{current}", String(stepIndex + 1)).replace("{total}", String(totalSteps))}
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={skipTutorial}
          data-testid="chemistry-tutorial-skip"
          className="ds-focus-ring rounded-ds-control font-mono text-xs text-text-muted underline-offset-2 transition-colors hover:text-text-secondary hover:underline"
        >
          {u.skipButton}
        </motion.button>
      </div>
      <p className="text-sm text-text-primary" data-testid="chemistry-tutorial-instruction">
        {currentInstruction}
      </p>
    </motion.div>
  );
}
