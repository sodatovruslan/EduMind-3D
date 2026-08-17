"use client";

import { Phone, PhoneMissed, Video } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import { formatBubbleTime, parseUtcTimestamp } from "@/lib/messaging-time";
import type { Call } from "@/lib/call-client";

/**
 * T7 — a call's lifecycle folded into the conversation's own timeline
 * (brief §17), not a separate Calls page. Real Call records only, no
 * synthetic entries. Rendered as a compact centered log line (like a
 * system message), not a chat bubble — it isn't "from" either side.
 */
export default function CallHistoryEntry({ call }: { call: Call }) {
  const { t, locale } = useLocale();
  const missed = call.status === "missed" || call.status === "declined" || call.status === "cancelled";
  const Icon = missed ? PhoneMissed : call.call_type === "video" ? Video : Phone;
  const typeLabel = call.call_type === "video" ? t.calls.videoCall : t.calls.audioCall;

  return (
    <div className="flex justify-center py-1" data-testid={`call-history-${call.id}`}>
      <div
        className={`flex items-center gap-1.5 rounded-full border border-border/[0.1] px-3 py-1 text-ds-caption ${
          missed ? "text-danger" : "text-text-muted"
        }`}
      >
        <Icon size={12} aria-hidden="true" />
        <span>{typeLabel}</span>
        <span aria-hidden="true">·</span>
        <span>{outcomeLabel(call, t)}</span>
        <span aria-hidden="true">·</span>
        <span>{formatBubbleTime(call.created_at, locale)}</span>
      </div>
    </div>
  );
}

function outcomeLabel(call: Call, t: ReturnType<typeof useLocale>["t"]): string {
  switch (call.status) {
    case "missed":
      return t.calls.missed;
    case "declined":
      return t.calls.declined;
    case "cancelled":
      return t.calls.cancelled;
    case "ended":
      if (call.answered_at && call.ended_at) {
        const seconds = Math.max(0, Math.floor((parseUtcTimestamp(call.ended_at).getTime() - parseUtcTimestamp(call.answered_at).getTime()) / 1000));
        const minutes = Math.floor(seconds / 60);
        return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
      }
      return t.calls.callEnded;
    default:
      return "";
  }
}
