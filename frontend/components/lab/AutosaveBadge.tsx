"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, WifiOff } from "lucide-react";
import { autosaveEngine, type AutosaveStatus } from "@/lib/autosave-engine";

/**
 * Chemistry World — Stage S-8 Autosave Status Indicator Badge
 * Отображает реальный статус автосохранения («Сохраняется…», «Сохранено», «Сохранено локально», «Ошибка»).
 */
export default function AutosaveBadge() {
  const [status, setStatus] = useState<AutosaveStatus>(autosaveEngine.getStatus());

  useEffect(() => {
    return autosaveEngine.subscribe((s) => setStatus(s));
  }, []);

  if (status === "saved") {
    return (
      <div
        data-testid="autosave-badge-saved"
        className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-xs text-emerald-300 transition"
        title="Прогресс сохранен на сервере"
      >
        <Check size={12} />
        <span>Сохранено</span>
      </div>
    );
  }

  if (status === "saving") {
    return (
      <div
        data-testid="autosave-badge-saving"
        className="flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 font-mono text-xs text-cyan-300 transition"
        title="Сохранение прогресса..."
      >
        <Loader2 size={12} className="animate-spin text-cyan-400" />
        <span>Сохраняется…</span>
      </div>
    );
  }

  if (status === "offline_pending") {
    return (
      <div
        data-testid="autosave-badge-offline"
        className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-mono text-xs text-amber-300 transition"
        title="Нет соединения. Сохранено локально в IndexedDB"
      >
        <WifiOff size={12} className="text-amber-400" />
        <span>Сохранено локально</span>
      </div>
    );
  }

  if (status === "conflict") {
    return (
      <div
        data-testid="autosave-badge-conflict"
        className="flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 font-mono text-xs text-rose-300 transition"
        title="Конфликт версий сохранения на сервере"
      >
        <AlertTriangle size={12} className="text-rose-400" />
        <span>Конфликт версий</span>
      </div>
    );
  }

  return (
    <div
      data-testid="autosave-badge-error"
      className="flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 font-mono text-xs text-rose-300 transition"
      title="Ошибка автосохранения"
    >
      <AlertTriangle size={12} className="text-rose-400" />
      <span>Ошибка сохранения</span>
    </div>
  );
}
