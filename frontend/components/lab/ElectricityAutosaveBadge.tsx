"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { electricityAutosaveEngine, type ElectricityAutosaveStatus } from "@/lib/electricity-autosave-engine";

/**
 * Electricity Lab — Autosave Status Badge (Stage S9.7). Тот же визуальный
 * язык, что и Chemistry World's AutosaveBadge.tsx, но проще: сохранение
 * идёт только в localStorage (см. electricity-autosave-engine.ts), поэтому
 * нет offline_pending/conflict — их физически не может произойти без сети.
 */
export default function ElectricityAutosaveBadge() {
  const [status, setStatus] = useState<ElectricityAutosaveStatus>(electricityAutosaveEngine.getStatus());
  const [savedDimmed, setSavedDimmed] = useState(false);

  useEffect(() => {
    return electricityAutosaveEngine.subscribe((s) => {
      setStatus(s);
      if (s === "saved") {
        setSavedDimmed(false);
        const t = setTimeout(() => setSavedDimmed(true), 3000);
        return () => clearTimeout(t);
      }
      setSavedDimmed(false);
    });
  }, []);

  if (status === "idle") return null;

  if (status === "pending" || status === "saving") {
    return (
      <div
        data-testid="electricity-autosave-badge-saving"
        className="flex items-center gap-1.5 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 font-mono text-xs text-cyan-300 transition-all"
        title="Сохранение прогресса…"
      >
        <Loader2 size={11} className="animate-spin text-cyan-400" />
        <span>Сохраняется…</span>
      </div>
    );
  }

  if (status === "saved") {
    return (
      <div
        data-testid="electricity-autosave-badge-saved"
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs transition-all duration-700 ${
          savedDimmed
            ? "border-emerald-600/20 bg-emerald-500/5 text-emerald-600/50"
            : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
        }`}
        title="Прогресс сохранён локально — можно продолжить после перезагрузки страницы"
      >
        <Check size={11} className={`transition-colors duration-700 ${savedDimmed ? "text-emerald-600/40" : "text-emerald-400"}`} />
        <span>Сохранено</span>
      </div>
    );
  }

  return (
    <div
      data-testid="electricity-autosave-badge-error"
      className="flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 font-mono text-xs text-rose-300 transition-all"
      title="Ошибка автосохранения"
    >
      <AlertTriangle size={11} className="text-rose-400" />
      <span>Ошибка сохранения</span>
    </div>
  );
}
