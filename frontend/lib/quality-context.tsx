"use client";

import { createContext, useContext, useEffect, useState } from "react";

/**
 * Physical World Core — Adaptive Quality. Ручной выбор low/medium/high
 * (не авто-подстройка по FPS — это осознанное упрощение v1, см. план),
 * с разумным дефолтом по числу ядер/devicePixelRatio и сохранением выбора.
 */
export type QualityLevel = "low" | "medium" | "high";

export interface QualityPreset {
  dpr: [number, number];
  shadowMapSize: number;
  enableBloom: boolean;
  enableContactShadows: boolean;
  maxParticles: number;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  low: { dpr: [1, 1], shadowMapSize: 256, enableBloom: false, enableContactShadows: false, maxParticles: 8 },
  // medium совпадает с прежними жестко заданными значениями CanvasShell —
  // существующие сцены (SimLab/GeoWorld) не меняются визуально по умолчанию
  medium: { dpr: [1, 1.5], shadowMapSize: 512, enableBloom: true, enableContactShadows: true, maxParticles: 20 },
  high: { dpr: [1, 2], shadowMapSize: 1024, enableBloom: true, enableContactShadows: true, maxParticles: 40 },
};

const STORAGE_KEY = "edumind:quality";

function detectDefaultQuality(): QualityLevel {
  if (typeof navigator === "undefined") return "medium";
  const cores = navigator.hardwareConcurrency ?? 4;
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio : 1;
  if (cores <= 2 || dpr > 2.5) return "low";
  if (cores >= 8) return "high";
  return "medium";
}

interface QualityContextValue {
  quality: QualityLevel;
  preset: QualityPreset;
  setQuality: (quality: QualityLevel) => void;
}

const QualityContext = createContext<QualityContextValue | undefined>(undefined);

export function QualityProvider({ children }: { children: React.ReactNode }) {
  const [quality, setQualityState] = useState<QualityLevel>("medium");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as QualityLevel | null;
    setQualityState(stored ?? detectDefaultQuality());
  }, []);

  function setQuality(next: QualityLevel) {
    setQualityState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <QualityContext.Provider value={{ quality, preset: QUALITY_PRESETS[quality], setQuality }}>
      {children}
    </QualityContext.Provider>
  );
}

export function useQuality(): QualityContextValue {
  const ctx = useContext(QualityContext);
  if (!ctx) throw new Error("useQuality должен использоваться внутри <QualityProvider>");
  return ctx;
}
