"use client";

// G6.10 — MapLibre production-foundation alternate renderer for GeoWorld.
// PROVE → EXTRACT → INTEGRATE → VERIFY: G6.7-G6.9 proved MapLibre works
// (owner-approved cold/warm load, terrain, deep zoom, Дushanbe/Pamir
// georeferencing). This component INTEGRATES the extracted foundation
// (lib/geo/maplibre/*, components/geo/maplibre/MapLibreGlobeCanvas) into a
// real GeoWorld simulation page — reversibly, behind `?engine=maplibre`
// (see app/(immersive)/geo3d/[id]/page.tsx). The default renderer
// (GeoWorldScene.tsx — Earth cutaway, climate scenario, continent facts,
// AI-graded completion) is UNCHANGED and stays the default.
//
// НЕ содержит: cutaway-разрез слоёв Земли, continent-facts, climate/sel
// scenario, backend scoring (`/api/simulations/{id}/action|complete`),
// AI-guide с scene-state — это специфичная для старого Three.js-рендера
// педагогика, ещё не перенесённая (см. compatibility audit,
// GEOWORLD_ROADMAP.md G6.10). Это ОСОЗНАННОЕ ограничение этого этапа, не
// упущение — задача G6.10 была "заложить фундамент", не "мигрировать всё".
import { useLocale } from "@/lib/locale-context";
import MapLibreGlobeCanvas from "@/components/geo/maplibre/MapLibreGlobeCanvas";
import type { Simulation } from "@/lib/types";

export interface GeoWorldSceneMapLibreProps {
  simulation: Simulation;
}

export default function GeoWorldSceneMapLibre({ simulation }: GeoWorldSceneMapLibreProps) {
  const { t } = useLocale();
  const isDev = process.env.NODE_ENV !== "production";

  return (
    <div className="rounded-2xl bg-gradient-to-b from-slate-900 via-slate-950 to-black p-3 sm:p-5">
      <div className="relative h-[70vh] min-h-[420px]">
        <MapLibreGlobeCanvas esriEnabledByDefault={false} showControlPoints={isDev} showDiagnostics={isDev} />
      </div>

      <div className="ds-glass mt-4 rounded-ds-panel p-4">
        <p className="text-ds-body text-text-secondary">
          {t.geo.maplibre?.experimentalNotice ??
            `${simulation.title} — экспериментальный MapLibre-рендерер GeoWorld (G6.10). Образовательный контент (разрез слоёв, климатический сценарий, оценка попытки) пока доступен только в основном рендерере.`}
        </p>
      </div>
    </div>
  );
}
