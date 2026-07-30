"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Container } from "@/lib/chemistry-engine";
import { CHEMISTRY_TUTORIAL_STEPS } from "@/lib/chemistry-tutorial-steps";

/**
 * Chemistry World — обучающий режим (Stage 5), только для первого визита
 * (localStorage-флаг, как и Electricity Lab Tutorial) — отдельная
 * реализация, не переиспользует TutorialProvider.tsx Electricity Lab.
 */
const STORAGE_KEY = "edumind_chemistry_tutorial_done";

interface ChemistryTutorialContextValue {
  active: boolean;
  stepIndex: number;
  totalSteps: number;
  currentInstruction: string | null;
  skipTutorial: () => void;
}

const ChemistryTutorialContext = createContext<ChemistryTutorialContextValue | undefined>(undefined);

export function ChemistryTutorialProvider({ container, children }: { container: Container; children: React.ReactNode }) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.localStorage.getItem(STORAGE_KEY)) setActive(true);
  }, []);

  useEffect(() => {
    if (!active) return;
    const waterG = container.contents.find((c) => c.substanceId === "water")?.grams ?? 0;
    const naclDissolvedG = container.contents.find((c) => c.substanceId === "nacl")?.grams ?? 0;
    const naclPrecipitateG = container.precipitate.find((c) => c.substanceId === "nacl")?.grams ?? 0;

    if (stepIndex === 0 && waterG > 0) {
      setStepIndex(1);
    } else if (stepIndex === 1 && (naclDissolvedG > 0 || naclPrecipitateG > 0)) {
      setStepIndex(2);
    } else if (stepIndex === 2 && naclDissolvedG > 0 && naclPrecipitateG <= 1e-6) {
      setActive(false);
      if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, "1");
    }
  }, [active, stepIndex, container]);

  const currentInstruction = active ? CHEMISTRY_TUTORIAL_STEPS[stepIndex]?.instruction ?? null : null;

  const value: ChemistryTutorialContextValue = {
    active,
    stepIndex,
    totalSteps: CHEMISTRY_TUTORIAL_STEPS.length,
    currentInstruction,
    skipTutorial: () => {
      setActive(false);
      if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, "1");
    },
  };

  return <ChemistryTutorialContext.Provider value={value}>{children}</ChemistryTutorialContext.Provider>;
}

export function useChemistryTutorial(): ChemistryTutorialContextValue {
  const ctx = useContext(ChemistryTutorialContext);
  if (!ctx) throw new Error("useChemistryTutorial должен использоваться внутри <ChemistryTutorialProvider>");
  return ctx;
}
