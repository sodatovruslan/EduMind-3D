"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Compass, Globe2, SkipForward } from "lucide-react";

/**
 * What the mission wants right now, drawn over the globe: a short prompt
 * (with the thing to find in large type), progress, and two small actions —
 * "show me" and "whole Earth". Under it, a one-line reaction to the last
 * click. Presentational only.
 */
export interface MissionFeedback {
  tone: "success" | "error" | "info";
  text: string;
  detail?: string;
}

const FEEDBACK_STYLE: Record<MissionFeedback["tone"], string> = {
  success: "border-emerald-400/50 bg-emerald-950/90 text-emerald-100",
  error: "border-red-400/50 bg-red-950/90 text-red-100",
  info: "border-sky-400/40 bg-slate-950/90 text-slate-100",
};

export default function MissionHud({
  prompt,
  target,
  done,
  total,
  feedback,
  hintLabel,
  onHint,
  skipLabel,
  onSkip,
  resetLabel,
  onResetView,
}: {
  prompt: string;
  /** The thing to find, shown large; omit when the prompt says it all. */
  target?: string;
  done: number;
  total: number;
  feedback: MissionFeedback | null;
  hintLabel?: string;
  onHint?: () => void;
  /** Park this question for later; offered only once the student has missed a few times. */
  skipLabel?: string;
  onSkip?: () => void;
  resetLabel: string;
  onResetView: () => void;
}) {
  return (
    <div className="pointer-events-none flex w-full flex-col items-center gap-2 px-3" data-testid="geo-mission-hud">
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-slate-100 shadow-xl backdrop-blur-md">
        <div className="min-w-0 text-center sm:text-left">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{prompt}</p>
          {target && (
            <p className="text-xl font-semibold leading-tight text-white" data-testid="geo-mission-target">
              {target}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5" aria-label={`${done} / ${total}`}>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={`h-2.5 w-2.5 rounded-full ${i < done ? "bg-emerald-400" : "bg-white/20"}`} />
          ))}
        </div>

        <div className="flex items-center gap-2">
          {onHint && hintLabel && (
            <button
              type="button"
              onClick={onHint}
              data-testid="geo-mission-hint-button"
              className="ds-focus-ring flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-slate-100 transition-colors hover:bg-white/10"
            >
              <Compass size={14} />
              {hintLabel}
            </button>
          )}
          {onSkip && skipLabel && (
            <button
              type="button"
              onClick={onSkip}
              data-testid="geo-mission-skip-button"
              className="ds-focus-ring flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10"
            >
              <SkipForward size={14} />
              {skipLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onResetView}
            title={resetLabel}
            aria-label={resetLabel}
            data-testid="geo-mission-reset-view"
            className="ds-focus-ring flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-slate-100 transition-colors hover:bg-white/10"
          >
            <Globe2 size={15} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {feedback && (
          <motion.div
            key={feedback.text}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            role="status"
            data-testid="geo-mission-feedback"
            data-tone={feedback.tone}
            className={`max-w-[min(92%,34rem)] rounded-xl border px-3.5 py-2 text-center text-sm shadow-lg backdrop-blur-md ${FEEDBACK_STYLE[feedback.tone]}`}
          >
            <p className="font-semibold">{feedback.text}</p>
            {feedback.detail && <p className="mt-0.5 text-xs opacity-90">{feedback.detail}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
