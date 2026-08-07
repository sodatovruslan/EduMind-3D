"use client";

import { motion } from "framer-motion";
import { Award, CheckCircle2, XCircle } from "lucide-react";
import { useElectricityLabExperience } from "@/components/core/ElectricityLabExperienceProvider";
import { isElectricityExperimentUnlocked } from "@/lib/electricity-lab-catalog";

/**
 * Electricity Lab — Automatic Laboratory Report (Stage E-2, Task 6).
 * Отображает уже готовую ElectricityNotebookEntry (electricity-notebook.ts)
 * — ничего сама не считает и не придумывает. Objective/Circuit
 * used/Measurements/Results/Analysis/Conclusion/Teacher notes — все поля
 * читаются напрямую из записи, построенной из реальных данных сессии.
 */
export default function ElectricityLabReportPanel() {
  const { lastNotebookEntry, completedExperimentIds, catalog } = useElectricityLabExperience();

  if (!lastNotebookEntry) return null;

  const recommended = catalog.find(
    (e) => !completedExperimentIds.includes(e.id) && isElectricityExperimentUnlocked(e, completedExperimentIds)
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel rounded-2xl border border-emerald-400/40 p-4"
      data-testid="electricity-lab-report"
    >
      <div className="mb-3 flex items-center gap-2 text-emerald-300">
        <Award size={20} />
        <h3 className="font-headline text-base font-semibold">Отчёт: {lastNotebookEntry.experimentTitle}</h3>
      </div>

      <div className="mb-3 text-3xl font-bold text-slate-100" data-testid="electricity-report-score">
        {lastNotebookEntry.score}/100
      </div>

      {/* Stage S9.6 — Assessment & Teacher Analytics: разбивка по 4
          категориям (electricity-assessment.ts) поверх итогового score
          выше — не заменяет его, а объясняет из чего он реально сложился. */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="electricity-report-assessment">
        {(
          [
            ["completion", "Завершение"],
            ["accuracy", "Точность"],
            ["safety", "Безопасность"],
            ["circuitBuilding", "Сборка цепи"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="rounded-lg border border-glass-border bg-white/5 p-2 text-center">
            <div className="font-mono text-lg font-semibold text-slate-100">{lastNotebookEntry.assessment[key].score}</div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      {/* Stage S9.6 — реальные счётчики попытки: сколько подсказок/ошибок/
          нарушений безопасности/самостоятельных исправлений и сколько
          заняло по времени — то, что раньше не сохранялось нигде. */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-slate-400" data-testid="electricity-report-evidence-summary">
        <span>Подсказок: {lastNotebookEntry.hintsUsed}</span>
        <span>Ошибок: {lastNotebookEntry.mistakesCount}</span>
        <span>Нарушений безопасности: {lastNotebookEntry.safetyIncidentsCount}</span>
        <span>Ошибок измерения: {lastNotebookEntry.measurementErrorsCount}</span>
        {lastNotebookEntry.selfCorrectionsCount > 0 && <span>Самостоятельно исправлено: {lastNotebookEntry.selfCorrectionsCount}</span>}
        {lastNotebookEntry.durationMs !== null && <span>Время: {Math.round(lastNotebookEntry.durationMs / 1000)} с</span>}
      </div>

      <div className="mb-3">
        <h4 className="mb-1 font-mono text-xs uppercase tracking-widest text-slate-400">Цель эксперимента</h4>
        <p className="text-sm text-slate-300">{lastNotebookEntry.objective}</p>
      </div>

      <div className="mb-3">
        <h4 className="mb-1 font-mono text-xs uppercase tracking-widest text-slate-400">Использованная цепь</h4>
        <p className="text-sm text-slate-300">
          Компоненты: {lastNotebookEntry.circuitUsed.componentKinds.join(", ")} · Соединений: {lastNotebookEntry.circuitUsed.connectionsCount}
        </p>
      </div>

      {lastNotebookEntry.measurements.length > 0 && (
        <div className="mb-3">
          <h4 className="mb-1 font-mono text-xs uppercase tracking-widest text-slate-400">Измерения</h4>
          <ul className="space-y-1 font-mono text-xs text-slate-300" data-testid="electricity-report-measurements">
            {lastNotebookEntry.measurements.map((m, i) => (
              <li key={i}>
                U = {m.voltageV.toFixed(2)} В · I = {m.currentA.toFixed(3)} А · R = {m.resistanceOhm.toFixed(1)} Ом · P = {m.powerW.toFixed(2)} Вт
              </li>
            ))}
          </ul>
        </div>
      )}

      {lastNotebookEntry.questionResults.length > 0 && (
        <div className="mb-3">
          <h4 className="mb-1 font-mono text-xs uppercase tracking-widest text-slate-400">Анализ (научные вопросы)</h4>
          <ul className="space-y-1 text-sm text-slate-300" data-testid="electricity-report-questions">
            {lastNotebookEntry.questionResults.map((q) => (
              <li key={q.questionId} className="flex items-start gap-1.5">
                {q.correct ? (
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden="true" />
                ) : (
                  <XCircle size={14} className="mt-0.5 shrink-0 text-red-400" aria-hidden="true" />
                )}
                <span className="sr-only">{q.correct ? "Верно: " : "Неверно: "}</span>
                {q.prompt}
              </li>
            ))}
          </ul>
        </div>
      )}

      {lastNotebookEntry.observations && (
        <div className="mb-3">
          <h4 className="mb-1 font-mono text-xs uppercase tracking-widest text-slate-400">Наблюдения</h4>
          <p className="text-sm text-slate-300">{lastNotebookEntry.observations}</p>
        </div>
      )}

      <div className="mb-3">
        <h4 className="mb-1 font-mono text-xs uppercase tracking-widest text-slate-400">Вывод</h4>
        <p className="text-sm text-slate-300">{lastNotebookEntry.conclusion || "—"}</p>
      </div>

      <div className="mb-3 rounded-xl border border-glass-border bg-white/5 p-3">
        <h4 className="mb-1 font-mono text-xs uppercase tracking-widest text-slate-400">Заметка преподавателя</h4>
        <p className="text-sm text-slate-300" data-testid="electricity-report-teacher-note">
          {lastNotebookEntry.teacherNote}
        </p>
      </div>

      {recommended && (
        <p className="text-sm text-slate-300" data-testid="electricity-report-recommendation">
          Рекомендуемая следующая работа: <span className="text-neon-violet">{recommended.title}</span>
        </p>
      )}
    </motion.div>
  );
}
