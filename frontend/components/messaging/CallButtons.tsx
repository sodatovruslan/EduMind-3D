"use client";

import { Phone, Video } from "lucide-react";
import { useLocale } from "@/lib/locale-context";

/**
 * T7 — the two call-start actions, living in the conversation header per
 * brief §6 ("Предпочтительно call action внутри human conversation
 * header") rather than anywhere else in the product. Disabled while a
 * call is already active in this conversation — starting a second one
 * isn't a real action (the backend would just say busy), so the button
 * itself reflects that instead of letting the user find out via an error.
 */
export default function CallButtons({
  disabled,
  onStartAudio,
  onStartVideo,
}: {
  disabled: boolean;
  onStartAudio: () => void;
  onStartVideo: () => void;
}) {
  const { t } = useLocale();

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={onStartAudio}
        disabled={disabled}
        aria-label={t.calls.callAudioAria}
        data-testid="start-audio-call"
        className="ds-focus-ring rounded-ds-control p-1.5 text-text-secondary transition-colors hover:text-text-primary disabled:opacity-40"
      >
        <Phone size={18} />
      </button>
      <button
        type="button"
        onClick={onStartVideo}
        disabled={disabled}
        aria-label={t.calls.callVideoAria}
        data-testid="start-video-call"
        className="ds-focus-ring rounded-ds-control p-1.5 text-text-secondary transition-colors hover:text-text-primary disabled:opacity-40"
      >
        <Video size={18} />
      </button>
    </div>
  );
}
