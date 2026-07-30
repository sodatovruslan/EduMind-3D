"use client";

import { motion } from "framer-motion";
import { useChemistryTutorial } from "@/components/tutorial/ChemistryTutorialProvider";

export default function ChemistryTutorialPanel() {
  const { active, stepIndex, totalSteps, currentInstruction, skipTutorial } = useChemistryTutorial();

  if (!active || !currentInstruction) return null;

  return (
    <motion.div
      key={stepIndex}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="glass-panel rounded-2xl border border-neon-violet/40 p-4 sm:col-span-2"
      data-testid="chemistry-tutorial-panel"
      data-step={stepIndex}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="font-mono text-xs uppercase tracking-widest text-neon-violet">
          Обучение · Шаг {stepIndex + 1} / {totalSteps}
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={skipTutorial}
          data-testid="chemistry-tutorial-skip"
          className="font-mono text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
        >
          Пропустить обучение
        </motion.button>
      </div>
      <p className="text-sm text-slate-200" data-testid="chemistry-tutorial-instruction">
        {currentInstruction}
      </p>
    </motion.div>
  );
}
