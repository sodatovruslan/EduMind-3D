import type { CallType } from "@/lib/call-client";

/**
 * T8 — the ONLY place `navigator.mediaDevices.getUserMedia` is called
 * from (brief §39: not scattered across components) and the ONLY place
 * permission is requested — always in direct response to a real user
 * action (Start Call / Accept), never on page load, never on incoming
 * ringing (brief §4).
 *
 * Audio call -> microphone only, camera never requested at all (brief
 * §4/§15 — not merely "video track discarded", the constraint itself
 * never asks for camera access).
 */
export type MediaFailureReason =
  | "permission-denied"
  | "device-not-found"
  | "device-unavailable"
  | "constraints-not-satisfiable"
  | "unknown";

export class MediaAcquisitionError extends Error {
  reason: MediaFailureReason;
  constructor(reason: MediaFailureReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

function mapGetUserMediaError(err: unknown): MediaAcquisitionError {
  const name = err instanceof Error ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return new MediaAcquisitionError("permission-denied", "Permission denied");
    case "NotFoundError":
      return new MediaAcquisitionError("device-not-found", "No matching device found");
    case "NotReadableError":
    case "AbortError":
      return new MediaAcquisitionError("device-unavailable", "Device unavailable");
    case "OverconstrainedError":
      return new MediaAcquisitionError("constraints-not-satisfiable", "Requested constraints not satisfiable");
    default:
      return new MediaAcquisitionError("unknown", "Could not access camera/microphone");
  }
}

export async function acquireLocalMedia(callType: CallType): Promise<MediaStream> {
  const constraints: MediaStreamConstraints =
    callType === "video" ? { audio: true, video: { facingMode: "user" } } : { audio: true, video: false };
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    throw mapGetUserMediaError(err);
  }
}

export function stopAllTracks(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export function setAudioEnabled(stream: MediaStream | null | undefined, enabled: boolean): void {
  stream?.getAudioTracks().forEach((track) => {
    track.enabled = enabled;
  });
}

export function setVideoEnabled(stream: MediaStream | null | undefined, enabled: boolean): void {
  stream?.getVideoTracks().forEach((track) => {
    track.enabled = enabled;
  });
}
