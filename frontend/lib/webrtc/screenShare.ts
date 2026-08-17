/**
 * T9 — the ONLY place `navigator.mediaDevices.getDisplayMedia` is called
 * from (same "one mockable layer, not scattered across components"
 * convention as T8's media.ts). Only ever invoked in direct response to a
 * real "Share Screen" click (brief §2/§3) — never on load, accept,
 * reconnect, or WS reconnect.
 *
 * `video: true, audio: false` deliberately (brief §15) — normal
 * microphone audio keeps flowing over the existing T8 audio track;
 * capturing tab/system audio here would risk echo/duplicated audio and
 * browser-inconsistent behaviour, out of scope for T9.
 */
export type ScreenShareFailureReason = "cancelled" | "failed";

export class ScreenShareAcquisitionError extends Error {
  reason: ScreenShareFailureReason;
  constructor(reason: ScreenShareFailureReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

function mapGetDisplayMediaError(err: unknown): ScreenShareAcquisitionError {
  const name = err instanceof Error ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "AbortError":
      // Browsers do not reliably distinguish "user clicked Cancel in the
      // picker" from "permission policy denied" for getDisplayMedia —
      // both surface as NotAllowedError. Either way the correct UX is
      // the same: the call keeps running, no fatal error (brief §13).
      return new ScreenShareAcquisitionError("cancelled", "Screen sharing cancelled");
    default:
      return new ScreenShareAcquisitionError("failed", "Could not start screen sharing");
  }
}

export function isScreenShareSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function";
}

export async function acquireScreenStream(): Promise<MediaStream> {
  if (!isScreenShareSupported()) {
    throw new ScreenShareAcquisitionError("failed", "Screen sharing not supported");
  }
  try {
    return await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch (err) {
    throw mapGetDisplayMediaError(err);
  }
}
