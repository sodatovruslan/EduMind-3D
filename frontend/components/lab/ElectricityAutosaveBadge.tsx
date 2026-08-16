"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { electricityAutosaveEngine, type ElectricityAutosaveStatus } from "@/lib/electricity-autosave-engine";
import { useLocale } from "@/lib/locale-context";

/**
 * Electricity Lab — Autosave Status Badge (Stage S9.7). Тот же визуальный
 * язык, что и Chemistry World's AutosaveBadge.tsx, но проще: сохранение
 * идёт только в localStorage (см. electricity-autosave-engine.ts), поэтому
 * нет offline_pending/conflict — их физически не может произойти без сети.
 *
 * D6.1 — moved onto useLocale()/t.electricity.autosave.* and D1 semantic
 * accent tokens, same as the Chemistry sibling.
 */
export default function ElectricityAutosaveBadge() {
  const { t } = useLocale();
  const a = t.electricity.autosave;
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
        className="flex items-center gap-1.5 rounded-full border border-accent-geo/40 bg-accent-geo/10 px-2.5 py-1 font-mono text-xs text-accent-geo transition-all"
        title={a.savingTitle}
      >
        <Loader2 size={11} className="animate-spin" />
        <span>{a.saving}</span>
      </div>
    );
  }

  if (status === "saved") {
    return (
      <div
        data-testid="electricity-autosave-badge-saved"
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs transition-all duration-700 ${
          savedDimmed ? "border-success/20 bg-success/5 text-success/50" : "border-success/40 bg-success/10 text-success"
        }`}
        title={a.savedTitle}
      >
        <Check size={11} />
        <span>{a.saved}</span>
      </div>
    );
  }

  return (
    <div
      data-testid="electricity-autosave-badge-error"
      className="flex items-center gap-1.5 rounded-full border border-danger/40 bg-danger/10 px-2.5 py-1 font-mono text-xs text-danger transition-all"
      title={a.errorTitle}
    >
      <AlertTriangle size={11} />
      <span>{a.error}</span>
    </div>
  );
}
