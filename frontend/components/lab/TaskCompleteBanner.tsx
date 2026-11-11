"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CheckCircle2, RotateCcw, Trophy } from "lucide-react";
import { playSuccess } from "@/lib/sound-effects";

/**
 * Banner shown over a 3D lab the moment the current task is completed, with
 * the "next task" button right there so the student does not scroll down to
 * the task panel. After the last task it offers "play again" instead.
 * Purely presentational: each lab passes in its own progress state.
 */
export default function TaskCompleteBanner({
  visible,
  taskId,
  isLast,
  title,
  subtitle,
  xpReward,
  nextLabel,
  restartLabel,
  onNext,
  onRestart,
}: {
  visible: boolean;
  /** Identifies the completed task: the chime plays once per task, and the banner re-animates when it changes. */
  taskId: string;
  isLast: boolean;
  title: string;
  subtitle: string;
  xpReward: number;
  nextLabel: string;
  restartLabel: string;
  onNext: () => void;
  onRestart: () => void;
}) {
  // chime once per completion, not on every re-render while it stays completed
  const chimedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (visible && chimedForRef.current !== taskId) {
      chimedForRef.current = taskId;
      playSuccess();
    }
    if (!visible && chimedForRef.current === taskId) chimedForRef.current = null;
  }, [visible, taskId]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={taskId}
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 320, damping: 24 }}
          data-testid="task-complete-overlay"
          role="status"
          className="pointer-events-auto flex max-w-[92%] items-center gap-3 rounded-2xl border border-emerald-400/40 bg-slate-950/85 px-4 py-3 text-slate-100 shadow-xl backdrop-blur-md"
        >
          {isLast ? <Trophy size={26} className="shrink-0 text-amber-300" /> : <CheckCircle2 size={26} className="shrink-0 text-emerald-300" />}
          <div className="min-w-0">
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-xs text-slate-300">
              {subtitle} · <span className="font-mono text-emerald-300">+{xpReward} XP</span>
            </p>
          </div>
          {isLast ? (
            <button
              type="button"
              onClick={onRestart}
              data-testid="task-overlay-restart-button"
              className="ds-focus-ring ml-1 flex shrink-0 items-center gap-1.5 rounded-full border border-white/20 px-3.5 py-2 text-sm font-semibold text-slate-100 transition-colors hover:bg-white/10"
            >
              <RotateCcw size={15} />
              {restartLabel}
            </button>
          ) : (
            <button
              type="button"
              onClick={onNext}
              data-testid="task-overlay-next-button"
              className="ds-focus-ring ml-1 flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-400 px-3.5 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-300"
            >
              {nextLabel}
              <ArrowRight size={15} />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
