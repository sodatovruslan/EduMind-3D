"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Clock, Loader2, WifiOff } from "lucide-react";
import { autosaveEngine, type AutosaveStatus } from "@/lib/autosave-engine";

/**
 * Chemistry World — Stage S-8 Autosave Status Badge
 *
 * States shown to the user:
 *   idle           → not rendered (no active experiment)
 *   pending        → «Сохраняется…» (debounce window, immediate feedback)
 *   saving         → «Сохраняется…» (network flush in progress)
 *   saved          → «Сохранено» (green, fades to dimmed after 3s)
 *   offline_pending→ «Сохранено локально»
 *   error          → «Ошибка сохранения»
 *   conflict       → «Конфликт версий»
 */
export default function AutosaveBadge() {
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

  // pending + saving → same visual: animated spinner "Сохраняется…"
  if (status === "pending" || status === "saving") {
    return (
      <div
        data-testid="autosave-badge-saving"
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
        data-testid="autosave-badge-saved"
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs transition-all duration-700 ${
          savedDimmed
            ? "border-emerald-600/20 bg-emerald-500/5 text-emerald-600/50"
            : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
        }`}
        title="Прогресс сохранён на сервере"
      >
        <Check
          size={11}
          className={`transition-colors duration-700 ${savedDimmed ? "text-emerald-600/40" : "text-emerald-400"}`}
        />
        <span>Сохранено</span>
      </div>
    );
  }

  if (status === "offline_pending") {
    return (
      <div
        data-testid="autosave-badge-offline"
        className="flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 font-mono text-xs text-amber-300 transition-all"
        title="Нет соединения. Прогресс сохранён локально в IndexedDB — синхронизируется при восстановлении сети"
      >
        <WifiOff size={11} className="text-amber-400" />
        <span>Сохранено локально</span>
      </div>
    );
  }

  if (status === "conflict") {
    return (
      <div
        data-testid="autosave-badge-conflict"
        className="flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 font-mono text-xs text-rose-300 transition-all"
        title="Конфликт версий: другая вкладка или устройство обновило сохранение"
      >
        <AlertTriangle size={11} className="text-rose-400" />
        <span>Конфликт версий</span>
      </div>
    );
  }

  // error fallback
  return (
    <div
      data-testid="autosave-badge-error"
      className="flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 font-mono text-xs text-rose-300 transition-all"
      title="Ошибка автосохранения — проверьте соединение"
    >
      <Clock size={11} className="text-rose-400" />
      <span>Ошибка сохранения</span>
    </div>
  );
}
