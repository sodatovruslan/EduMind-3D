"use client";

// G6.10 → G6.11 — MapLibre production-foundation alternate renderer for
// GeoWorld. PROVE → EXTRACT → INTEGRATE → VERIFY: G6.7-G6.9 proved MapLibre
// works (owner-approved cold/warm load, terrain, deep zoom, Dushanbe/Pamir
// georeferencing), G6.10 extracted the reusable engine foundation. This
// component (G6.11) INTEGRATES the first real educational flow on top of
// it — reversibly, behind `?engine=maplibre`
// (see app/(immersive)/geo3d/[id]/page.tsx). The default renderer
// (GeoWorldScene.tsx — Earth cutaway, climate scenario, AI-graded
// completion) is UNCHANGED and stays the default (G6.11 §29).
//
// Educational state (actionsLog/selections/score) lives in
// `useGeoLessonState` (lib/geo/education/) — renderer-independent domain
// logic, NOT inside MapLibre internals (G6.11 §3). It talks to the SAME
// `/api/simulations/{id}/action|complete` backend contract that
// GeoWorldScene.tsx already uses — real persistence, not a parallel
// MapLibre-only save format (§16).
//
// НЕ содержит (осознанно, см. compatibility audit, GEOWORLD_ROADMAP.md
// G6.10/G6.11): cutaway-разрез слоёв Земли (§13 — другая пед. метафора,
// не 3D-движок в MapLibre), climate/sel 3D-визуализация (§12 — только
// backend-контракт готов через `useGeoLessonState.triggerClimateScenario`,
// схематичной визуализации в UI нет). AI-guide использует только
// `buildGeoAiContext` — контекст СЧИТАЕТСЯ, никуда не отправляется (§18,
// полноценный AI Geo Guide — предмет G6.13).
import { useCallback, useMemo, useState } from "react";
import { useLocale } from "@/lib/locale-context";
import MapLibreGlobeCanvas from "@/components/geo/maplibre/MapLibreGlobeCanvas";
import GeoLessonPanel from "@/components/geo/maplibre/GeoLessonPanel";
import { useGeoLessonState, type EarthLayerKey } from "@/lib/geo/education/useGeoLessonState";
import { buildGeoAiContext } from "@/lib/geo/education/aiContext";
import type { CameraContext } from "@/lib/geo/maplibre/camera-context";
import type { Simulation } from "@/lib/types";

export interface GeoWorldSceneMapLibreProps {
  simulation: Simulation;
}

export default function GeoWorldSceneMapLibre({ simulation }: GeoWorldSceneMapLibreProps) {
  const { t } = useLocale();
  const isDev = process.env.NODE_ENV !== "production";
  const lesson = useGeoLessonState(simulation.id);
  const [camera, setCamera] = useState<CameraContext | null>(null);

  const handleMapClick = useCallback(
    (lngLat: { lng: number; lat: number }) => {
      void lesson.exploreContinent(lngLat.lat, lngLat.lng);
    },
    [lesson]
  );

  const exploredLayers = useMemo(() => {
    const keys = new Set<EarthLayerKey>();
    for (const action of lesson.actionsLog) {
      if (action.action_type === "explore_layer" && typeof action.layer === "string") {
        keys.add(action.layer as EarthLayerKey);
      }
    }
    return keys;
  }, [lesson.actionsLog]);

  // G6.11 §18 — считается для дальнейшей интеграции с будущим AI Geo Guide
  // (G6.13), никуда не отправляется в этом этапе. Виден только в dev-
  // диагностике (ниже) — доказательство, что контекст реально собирается
  // из реального состояния, не заглушка.
  const aiContext = useMemo(
    () =>
      camera &&
      buildGeoAiContext({
        camera,
        actionsLog: lesson.actionsLog,
        selectedContinentName: lesson.selectedContinent?.name ?? null,
        completionScore: lesson.completionScore,
      }),
    [camera, lesson.actionsLog, lesson.selectedContinent, lesson.completionScore]
  );

  return (
    <div className="rounded-2xl bg-gradient-to-b from-slate-900 via-slate-950 to-black p-3 sm:p-5">
      <div className="relative h-[70vh] min-h-[420px]">
        <MapLibreGlobeCanvas
          esriEnabledByDefault={false}
          showControlPoints={isDev}
          showDiagnostics={isDev}
          showEsriToggle={isDev}
          onMapClick={handleMapClick}
          onCameraChange={setCamera}
        />
      </div>

      <div className="ds-glass mt-4 rounded-ds-panel p-4">
        <p className="text-ds-body text-text-secondary">{t.geo.maplibre.experimentalNotice}</p>
      </div>

      <GeoLessonPanel
        selectedLayer={lesson.selectedLayer}
        selectedContinent={lesson.selectedContinent}
        exploredLayers={exploredLayers}
        isSubmitting={lesson.isSubmitting}
        error={lesson.error}
        completionScore={lesson.completionScore}
        onExploreLayer={lesson.exploreLayer}
        onComplete={() => void lesson.completeAttempt()}
        canComplete={lesson.actionsLog.length > 0}
      />

      {isDev && aiContext && (
        <details className="ds-glass mt-3 rounded-ds-panel p-3 text-ds-caption text-text-muted">
          <summary className="cursor-pointer font-mono">AI context (dev-only preview, G6.11 §18)</summary>
          <pre className="mt-2 overflow-x-auto font-mono text-[11px]">{JSON.stringify(aiContext, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
