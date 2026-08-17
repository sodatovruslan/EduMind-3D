"use client";

import { useEffect, useRef } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import type { Call } from "@/lib/call-client";

function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/**
 * T8 — the actual media surface once WebRTC is `connected` (brief §15/§16).
 * Real `MediaStream` objects only — no fake canvas/waveform. Video calls:
 * remote is the primary surface, local preview is a small muted overlay
 * (never a feedback loop — `muted` on the local `<video>` is what
 * prevents that). Audio calls: no giant empty video rectangle, an
 * avatar/initials + identity + duration instead (brief §15).
 */
export default function CallMediaSurface({
  call,
  isCaller,
  localStream,
  remoteStream,
  isAudioMuted,
  isVideoDisabled,
  remoteAudioMuted,
  remoteVideoDisabled,
  onToggleMute,
  onToggleCamera,
  onEnd,
}: {
  call: Call;
  isCaller: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isAudioMuted: boolean;
  isVideoDisabled: boolean;
  remoteAudioMuted: boolean;
  remoteVideoDisabled: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onEnd: () => void;
}) {
  const { t } = useLocale();
  const otherParty = isCaller ? call.callee : call.caller;
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream]);
  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  if (call.call_type === "audio") {
    return (
      <div className="flex flex-col items-center gap-4 py-4" data-testid="audio-call-surface">
        {/* Real remote audio track playback — no visible surface, this is
            the actual audio element autoplay relies on (user-gesture
            context: Accept/Start Call already satisfied that). */}
        <audio ref={remoteAudioRef} autoPlay data-testid="remote-audio" />
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent/15 text-ds-title font-semibold text-accent">
          {initialsOf(otherParty.full_name)}
        </div>
        <div className="text-center">
          <p className="text-ds-body font-medium text-text-primary">{otherParty.full_name}</p>
          {remoteAudioMuted && (
            <p className="text-ds-caption text-text-muted" data-testid="remote-muted-indicator">
              {t.calls.remoteMuted}
            </p>
          )}
        </div>
        <MediaControls
          isAudioMuted={isAudioMuted}
          showCameraControl={false}
          isVideoDisabled={false}
          onToggleMute={onToggleMute}
          onToggleCamera={onToggleCamera}
          onEnd={onEnd}
        />
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-ds-control bg-black" data-testid="video-call-surface">
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className="aspect-video w-full bg-black object-cover"
        data-testid="remote-video"
      />
      {remoteVideoDisabled && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80" data-testid="remote-camera-off-overlay">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-ds-title font-semibold text-white">
            {initialsOf(otherParty.full_name)}
          </div>
          <p className="text-ds-caption text-white/80">{t.calls.remoteCameraOff}</p>
        </div>
      )}
      {remoteAudioMuted && (
        <span
          className="absolute left-2 top-2 rounded-full bg-black/60 p-1.5 text-white"
          role="img"
          aria-label={t.calls.remoteMuted}
          title={t.calls.remoteMuted}
        >
          <MicOff size={14} />
        </span>
      )}

      {/* Anchored top-right, not bottom — on narrow viewports a
          bottom-right preview can overlap the bottom-center controls bar
          (brief §32: "local preview не закрывает controls"); top-right
          keeps them fully clear of each other at any width. */}
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        className="absolute right-3 top-3 h-20 w-28 -scale-x-100 rounded-ds-control border border-white/20 bg-black object-cover shadow-ds-md sm:h-28 sm:w-44"
        data-testid="local-video"
      />

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
        <MediaControls
          isAudioMuted={isAudioMuted}
          showCameraControl
          isVideoDisabled={isVideoDisabled}
          onToggleMute={onToggleMute}
          onToggleCamera={onToggleCamera}
          onEnd={onEnd}
          overlay
        />
      </div>
    </div>
  );
}

function MediaControls({
  isAudioMuted,
  showCameraControl,
  isVideoDisabled,
  onToggleMute,
  onToggleCamera,
  onEnd,
  overlay = false,
}: {
  isAudioMuted: boolean;
  showCameraControl: boolean;
  isVideoDisabled: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onEnd: () => void;
  overlay?: boolean;
}) {
  const { t } = useLocale();
  const base = overlay ? "bg-black/60 text-white hover:bg-black/80" : "bg-text-primary/5 text-text-primary hover:bg-text-primary/10";
  const activeBase = "bg-danger/20 text-danger hover:bg-danger/30";

  return (
    <div className="flex items-center gap-2 rounded-full p-1.5" role="group" aria-label={t.calls.mediaControlsLabel}>
      <button
        type="button"
        onClick={onToggleMute}
        aria-label={isAudioMuted ? t.calls.unmute : t.calls.mute}
        aria-pressed={isAudioMuted}
        data-testid="toggle-mute"
        className={`ds-focus-ring flex items-center gap-1.5 rounded-full px-3 py-2 text-ds-caption font-medium transition-colors ${isAudioMuted ? activeBase : base}`}
      >
        {isAudioMuted ? <MicOff size={16} /> : <Mic size={16} />}
        <span className="hidden sm:inline">{isAudioMuted ? t.calls.unmute : t.calls.mute}</span>
      </button>
      {showCameraControl && (
        <button
          type="button"
          onClick={onToggleCamera}
          aria-label={isVideoDisabled ? t.calls.cameraOn : t.calls.cameraOff}
          aria-pressed={isVideoDisabled}
          data-testid="toggle-camera"
          className={`ds-focus-ring flex items-center gap-1.5 rounded-full px-3 py-2 text-ds-caption font-medium transition-colors ${isVideoDisabled ? activeBase : base}`}
        >
          {isVideoDisabled ? <VideoOff size={16} /> : <Video size={16} />}
          <span className="hidden sm:inline">{isVideoDisabled ? t.calls.cameraOn : t.calls.cameraOff}</span>
        </button>
      )}
      <button
        type="button"
        onClick={onEnd}
        aria-label={t.calls.endCall}
        data-testid="call-end"
        className="ds-focus-ring flex items-center gap-1.5 rounded-full bg-danger px-3 py-2 text-ds-caption font-medium text-white transition-all hover:brightness-110"
      >
        <PhoneOff size={16} />
        <span className="hidden sm:inline">{t.calls.endCall}</span>
      </button>
    </div>
  );
}
