"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Connection } from "@/lib/circuit-engine";
import { TUTORIAL_FINAL_INSTRUCTION, TUTORIAL_STEPS, isPairConnected } from "@/lib/tutorial-steps";

/**
 * Guided Onboarding — состояние обучающего режима. Не запускает никаких
 * автоматических подключений и не трогает Physics/Circuit/Task Engine:
 * только читает уже существующие connections/switchClosed/isCircuitActive
 * и решает, когда переходить к следующему шагу. Показ подсказки не
 * собирает цепь сам — только включает подсветку нужных клемм и текст.
 */
const STORAGE_KEY = "edumind_electricity_tutorial_done";

interface TutorialContextValue {
  active: boolean;
  stepIndex: number;
  totalSteps: number;
  hintVisible: boolean;
  showHint: () => void;
  suggestedTerminals: [string, string] | null;
  currentInstruction: string | null;
  skipTutorial: () => void;
}

const TutorialContext = createContext<TutorialContextValue | undefined>(undefined);

export function TutorialProvider({
  connections,
  switchClosed,
  isCircuitActive,
  children,
}: {
  connections: Connection[];
  switchClosed: boolean;
  isCircuitActive: boolean;
  children: React.ReactNode;
}) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [hintVisible, setHintVisible] = useState(false);

  // первый визит — определяем только на клиенте (localStorage недоступен при SSR)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.localStorage.getItem(STORAGE_KEY)) setActive(true);
  }, []);

  useEffect(() => {
    if (!active) return;
    if (stepIndex < TUTORIAL_STEPS.length) {
      const step = TUTORIAL_STEPS[stepIndex];
      if (isPairConnected(connections, step.from, step.to)) {
        setStepIndex((i) => i + 1);
        setHintVisible(false);
      }
      return;
    }
    // финальный шаг: переключатель замкнут и Physics Engine подтвердил реальный ток
    if (switchClosed && isCircuitActive) {
      setActive(false);
      if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, "1");
    }
  }, [active, stepIndex, connections, switchClosed, isCircuitActive]);

  const suggestedTerminals = useMemo<[string, string] | null>(() => {
    if (!active || !hintVisible) return null;
    if (stepIndex >= TUTORIAL_STEPS.length) return null;
    const step = TUTORIAL_STEPS[stepIndex];
    return [step.from, step.to];
  }, [active, hintVisible, stepIndex]);

  const currentInstruction = useMemo(() => {
    if (!active) return null;
    if (stepIndex < TUTORIAL_STEPS.length) return TUTORIAL_STEPS[stepIndex].instruction;
    return TUTORIAL_FINAL_INSTRUCTION;
  }, [active, stepIndex]);

  const value: TutorialContextValue = {
    active,
    stepIndex,
    totalSteps: TUTORIAL_STEPS.length + 1,
    hintVisible,
    showHint: () => setHintVisible(true),
    suggestedTerminals,
    currentInstruction,
    skipTutorial: () => {
      setActive(false);
      if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, "1");
    },
  };

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
}

export function useTutorial(): TutorialContextValue {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error("useTutorial должен использоваться внутри <TutorialProvider>");
  return ctx;
}
