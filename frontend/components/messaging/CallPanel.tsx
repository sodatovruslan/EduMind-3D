"use client";

import { useEffect, useState } from "react";
import { Phone, PhoneOff, Video, X } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import type { Call } from "@/lib/call-client";
import { GlassPanel } from "@/components/design-system";

/**
 * T7 — call lifecycle panel: outgoing ringing, incoming ringing,
 * connected, and a brief flash for each terminal state (declined /
 * cancelled / missed / ended), auto-dismissed by the caller
 * (useCallSession.ts). Rendered INLINE above the message list, not a
 * full-screen takeover (brief §7: "не ломать весь AppShell"). No fake
 * video/camera preview, no getUserMedia/getDisplayMedia anywhere in this
 * component — see its own §32 privacy constraint. Design V2 tokens only.
 */
export default function CallPanel({
  call,
  currentUserId,
  onAccept,
  onDecline,
  onCancel,
  onEnd,
}: {
  call: Call;
  currentUserId: string | undefined;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => void;
  onEnd: () => void;
}) {
  const { t } = useLocale();
  const isCaller = call.caller.id === currentUserId;
  const otherParty = isCaller ? call.callee : call.caller;
  const TypeIcon = call.call_type === "video" ? Video : Phone;
  const typeLabel = call.call_type === "video" ? t.calls.videoCall : t.calls.audioCall;

  return (
    <GlassPanel className="mb-3 p-4" role="status" aria-live="polite" data-testid="call-panel">
      {call.status === "ringing" && isCaller && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <TypeIcon size={20} className="shrink-0 text-accent" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate text-ds-body font-medium text-text-primary">{otherParty.full_name}</p>
              <p className="text-ds-caption text-text-muted">{t.calls.calling}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t.calls.cancel}
            data-testid="call-cancel"
            className="ds-focus-ring flex shrink-0 items-center gap-1.5 rounded-full bg-danger/10 px-3 py-1.5 text-ds-caption font-medium text-danger transition-colors hover:bg-danger/20"
          >
            <X size={14} /> {t.calls.cancel}
          </button>
        </div>
      )}

      {call.status === "ringing" && !isCaller && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <TypeIcon size={20} className="shrink-0 text-accent" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate text-ds-body font-medium text-text-primary">{otherParty.full_name}</p>
              <p className="truncate text-ds-caption text-text-muted">
                {t.calls.incomingCall} · {typeLabel}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onDecline}
              aria-label={t.calls.decline}
              data-testid="call-decline"
              className="ds-focus-ring flex items-center gap-1.5 rounded-full bg-danger/10 px-3 py-1.5 text-ds-caption font-medium text-danger transition-colors hover:bg-danger/20"
            >
              <PhoneOff size={14} /> {t.calls.decline}
            </button>
            <button
              type="button"
              onClick={onAccept}
              aria-label={t.calls.accept}
              data-testid="call-accept"
              className="ds-focus-ring flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1.5 text-ds-caption font-medium text-success transition-colors hover:bg-success/25"
            >
              <Phone size={14} /> {t.calls.accept}
            </button>
          </div>
        </div>
      )}

      {call.status === "accepted" && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <TypeIcon size={20} className="shrink-0 text-success" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate text-ds-body font-medium text-text-primary">{otherParty.full_name}</p>
              <p className="truncate text-ds-caption text-text-muted">
                {t.calls.connected}
                {call.answered_at && (
                  <>
                    {" · "}
                    <CallDuration answeredAt={call.answered_at} />
                  </>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onEnd}
            aria-label={t.calls.endCall}
            data-testid="call-end"
            className="ds-focus-ring flex shrink-0 items-center gap-1.5 rounded-full bg-danger/10 px-3 py-1.5 text-ds-caption font-medium text-danger transition-colors hover:bg-danger/20"
          >
            <PhoneOff size={14} /> {t.calls.endCall}
          </button>
        </div>
      )}
      {call.status === "accepted" && <p className="mt-2 text-ds-caption text-text-muted">{t.calls.mediaComingSoon}</p>}

      {(call.status === "declined" || call.status === "cancelled" || call.status === "missed" || call.status === "ended") && (
        <div className="flex min-w-0 items-center gap-3" data-testid="call-terminal-state">
          <TypeIcon size={20} className="shrink-0 text-text-muted" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-ds-body font-medium text-text-primary">{otherParty.full_name}</p>
            <p className="text-ds-caption text-text-muted">{terminalLabel(call.status, t)}</p>
          </div>
        </div>
      )}
    </GlassPanel>
  );
}

function terminalLabel(status: Call["status"], t: ReturnType<typeof useLocale>["t"]): string {
  switch (status) {
    case "declined":
      return t.calls.declined;
    case "cancelled":
      return t.calls.cancelled;
    case "missed":
      return t.calls.missed;
    case "ended":
      return t.calls.callEnded;
    default:
      return "";
  }
}

function CallDuration({ answeredAt }: { answeredAt: string }) {
  const [, forceTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const seconds = Math.max(0, Math.floor((Date.now() - new Date(answeredAt).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return <span data-testid="call-duration">{`${minutes}:${String(remainder).padStart(2, "0")}`}</span>;
}
