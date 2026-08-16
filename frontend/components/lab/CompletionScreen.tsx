"use client";

import { motion } from "framer-motion";
import { Award } from "lucide-react";
import { useChemistryLabExperience } from "@/components/core/ChemistryLabExperienceProvider";
import { isExperimentUnlocked } from "@/lib/chemistry-lab-catalog";
import { useLocale } from "@/lib/locale-context";

/**
 * Chemistry World — Completion Screen / Assessment Report (Stage 5.6).
 * Отображает уже готовый AssessmentReport (chemistry-assessment.ts) —
 * ничего сама не оценивает.
 *
 * D6.2 — moved from `.glass-panel`/`slate-*` onto D1 tokens and
 * `useLocale()`/t.chemistry.completion.*. `category.explanation` (from the
 * assessment engine) and `recommended.title` (catalog data) stay
 * untranslated — see D6.1/D6.2 notes.
 */
export default function CompletionScreen() {
  const { t } = useLocale();
  const c = t.chemistry.completion;
  const { lastAssessment, lastNotebookEntry, completedExperimentIds, catalog } = useChemistryLabExperience();

  if (!lastAssessment || !lastNotebookEntry) return null;

  const recommended = catalog.find((e) => !completedExperimentIds.includes(e.id) && isExperimentUnlocked(e, completedExperimentIds));

  const categories = [
    { key: "completion", label: c.categoryCompletion, ...lastAssessment.completion },
    { key: "correctProcedure", label: c.categoryProcedure, ...lastAssessment.correctProcedure },
    { key: "safety", label: c.categorySafety, ...lastAssessment.safety },
    { key: "understanding", label: c.categoryUnderstanding, ...lastAssessment.understanding },
    { key: "observationQuality", label: c.categoryObservation, ...lastAssessment.observationQuality },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-ds-panel border border-success/40 bg-surface p-4"
      data-testid="completion-screen"
    >
      <div className="mb-3 flex items-center gap-2 text-success">
        <Award size={20} />
        <h3 className="text-ds-title">
          {c.titlePrefix}: {lastNotebookEntry.experimentTitle}
        </h3>
      </div>

      <div className="mb-3 text-ds-display text-text-primary" data-testid="completion-overall-score">
        {lastAssessment.overallScore}/100
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {categories.map((category) => (
          <div key={category.key} className="rounded-ds-control border border-border/[0.08] bg-surface-elevated p-2" data-testid={`completion-category-${category.key}`}>
            <div className="flex items-center justify-between text-ds-caption text-text-secondary">
              <span>{category.label}</span>
              <span className="font-mono text-text-primary">{category.score}</span>
            </div>
            <p className="mt-1 text-ds-caption text-text-muted">{category.explanation}</p>
          </div>
        ))}
      </div>

      {recommended && (
        <p className="text-ds-body text-text-secondary" data-testid="completion-recommendation">
          {c.recommendation}: <span className="text-accent">{recommended.title}</span>
        </p>
      )}
    </motion.div>
  );
}
