"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Clock, Loader2, WifiOff } from "lucide-react";
import { autosaveEngine, type AutosaveStatus } from "@/lib/autosave-engine";
import { useLocale } from "@/lib/locale-context";

/**
 * Chemistry World — Stage S-8 Autosave Status Badge
 *
 * D6.1 — moved onto useLocale()/t.chemistry.autosave.* (was 100% hardcoded
 * Russian) and onto D1 semantic accent tokens (text-accent-geo/success/
 * warning/danger instead of raw cyan/emerald/amber/rose) so the 4 status
 * colors stay meaningful but theme-aware. No status/timing logic touched.
 *
 * States shown to the user:
 *   idle           → not rendered (no active experiment)
 *   pending        → saving… (debounce window, immediate feedback)
 *   saving         → saving… (network flush in progress)
 *   saved          → saved (accent-success, fades to dimmed after 3s)
 *   offline_pending→ saved locally
 *   error          → save failed
 *   conflict       → version conflict
 */
export default function AutosaveBadge() {
  const { t } = useLocale();
  const a = t.chemistry.autosave;
  const [status, setStatus] = useState<AutosaveStatus>(autosaveEngine.getStatus());
  const [savedDimmed, setSavedDimmed] = useState(false);

  useEffect(() => {
    return autosaveEngine.subscribe((s) => {
      setStatus(s);
      if (s === "saved") {
        setSavedDimmed(false);
        const t = setTimeout(() => setSavedDimmed(true), 3000);
        return () => clearTimeout(t);
      } else {
        setSavedDimmed(false);
      }
    });
  }, []);

  // idle = no experiment active → render nothing
  if (status === "idle") return null;

  // pending + saving → same visual: animated spinner
  if (status === "pending" || status === "saving") {
    return (
      <div
        data-testid="autosave-badge-saving"
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
        data-testid="autosave-badge-saved"
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

  if (status === "offline_pending") {
    return (
      <div
        data-testid="autosave-badge-offline"
        className="flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 font-mono text-xs text-warning transition-all"
        title={a.offlineTitle}
      >
        <WifiOff size={11} />
        <span>{a.offline}</span>
      </div>
    );
  }

  if (status === "conflict") {
    return (
      <div
        data-testid="autosave-badge-conflict"
        className="flex items-center gap-1.5 rounded-full border border-danger/40 bg-danger/10 px-2.5 py-1 font-mono text-xs text-danger transition-all"
        title={a.conflictTitle}
      >
        <AlertTriangle size={11} />
        <span>{a.conflict}</span>
      </div>
    );
  }

  // error fallback
  return (
    <div
      data-testid="autosave-badge-error"
      className="flex items-center gap-1.5 rounded-full border border-danger/40 bg-danger/10 px-2.5 py-1 font-mono text-xs text-danger transition-all"
      title={a.errorTitle}
    >
      <Clock size={11} />
      <span>{a.error}</span>
    </div>
  );
}
