"use client";

import { motion } from "framer-motion";
import { Award, CheckCircle2, XCircle } from "lucide-react";
import { useElectricityLabExperience } from "@/components/core/ElectricityLabExperienceProvider";
import { isElectricityExperimentUnlocked } from "@/lib/electricity-lab-catalog";
import { useLocale } from "@/lib/locale-context";

/**
 * Electricity Lab — Automatic Laboratory Report (Stage E-2, Task 6).
 * Отображает уже готовую ElectricityNotebookEntry (electricity-notebook.ts)
 * — ничего сама не считает и не придумывает. Objective/Circuit
 * used/Measurements/Results/Analysis/Conclusion/Teacher notes — все поля
 * читаются напрямую из записи, построенной из реальных данных сессии.
 *
 * D6.2 — moved from `.glass-panel`/`slate-*`/`bg-white/5` onto D1 tokens
 * and `useLocale()`/t.electricity.report.*. `lastNotebookEntry.objective`/
 * `.observations`/`.conclusion`/`.teacherNote`/question prompts and
 * `recommended.title` stay untranslated — real per-session DATA, not
 * static chrome (see D6.1/D6.2 notes).
 */
export default function ElectricityLabReportPanel() {
  const { t } = useLocale();
  const r = t.electricity.report;
  const { lastNotebookEntry, completedExperimentIds, catalog } = useElectricityLabExperience();

  if (!lastNotebookEntry) return null;

  const recommended = catalog.find(
    (e) => !completedExperimentIds.includes(e.id) && isElectricityExperimentUnlocked(e, completedExperimentIds)
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-ds-panel border border-success/40 bg-surface p-4"
      data-testid="electricity-lab-report"
    >
      <div className="mb-3 flex items-center gap-2 text-success">
        <Award size={20} />
        <h3 className="text-ds-title">
          {r.titlePrefix}: {lastNotebookEntry.experimentTitle}
        </h3>
      </div>

      <div className="mb-3 text-ds-display text-text-primary" data-testid="electricity-report-score">
        {lastNotebookEntry.score}/100
      </div>

      {/* Stage S9.6 — Assessment & Teacher Analytics: разбивка по 4
          категориям (electricity-assessment.ts) поверх итогового score
          выше — не заменяет его, а объясняет из чего он реально сложился. */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="electricity-report-assessment">
        {(
          [
            ["completion", r.categoryCompletion],
            ["accuracy", r.categoryAccuracy],
            ["safety", r.categorySafety],
            ["circuitBuilding", r.categoryCircuitBuilding],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="rounded-ds-control border border-border/[0.08] bg-surface-elevated p-2 text-center">
            <div className="font-mono text-ds-title text-text-primary">{lastNotebookEntry.assessment[key].score}</div>
            <div className="text-ds-caption uppercase tracking-widest text-text-muted">{label}</div>
          </div>
        ))}
      </div>

      {/* Stage S9.6 — реальные счётчики попытки: сколько подсказок/ошибок/
          нарушений безопасности/самостоятельных исправлений и сколько
          заняло по времени — то, что раньше не сохранялось нигде. */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-ds-caption text-text-secondary" data-testid="electricity-report-evidence-summary">
        <span>{r.hintsLabel} {lastNotebookEntry.hintsUsed}</span>
        <span>{r.mistakesLabel} {lastNotebookEntry.mistakesCount}</span>
        <span>{r.safetyIncidentsLabel} {lastNotebookEntry.safetyIncidentsCount}</span>
        <span>{r.measurementErrorsLabel} {lastNotebookEntry.measurementErrorsCount}</span>
        {lastNotebookEntry.selfCorrectionsCount > 0 && <span>{r.selfCorrectionsLabel} {lastNotebookEntry.selfCorrectionsCount}</span>}
        {lastNotebookEntry.durationMs !== null && (
          <span>{r.durationLabel.replace("{seconds}", String(Math.round(lastNotebookEntry.durationMs / 1000)))}</span>
        )}
      </div>

      <div className="mb-3">
        <h4 className="mb-1 font-mono text-ds-caption uppercase tracking-widest text-text-muted">{r.objectiveHeading}</h4>
        <p className="text-ds-body text-text-secondary">{lastNotebookEntry.objective}</p>
      </div>

      <div className="mb-3">
        <h4 className="mb-1 font-mono text-ds-caption uppercase tracking-widest text-text-muted">{r.circuitUsedHeading}</h4>
        <p className="text-ds-body text-text-secondary">
          {r.circuitUsedText
            .replace("{components}", lastNotebookEntry.circuitUsed.componentKinds.join(", "))
            .replace("{count}", String(lastNotebookEntry.circuitUsed.connectionsCount))}
        </p>
      </div>

      {lastNotebookEntry.measurements.length > 0 && (
        <div className="mb-3">
          <h4 className="mb-1 font-mono text-ds-caption uppercase tracking-widest text-text-muted">{r.measurementsHeading}</h4>
          <ul className="space-y-1 font-mono text-ds-caption text-text-secondary" data-testid="electricity-report-measurements">
            {lastNotebookEntry.measurements.map((m, i) => (
              <li key={i}>
                U = {m.voltageV.toFixed(2)} {r.unitVolt} · I = {m.currentA.toFixed(3)} {r.unitAmpere} · R = {m.resistanceOhm.toFixed(1)} {r.unitOhm} · P ={" "}
                {m.powerW.toFixed(2)} {r.unitWatt}
              </li>
            ))}
          </ul>
        </div>
      )}

      {lastNotebookEntry.questionResults.length > 0 && (
        <div className="mb-3">
          <h4 className="mb-1 font-mono text-ds-caption uppercase tracking-widest text-text-muted">{r.analysisHeading}</h4>
          <ul className="space-y-1 text-ds-body text-text-secondary" data-testid="electricity-report-questions">
            {lastNotebookEntry.questionResults.map((q) => (
              <li key={q.questionId} className="flex items-start gap-1.5">
                {q.correct ? (
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                ) : (
                  <XCircle size={14} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
                )}
                <span className="sr-only">{q.correct ? r.correctLabel : r.incorrectLabel}</span>
                {q.prompt}
              </li>
            ))}
          </ul>
        </div>
      )}

      {lastNotebookEntry.observations && (
        <div className="mb-3">
          <h4 className="mb-1 font-mono text-ds-caption uppercase tracking-widest text-text-muted">{r.observationsHeading}</h4>
          <p className="text-ds-body text-text-secondary">{lastNotebookEntry.observations}</p>
        </div>
      )}

      <div className="mb-3">
        <h4 className="mb-1 font-mono text-ds-caption uppercase tracking-widest text-text-muted">{r.conclusionHeading}</h4>
        <p className="text-ds-body text-text-secondary">{lastNotebookEntry.conclusion || r.conclusionFallback}</p>
      </div>

      <div className="mb-3 rounded-ds-control border border-border/[0.08] bg-surface-elevated p-3">
        <h4 className="mb-1 font-mono text-ds-caption uppercase tracking-widest text-text-muted">{r.teacherNoteHeading}</h4>
        <p className="text-ds-body text-text-secondary" data-testid="electricity-report-teacher-note">
          {lastNotebookEntry.teacherNote}
        </p>
      </div>

      {recommended && (
        <p className="text-ds-body text-text-secondary" data-testid="electricity-report-recommendation">
          {r.recommendation}: <span className="text-accent">{recommended.title}</span>
        </p>
      )}
    </motion.div>
  );
}
