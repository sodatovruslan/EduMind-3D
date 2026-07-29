import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Physical World Core — единое симуляционное время (старт/пауза/slow-mo/сброс).
 * Вынесено из паттерна, который уже был в SimLabScene (reactionStartedAt +
 * requestAnimationFrame tick), чтобы Electricity Lab не дублировал его
 * ещё раз — SimLab пока не тронут (не переписываем существующие сцены
 * без необходимости), но использует ту же логику.
 */
export interface SimulationClock {
  isRunning: boolean;
  timeScale: number;
  elapsedSeconds: number;
  start: () => void;
  pause: () => void;
  reset: () => void;
  setTimeScale: (scale: number) => void;
}

export function useSimulationClock(initialTimeScale = 1): SimulationClock {
  const [isRunning, setIsRunning] = useState(false);
  const [timeScale, setTimeScale] = useState(initialTimeScale);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRunning) {
      lastFrameRef.current = null;
      return;
    }

    const tick = (now: number) => {
      if (lastFrameRef.current !== null) {
        const deltaSeconds = ((now - lastFrameRef.current) / 1000) * timeScale;
        setElapsedSeconds((prev) => prev + deltaSeconds);
      }
      lastFrameRef.current = now;
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      lastFrameRef.current = null;
    };
  }, [isRunning, timeScale]);

  const start = useCallback(() => setIsRunning(true), []);
  const pause = useCallback(() => setIsRunning(false), []);
  const reset = useCallback(() => {
    setIsRunning(false);
    setElapsedSeconds(0);
  }, []);

  return { isRunning, timeScale, elapsedSeconds, start, pause, reset, setTimeScale };
}
