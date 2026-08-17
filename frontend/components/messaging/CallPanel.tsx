"use client";

import { useEffect, useState } from "react";
import { Phone, PhoneOff, Video, X } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import type { Call } from "@/lib/call-client";
import type { MediaConnectionState, MediaErrorReason } from "@/lib/useWebRTCSession";
import { GlassPanel } from "@/components/design-system";
import CallMediaSurface from "./CallMediaSurface";

/**
 * T7 — call lifecycle panel: outgoing ringing, incoming ringing, and a
 * brief flash for each terminal state (declined / cancelled / missed /
 * ended), auto-dismissed by the caller (useCallSession.ts). Rendered
 * INLINE above the message list, not a full-screen takeover (brief §7:
 * "не ломать весь AppShell"). Design V2 tokens only.
 *
 * T8 — the ACCEPTED branch now distinguishes T7's call.status from the
 * real WebRTC `mediaState` (brief §23: "Call accepted / Connecting
 * media..." vs "Connected" are different things) — acquiring
 * camera/mic, negotiating the peer connection, actually connected
 * (real `CallMediaSurface`), a media error, "active in another tab", or
 * (after a refresh) an explicit reconnect prompt, never automatic.
 */
export default function CallPanel({
  call,
  currentUserId,
  onAccept,
  onDecline,
  onCancel,
  onEnd,
  mediaState,
  localStream,
  remoteStream,
  isAudioMuted,
  isVideoDisabled,
  remoteAudioMuted,
  remoteVideoDisabled,
  mediaError,
  isMediaOwner,
  onToggleMute,
  onToggleCamera,
  onReconnectToCall,
}: {
  call: Call;
  currentUserId: string | undefined;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => void;
  onEnd: () => void;
  mediaState: MediaConnectionState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isAudioMuted: boolean;
  isVideoDisabled: boolean;
  remoteAudioMuted: boolean;
  remoteVideoDisabled: boolean;
  mediaError: MediaErrorReason | null;
  isMediaOwner: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onReconnectToCall: () => void;
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

      {call.status === "accepted" && isMediaOwner && mediaState === "connected" && (
        <>
          <CallMediaSurface
            call={call}
            isCaller={isCaller}
            localStream={localStream}
            remoteStream={remoteStream}
            isAudioMuted={isAudioMuted}
            isVideoDisabled={isVideoDisabled}
            remoteAudioMuted={remoteAudioMuted}
            remoteVideoDisabled={remoteVideoDisabled}
            onToggleMute={onToggleMute}
            onToggleCamera={onToggleCamera}
            onEnd={onEnd}
          />
          {call.answered_at && (
            <p className="mt-2 text-center text-ds-caption text-text-muted">
              <CallDuration answeredAt={call.answered_at} />
            </p>
          )}
        </>
      )}

      {call.status === "accepted" && !(isMediaOwner && mediaState === "connected") && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <TypeIcon size={20} className="shrink-0 text-success" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate text-ds-body font-medium text-text-primary">{otherParty.full_name}</p>
              <p className="truncate text-ds-caption text-text-muted">
                {isMediaOwner ? intermediateMediaLabel(mediaState, mediaError, t) : t.calls.mediaOwnedElsewhere}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isMediaOwner && mediaState === "needs-reconnect" && (
              <button
                type="button"
                onClick={onReconnectToCall}
                aria-label={t.calls.reconnectToCall}
                data-testid="reconnect-to-call"
                className="ds-focus-ring flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1.5 text-ds-caption font-medium text-accent transition-colors hover:bg-accent/25"
              >
                {t.calls.reconnectToCall}
              </button>
            )}
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
        </div>
      )}

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

function intermediateMediaLabel(
  mediaState: MediaConnectionState,
  mediaError: MediaErrorReason | null,
  t: ReturnType<typeof useLocale>["t"]
): string {
  if (mediaState === "failed") return mediaErrorLabel(mediaError, t);
  switch (mediaState) {
    case "needs-reconnect":
      return t.calls.needsReconnect;
    case "acquiring-media":
      return t.calls.acquiringMedia;
    case "connecting":
      return t.calls.connectingMedia;
    default:
      return t.calls.connectingMedia;
  }
}

function mediaErrorLabel(reason: MediaErrorReason | null, t: ReturnType<typeof useLocale>["t"]): string {
  switch (reason) {
    case "permission-denied":
      return t.calls.permissionDenied;
    case "device-not-found":
      return t.calls.deviceNotFound;
    case "device-unavailable":
      return t.calls.deviceUnavailable;
    case "constraints-not-satisfiable":
      return t.calls.deviceUnavailable;
    case "connection-timeout":
      return t.calls.connectionTimeout;
    case "connection-failed":
      return t.calls.connectionFailed;
    case "remote-media-failed":
      return t.calls.remoteMediaFailed;
    default:
      return t.calls.connectionFailed;
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
