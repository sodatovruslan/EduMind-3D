"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, MonitorUp, MonitorX } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import type { Call } from "@/lib/call-client";
import type { ScreenShareFailureReason } from "@/lib/webrtc/screenShare";
import { isScreenShareSupported } from "@/lib/webrtc/screenShare";

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
 *
 * T9 — screen sharing (brief §16/§17/§18): the SAME `remoteStream` object
 * carries the shared-screen video once either side starts sharing (video
 * calls swap the existing sender's track via `replaceTrack`, so this
 * component doesn't even need to know that happened; audio calls
 * renegotiate a brand new video track in — see useWebRTCSession.ts). This
 * component's only extra job is presentation: a visually obvious
 * sharing banner (never just an icon-color change), and — for AUDIO
 * calls specifically — switching from the avatar surface to a real
 * `<video>` surface the moment either side is sharing, since an audio
 * call's `remoteStream` normally carries no video track at all.
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
  isSharingScreen,
  remoteSharingScreen,
  screenShareError,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
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
  isSharingScreen: boolean;
  remoteSharingScreen: boolean;
  screenShareError: ScreenShareFailureReason | null;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
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

  const hasScreenShare = isSharingScreen || remoteSharingScreen;

  // Brief §37 — sharing state must not be color-only; a short screen-reader
  // announcement on the stop transition (never on every frame/track event,
  // which §37 explicitly forbids as noise — this fires once per stop).
  const [justStoppedSharing, setJustStoppedSharing] = useState(false);
  const wasSharingRef = useRef(hasScreenShare);
  useEffect(() => {
    if (wasSharingRef.current && !hasScreenShare) {
      setJustStoppedSharing(true);
      const timer = setTimeout(() => setJustStoppedSharing(false), 3000);
      wasSharingRef.current = hasScreenShare;
      return () => clearTimeout(timer);
    }
    wasSharingRef.current = hasScreenShare;
  }, [hasScreenShare]);

  const showVideoSurface = call.call_type === "video" || hasScreenShare;
  const canShareScreen = isScreenShareSupported();

  if (!showVideoSurface) {
    return (
      <div className="flex flex-col items-center gap-4 py-4" data-testid="audio-call-surface">
        {/* Real remote audio track playback — no visible surface, this is
            the actual audio element autoplay relies on (user-gesture
            context: Accept/Start Call already satisfied that). */}
        <audio ref={remoteAudioRef} autoPlay data-testid="remote-audio" />
        {justStoppedSharing && (
          <p className="sr-only" role="status" data-testid="screen-share-stopped-announcement">
            {t.calls.screenSharingStopped}
          </p>
        )}
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
          {screenShareError && (
            <p className="text-ds-caption text-danger" data-testid="screen-share-error" role="alert">
              {screenShareErrorLabel(screenShareError, t)}
            </p>
          )}
        </div>
        <MediaControls
          isAudioMuted={isAudioMuted}
          showCameraControl={false}
          isVideoDisabled={false}
          isSharingScreen={isSharingScreen}
          canShareScreen={canShareScreen && !remoteSharingScreen}
          remoteSharingScreen={remoteSharingScreen}
          otherPartyName={otherParty.full_name}
          onToggleMute={onToggleMute}
          onToggleCamera={onToggleCamera}
          onToggleScreenShare={onToggleScreenShare}
          onEnd={onEnd}
        />
      </div>
    );
  }

  const isAudioCallSharing = call.call_type === "audio";

  return (
    <div
      className="relative overflow-hidden rounded-ds-control bg-black"
      data-testid={isAudioCallSharing ? "audio-call-screen-share-surface" : "video-call-surface"}
    >
      <audio ref={remoteAudioRef} autoPlay data-testid="remote-audio" />
      {justStoppedSharing && (
        <p className="sr-only" role="status" data-testid="screen-share-stopped-announcement">
          {t.calls.screenSharingStopped}
        </p>
      )}

      {remoteSharingScreen ? (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="aspect-video w-full bg-black object-contain"
          data-testid="remote-video"
        />
      ) : isAudioCallSharing ? (
        // I'm sharing during an audio call — the remote side receives my
        // screen, not the other way around; nothing meaningful to render
        // here beyond identity (brief §16: never fabricate a surface that
        // doesn't correspond to a real track).
        <div className="flex flex-col items-center justify-center gap-3 py-10">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-ds-title font-semibold text-white">
            {initialsOf(otherParty.full_name)}
          </div>
          <p className="text-ds-caption text-white/80">{otherParty.full_name}</p>
        </div>
      ) : (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="aspect-video w-full bg-black object-cover"
          data-testid="remote-video"
        />
      )}

      {remoteSharingScreen && (
        <div
          className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-ds-caption font-medium text-white"
          data-testid="remote-sharing-banner"
        >
          <MonitorUp size={14} />
          {t.calls.sharingScreen(otherParty.full_name)}
        </div>
      )}

      {isSharingScreen && (
        <div
          className="absolute left-2 top-2 flex items-center gap-2 rounded-full bg-accent/90 px-3 py-1.5 text-ds-caption font-medium text-white"
          data-testid="local-sharing-banner"
        >
          <MonitorUp size={14} />
          {t.calls.youAreSharingScreen}
          <button
            type="button"
            onClick={onToggleScreenShare}
            data-testid="stop-sharing-prominent"
            className="ds-focus-ring ml-1 rounded-full bg-white/20 px-2 py-0.5 hover:bg-white/30"
          >
            {t.calls.stopSharing}
          </button>
        </div>
      )}

      {screenShareError && (
        <div
          className="absolute left-2 top-11 rounded-full bg-danger/90 px-3 py-1.5 text-ds-caption font-medium text-white"
          data-testid="screen-share-error"
          role="alert"
        >
          {screenShareErrorLabel(screenShareError, t)}
        </div>
      )}

      {call.call_type === "video" && remoteVideoDisabled && !remoteSharingScreen && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80" data-testid="remote-camera-off-overlay">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-ds-title font-semibold text-white">
            {initialsOf(otherParty.full_name)}
          </div>
          <p className="text-ds-caption text-white/80">{t.calls.remoteCameraOff}</p>
        </div>
      )}
      {call.call_type === "video" && remoteAudioMuted && (
        <span
          className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"
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
          keeps them fully clear of each other at any width. Unaffected by
          screen sharing — it always reads the ORIGINAL camera stream
          object directly, not whatever is currently on the wire. */}
      {call.call_type === "video" && (
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute right-3 top-3 h-20 w-28 -scale-x-100 rounded-ds-control border border-white/20 bg-black object-cover shadow-ds-md sm:h-28 sm:w-44"
          data-testid="local-video"
        />
      )}

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
        <MediaControls
          isAudioMuted={isAudioMuted}
          showCameraControl={call.call_type === "video"}
          isVideoDisabled={isVideoDisabled}
          isSharingScreen={isSharingScreen}
          canShareScreen={canShareScreen && !remoteSharingScreen}
          remoteSharingScreen={remoteSharingScreen}
          otherPartyName={otherParty.full_name}
          onToggleMute={onToggleMute}
          onToggleCamera={onToggleCamera}
          onToggleScreenShare={onToggleScreenShare}
          onEnd={onEnd}
          overlay
        />
      </div>
    </div>
  );
}

function screenShareErrorLabel(reason: ScreenShareFailureReason, t: ReturnType<typeof useLocale>["t"]): string {
  return reason === "cancelled" ? t.calls.screenShareCancelled : t.calls.screenShareFailed;
}

function MediaControls({
  isAudioMuted,
  showCameraControl,
  isVideoDisabled,
  isSharingScreen,
  canShareScreen,
  remoteSharingScreen,
  otherPartyName,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onEnd,
  overlay = false,
}: {
  isAudioMuted: boolean;
  showCameraControl: boolean;
  isVideoDisabled: boolean;
  isSharingScreen: boolean;
  canShareScreen: boolean;
  remoteSharingScreen: boolean;
  otherPartyName: string;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onEnd: () => void;
  overlay?: boolean;
}) {
  const { t } = useLocale();
  const base = overlay ? "bg-black/60 text-white hover:bg-black/80" : "bg-text-primary/5 text-text-primary hover:bg-text-primary/10";
  const activeBase = "bg-danger/20 text-danger hover:bg-danger/30";
  const shareActiveBase = overlay ? "bg-accent text-white hover:brightness-110" : "bg-accent/15 text-accent hover:bg-accent/25";
  // The share control can only ever be pressed to STOP a share I already
  // own — it's disabled (not hidden — brief §9 prefers a discoverable,
  // explained disabled state) whenever the OTHER side is sharing, or
  // when the browser has no getDisplayMedia at all.
  const shareDisabled = !isSharingScreen && !canShareScreen;
  const shareAriaLabel = isSharingScreen
    ? t.calls.stopSharing
    : remoteSharingScreen
      ? t.calls.anotherParticipantSharing
      : shareDisabled
        ? t.calls.screenShareUnavailable
        : t.calls.shareScreen;

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
        onClick={onToggleScreenShare}
        disabled={shareDisabled}
        aria-label={shareAriaLabel}
        title={shareAriaLabel}
        aria-pressed={isSharingScreen}
        data-testid="toggle-screen-share"
        className={`ds-focus-ring flex items-center gap-1.5 rounded-full px-3 py-2 text-ds-caption font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          isSharingScreen ? shareActiveBase : base
        }`}
      >
        {isSharingScreen ? <MonitorX size={16} /> : <MonitorUp size={16} />}
        <span className="hidden sm:inline">{isSharingScreen ? t.calls.stopSharing : t.calls.shareScreen}</span>
      </button>
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
