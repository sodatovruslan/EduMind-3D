"use client";

import { motion } from "framer-motion";
import { Award } from "lucide-react";
import { useChemistryLabExperience } from "@/components/core/ChemistryLabExperienceProvider";
import { isExperimentUnlocked } from "@/lib/chemistry-lab-catalog";

/**
 * Chemistry World — Completion Screen / Assessment Report (Stage 5.6).
 * Отображает уже готовый AssessmentReport (chemistry-assessment.ts) —
 * ничего сама не оценивает.
 */
export default function CompletionScreen() {
  const { lastAssessment, lastNotebookEntry, completedExperimentIds, catalog } = useChemistryLabExperience();

  if (!lastAssessment || !lastNotebookEntry) return null;

  const recommended = catalog.find((e) => !completedExperimentIds.includes(e.id) && isExperimentUnlocked(e, completedExperimentIds));

  const categories = [
    { key: "completion", label: "Завершение", ...lastAssessment.completion },
    { key: "correctProcedure", label: "Процедура", ...lastAssessment.correctProcedure },
    { key: "safety", label: "Безопасность", ...lastAssessment.safety },
    { key: "understanding", label: "Понимание", ...lastAssessment.understanding },
    { key: "observationQuality", label: "Качество наблюдений", ...lastAssessment.observationQuality },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel rounded-2xl border border-emerald-400/40 p-4"
      data-testid="completion-screen"
    >
      <div className="mb-3 flex items-center gap-2 text-emerald-300">
        <Award size={20} />
        <h3 className="font-headline text-base font-semibold">Эксперимент завершён: {lastNotebookEntry.experimentTitle}</h3>
      </div>

      <div className="mb-3 text-3xl font-bold text-slate-100" data-testid="completion-overall-score">
        {lastAssessment.overallScore}/100
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {categories.map((category) => (
          <div key={category.key} className="rounded-lg border border-glass-border p-2" data-testid={`completion-category-${category.key}`}>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{category.label}</span>
              <span className="font-mono text-slate-200">{category.score}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{category.explanation}</p>
          </div>
        ))}
      </div>

      {recommended && (
        <p className="text-sm text-slate-300" data-testid="completion-recommendation">
          Рекомендуемый следующий эксперимент: <span className="text-neon-violet">{recommended.title}</span>
        </p>
      )}
    </motion.div>
  );
}
