"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Clock, Award, ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";
import type { DeterministicAssessmentReport } from "@/lib/chemistry-assessment";

interface StudentFeedbackPanelProps {
  assessment: DeterministicAssessmentReport;
  onClose?: () => void;
}

export default function StudentFeedbackPanel({ assessment, onClose }: StudentFeedbackPanelProps) {
  const [showTimeline, setShowTimeline] = useState(true);

  return (
    <div className="bg-slate-900/95 backdrop-blur-md border border-slate-800 text-slate-100 rounded-xl p-6 shadow-2xl max-w-2xl w-full mx-auto my-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-sky-400 flex items-center gap-2">
            <Award className="w-6 h-6 text-amber-400" /> Отчёт о прохождении эксперимента
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Сессия: <span className="font-mono text-slate-300">{assessment.sessionId}</span>
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-extrabold text-amber-400">{assessment.overallScore} / 100</div>
          <span
            className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full mt-1 ${
              assessment.isComplete ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
            }`}
          >
            {assessment.isComplete ? "Эксперимент завершён" : "Эксперимент не завершён"}
          </span>
        </div>
      </div>

      {/* Criteria Breakdown */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Критерии оценки</h3>
        <div className="grid grid-cols-1 gap-2.5">
          {assessment.criteria.map((c) => (
            <div
              key={c.id}
              className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-3 flex items-start justify-between gap-3"
            >
              <div className="flex items-start gap-2.5">
                {c.status === "passed" && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />}
                {c.status === "incomplete" && <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />}
                {c.status === "failed" && <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />}
                <div>
                  <div className="text-sm font-semibold text-slate-200">{c.title}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{c.message}</div>
                  {c.evidenceEventIds.length > 0 && (
                    <div className="text-[10px] font-mono text-slate-500 mt-1">
                      Доказательства: {c.evidenceEventIds.join(", ")}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-sm font-bold text-slate-300 whitespace-nowrap">
                {c.scoreAwarded} / {c.maxScore}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Safety Violations */}
      {assessment.safetyViolations.length > 0 && (
        <div className="bg-rose-950/30 border border-rose-800/50 rounded-lg p-4 space-y-2">
          <h4 className="text-sm font-bold text-rose-400 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Нарушения техники безопасности ({assessment.safetyViolations.length})
          </h4>
          <ul className="space-y-1 text-xs text-rose-200 list-disc list-inside">
            {assessment.safetyViolations.map((v) => (
              <li key={v.code}>{v.description}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Student Timeline */}
      <div className="border-t border-slate-800 pt-4">
        <button
          onClick={() => setShowTimeline(!showTimeline)}
          className="flex items-center justify-between w-full text-xs font-semibold text-slate-300 uppercase tracking-wider hover:text-white transition-colors"
        >
          <span className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-sky-400" /> Пошаговая хронология сессии ({assessment.timelineSummary.length})
          </span>
          {showTimeline ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showTimeline && (
          <div className="mt-3 space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
            {assessment.timelineSummary.map((item) => (
              <div key={item.evidenceEventId} className="flex items-start gap-3 text-xs bg-slate-950/40 p-2 rounded border border-slate-850">
                <span className="font-mono text-sky-400 font-semibold shrink-0">{item.timestampStr}</span>
                <span className="text-slate-300 flex-1">{item.text}</span>
                <span className="font-mono text-[10px] text-slate-500 shrink-0">{item.evidenceEventId}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Action */}
      {onClose && (
        <div className="pt-2 text-center">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-medium text-sm rounded-lg shadow transition-colors"
          >
            Продолжить работу
          </button>
        </div>
      )}
    </div>
  );
}
