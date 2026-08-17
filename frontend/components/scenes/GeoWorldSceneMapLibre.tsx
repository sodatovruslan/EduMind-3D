"use client";

// G6.10 → G6.11 → G6.12 — MapLibre production-foundation alternate renderer
// for GeoWorld. G6.11 integrated the first real educational flow (Earth
// layers via flat buttons + continent exploration). G6.12 adds the full
// Earth Science layer set on top, WITHOUT touching the G6.11 foundation's
// already-approved behavior: tectonic plates / volcanoes / earthquakes as
// native MapLibre layers (useEarthScienceLayers), a real climate scenario
// visualization (useClimateOverlay + ClimatePanel, same backend contract as
// G6.11's `triggerClimateScenario`), and a genuinely interactive Earth
// Structure special mode (EarthStructureMode — separate R3F canvas, §45:
// never two heavy WebGL contexts at once, so MapLibreGlobeCanvas fully
// UNMOUNTS while Earth Structure Mode is active, not just hidden via CSS).
//
// Educational state (actionsLog/selections/score) still lives in
// `useGeoLessonState` (lib/geo/education/) — renderer-independent domain
// logic, unchanged contract, now extended with three new action types
// (explore_plate_boundary/explore_volcano/explore_earthquake) that reuse
// the SAME `/api/simulations/{id}/action`+`/complete` backend round-trip,
// not a second scoring engine (§13/§16/§20/§37).
import { useCallback, useMemo, useState } from "react";
import { useLocale } from "@/lib/locale-context";
import MapLibreGlobeCanvas from "@/components/geo/maplibre/MapLibreGlobeCanvas";
import GeoLessonPanel from "@/components/geo/maplibre/GeoLessonPanel";
import LayerControlPanel, { type BaseToggles, type EarthScienceToggles } from "@/components/geo/maplibre/LayerControlPanel";
import EarthScienceLegend from "@/components/geo/maplibre/EarthScienceLegend";
import FeatureInfoPanel from "@/components/geo/maplibre/FeatureInfoPanel";
import AccessibleFeatureList from "@/components/geo/maplibre/AccessibleFeatureList";
import ClimatePanel from "@/components/geo/maplibre/ClimatePanel";
import EarthStructureMode from "@/components/geo/maplibre/EarthStructureMode";
import { useGeoLessonState, type EarthLayerKey } from "@/lib/geo/education/useGeoLessonState";
import { buildGeoAiContext } from "@/lib/geo/education/aiContext";
import type { GeoFeatureInfo } from "@/lib/geo/education/featureInfo";
import { useEarthScienceLayers, type EarthScienceLabels } from "@/lib/geo/maplibre/useEarthScienceLayers";
import { useClimateOverlay, CLIMATE_THRESHOLD_C } from "@/lib/geo/maplibre/useClimateOverlay";
import { setLabelsVisible, setTerrainVisible } from "@/lib/geo/maplibre/base-layer-toggles";
import { DEFAULT_EARTHQUAKE_WINDOW, type EarthquakeWindowKey } from "@/lib/geo/maplibre/earth-science-sources";
import type { CameraContext } from "@/lib/geo/maplibre/camera-context";
import type { MapLibreGlobeState } from "@/lib/geo/maplibre/useMapLibreGlobe";
import type { Simulation } from "@/lib/types";

export interface GeoWorldSceneMapLibreProps {
  simulation: Simulation;
}

export default function GeoWorldSceneMapLibre({ simulation }: GeoWorldSceneMapLibreProps) {
  const { t, locale } = useLocale();
  const isDev = process.env.NODE_ENV !== "production";
  const lesson = useGeoLessonState(simulation.id);
  const [camera, setCamera] = useState<CameraContext | null>(null);

  // G6.12 — доступ к сырому MapLibre instance, отдаётся наверх через
  // onEngineReady (см. MapLibreGlobeCanvas.tsx) — тот же "замкнись на ref"
  // приём, что onMapClick/onCameraChange, вызов ВСЕГДА отдаёт актуальный
  // instance, даже если сам колбэк захвачен на раннем рендере.
  const [engine, setEngine] = useState<{ getMap: () => any; status: MapLibreGlobeState["status"] }>({
    getMap: () => null,
    status: "loading",
  });
  const handleEngineReady = useCallback((getMap: () => any, status: MapLibreGlobeState["status"]) => {
    setEngine({ getMap, status });
  }, []);

  const [base, setBase] = useState<BaseToggles>({ labels: true, terrain: true });
  const [earthScience, setEarthScience] = useState<EarthScienceToggles>({
    tectonics: false,
    volcanoes: false,
    earthquakes: false,
    climate: false,
  });
  const [earthquakeWindow, setEarthquakeWindow] = useState<EarthquakeWindowKey>(DEFAULT_EARTHQUAKE_WINDOW);
  const [earthStructureMode, setEarthStructureMode] = useState(false);
  const [featureInfo, setFeatureInfo] = useState<GeoFeatureInfo | null>(null);
  const [temperatureAnomaly, setTemperatureAnomaly] = useState(0);

  const handleToggleBase = useCallback(
    (key: keyof BaseToggles) => {
      setBase((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        const map = engine.getMap();
        if (map) {
          if (key === "labels") setLabelsVisible(map, next.labels);
          if (key === "terrain") setTerrainVisible(map, next.terrain);
        }
        return next;
      });
    },
    [engine]
  );

  const handleToggleEarthScience = useCallback((key: keyof EarthScienceToggles) => {
    setEarthScience((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleFeatureSelect = useCallback(
    (info: GeoFeatureInfo) => {
      setFeatureInfo(info);
      if (info.kind === "plate-boundary" && info.raw) {
        void lesson.explorePlateBoundary(
          String(info.raw.plateA ?? info.title),
          String(info.raw.plateB ?? ""),
          info.raw.boundaryType === "subduction" ? "subduction" : null
        );
      } else if (info.kind === "volcano" && info.raw) {
        void lesson.exploreVolcano(String(info.raw.name ?? info.title), (info.raw.country as string | null) ?? null);
      } else if (info.kind === "earthquake" && info.raw) {
        void lesson.exploreEarthquake(String(info.raw.place ?? ""), Number(info.raw.magnitude ?? 0));
      }
    },
    [lesson]
  );

  const earthScienceLabels: EarthScienceLabels = useMemo(() => {
    const fi = t.geo.maplibre.earthScience.featureInfo;
    return {
      plateBoundarySubduction: fi.plateBoundarySubduction,
      plateBoundaryUnclassified: fi.plateBoundaryUnclassified,
      volcanoElevation: fi.volcanoElevation,
      volcanoType: fi.volcanoType,
      volcanoLastEruption: fi.volcanoLastEruption,
      volcanoLastEruptionBce: fi.volcanoLastEruptionBce,
      volcanoDeaths: fi.volcanoDeaths,
      earthquakeDepth: fi.earthquakeDepth,
      earthquakeDate: fi.earthquakeDate,
    };
  }, [t]);

  const diagnostics = useEarthScienceLayers({
    getMap: engine.getMap,
    mapReady: engine.status === "ready" && !earthStructureMode,
    enabled: earthScience,
    earthquakeWindow,
    locale,
    labels: earthScienceLabels,
    onFeatureSelect: handleFeatureSelect,
  });

  const climateTriggered = Boolean(lesson.climateResult?.triggered);
  useClimateOverlay({
    getMap: engine.getMap,
    mapReady: engine.status === "ready" && !earthStructureMode,
    enabled: earthScience.climate,
    temperatureAnomaly,
    triggered: climateTriggered,
  });

  const handleTemperatureChange = useCallback(
    (value: number) => {
      setTemperatureAnomaly(value);
      void lesson.triggerClimateScenario(value, CLIMATE_THRESHOLD_C);
    },
    [lesson]
  );

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

  const selectedLayerKey = (lesson.selectedLayer?.layer as EarthLayerKey | undefined) ?? null;

  const handleToggleEarthStructure = useCallback(() => {
    setEarthStructureMode((prev) => !prev);
    setFeatureInfo(null);
  }, []);

  // G6.11 §18 / G6.12 §38 — renderer-independent, компактный AI-контекст.
  // G6.12 расширяет его активными Earth Science слоями/выбранным объектом/
  // сценарием климата/режимом Earth Structure — НЕ сырым GeoJSON (§38).
  // Никуда не отправляется в этом этапе (полноценный AI Geo Guide — G6.13,
  // явно НЕ строится сейчас).
  const aiContext = useMemo(
    () =>
      camera &&
      buildGeoAiContext({
        camera,
        actionsLog: lesson.actionsLog,
        selectedContinentName: lesson.selectedContinent?.name ?? null,
        completionScore: lesson.completionScore,
        activeLayers: {
          tectonics: earthScience.tectonics,
          volcanoes: earthScience.volcanoes,
          earthquakes: earthScience.earthquakes,
          climate: earthScience.climate,
        },
        selectedFeature: featureInfo,
        climateScenario: { temperatureAnomaly, triggered: climateTriggered },
        earthStructureMode,
      }),
    [
      camera,
      lesson.actionsLog,
      lesson.selectedContinent,
      lesson.completionScore,
      earthScience,
      featureInfo,
      temperatureAnomaly,
      climateTriggered,
      earthStructureMode,
    ]
  );

  return (
    <div className="rounded-2xl bg-gradient-to-b from-slate-900 via-slate-950 to-black p-3 sm:p-5">
      {earthStructureMode ? (
        // G6.12 — EarthStructureMode управляет собственной высотой через
        // CanvasShell (h-[75vh]) и добавляет под канвасом инфо-панель В
        // ОБЫЧНОМ потоке документа — реальный баг, найденный этим же QA-
        // прогоном: если обернуть его в тот же `h-[70vh]` контейнер, что
        // нужен MapLibreGlobeCanvas (который явно заполняет фиксированную
        // высоту через `absolute inset-0`), инфо-панель со кнопками слоёв
        // визуально "вытекает" ниже границ контейнера, а следующий по
        // документу sibling (`experimentalNotice`) занимает своё место
        // ПОД контейнером как если бы оверфлоя не было — визуально
        // перекрывая кнопки и блокируя клики (`intercepts pointer events`).
        <EarthStructureMode
          exploredLayers={exploredLayers}
          selectedLayerKey={selectedLayerKey}
          selectedLayer={lesson.selectedLayer}
          isSubmitting={lesson.isSubmitting}
          onExploreLayer={lesson.exploreLayer}
          onReturnToSurface={handleToggleEarthStructure}
        />
      ) : (
        <div className="relative h-[70vh] min-h-[420px]">
          <MapLibreGlobeCanvas
            esriEnabledByDefault={false}
            showControlPoints={isDev}
            showDiagnostics={isDev}
            showEsriToggle={isDev}
            onMapClick={handleMapClick}
            onCameraChange={setCamera}
            onEngineReady={handleEngineReady}
          />
        </div>
      )}

      <div className="ds-glass mt-4 rounded-ds-panel p-4">
        <p className="text-ds-body text-text-secondary">{t.geo.maplibre.experimentalNotice}</p>
      </div>

      {!earthStructureMode && (
        <LayerControlPanel
          base={base}
          onToggleBase={handleToggleBase}
          earthScience={earthScience}
          onToggleEarthScience={handleToggleEarthScience}
          earthquakeWindow={earthquakeWindow}
          onEarthquakeWindowChange={setEarthquakeWindow}
          earthStructureMode={earthStructureMode}
          onToggleEarthStructure={handleToggleEarthStructure}
          diagnostics={diagnostics}
        />
      )}
      {earthStructureMode && (
        <div className="ds-glass mt-4 rounded-ds-panel p-4">
          <label className="ds-focus-ring flex items-center gap-2 text-ds-body text-text-secondary">
            <input type="checkbox" checked disabled className="accent-accent-geo" />
            {t.geo.maplibre.layers.earthStructure}
          </label>
        </div>
      )}

      {!earthStructureMode && (
        <EarthScienceLegend
          showTectonics={earthScience.tectonics}
          showVolcanoes={earthScience.volcanoes}
          showEarthquakes={earthScience.earthquakes}
          showClimate={earthScience.climate}
        />
      )}

      {!earthStructureMode && (earthScience.tectonics || earthScience.volcanoes || earthScience.earthquakes) && (
        <div className="ds-glass mt-4 rounded-ds-panel p-4">
          {earthScience.tectonics && <AccessibleFeatureList titleKey={t.geo.maplibre.layers.tectonics} features={diagnostics.sampleFeatures.tectonics} />}
          {earthScience.volcanoes && <AccessibleFeatureList titleKey={t.geo.maplibre.layers.volcanoes} features={diagnostics.sampleFeatures.volcanoes} />}
          {earthScience.earthquakes && (
            <AccessibleFeatureList titleKey={t.geo.maplibre.layers.earthquakes} features={diagnostics.sampleFeatures.earthquakes} />
          )}
        </div>
      )}

      {!earthStructureMode && <FeatureInfoPanel info={featureInfo} onClose={() => setFeatureInfo(null)} />}

      {!earthStructureMode && earthScience.climate && (
        <ClimatePanel
          temperatureAnomaly={temperatureAnomaly}
          onChange={handleTemperatureChange}
          triggered={climateTriggered}
          phenomenon={lesson.climateResult?.phenomenon ?? null}
          location={lesson.climateResult?.location ?? null}
          description={lesson.climateResult?.description ?? ""}
        />
      )}

      {!earthStructureMode && (
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
      )}

      {isDev && aiContext && (
        <details className="ds-glass mt-3 rounded-ds-panel p-3 text-ds-caption text-text-muted">
          <summary className="cursor-pointer font-mono">AI context (dev-only preview, G6.11 §18 / G6.12 §38)</summary>
          <pre className="mt-2 overflow-x-auto font-mono text-[11px]">{JSON.stringify(aiContext, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
