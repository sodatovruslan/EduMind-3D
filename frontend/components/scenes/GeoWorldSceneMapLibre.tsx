"use client";

// GeoWorld — the globe with three missions, built like the task flows of the
// Electricity and Chemistry labs:
//   1. Find the continents — click the continent the prompt asks for.
//   2. Ring of Fire        — open three volcanoes along the plate boundaries.
//   3. To the centre       — explore the four layers of the Earth in section.
//
// The globe itself is the MapLibre renderer (satellite imagery, real
// terrain); the third mission swaps it for the cut-open Earth
// (EarthStructureMode, its own canvas — the map is fully unmounted then, the
// two heavy WebGL contexts never live at once).
//
// What counts as progress is decided from real actions on the globe, in the
// browser: a click tested against real country outlines, a volcano actually
// opened, a layer actually selected. The backend round-trips of
// useGeoLessonState are kept for scoring and for the layer facts, but a
// mission never waits on them.
//
// The earlier free-form panels (layer switches, climate slider, feature
// lists, the "experimental renderer" notice) are no longer rendered here;
// their components and hooks are untouched and can be mounted again.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/lib/locale-context";
import MapLibreGlobeCanvas from "@/components/geo/maplibre/MapLibreGlobeCanvas";
import EarthScienceLegend from "@/components/geo/maplibre/EarthScienceLegend";
import FeatureInfoPanel from "@/components/geo/maplibre/FeatureInfoPanel";
import EarthStructureMode from "@/components/geo/maplibre/EarthStructureMode";
import MissionHud, { type MissionFeedback } from "@/components/geo/missions/MissionHud";
import MissionPanel from "@/components/geo/missions/MissionPanel";
import TaskCompleteBanner from "@/components/lab/TaskCompleteBanner";
import AskTeacherWidget from "@/components/help/AskTeacherWidget";
import { useGeoLessonState, type EarthLayerKey } from "@/lib/geo/education/useGeoLessonState";
import { useGeoMissions, type GeoMissionId } from "@/lib/geo/education/useGeoMissions";
import {
  MATERIK_VIEW,
  continentAt,
  tagCountriesWithMaterik,
  type CountryCollection,
  type MaterikId,
} from "@/lib/geo/education/continents";
import { buildGeoAiContext } from "@/lib/geo/education/aiContext";
import { buildGeoHelpContext } from "@/lib/help/contextAdapters";
import type { GeoFeatureInfo } from "@/lib/geo/education/featureInfo";
import { useEarthScienceLayers, type EarthScienceLabels } from "@/lib/geo/maplibre/useEarthScienceLayers";
import { useContinentHighlight } from "@/lib/geo/maplibre/useContinentHighlight";
import { setLabelsVisible } from "@/lib/geo/maplibre/base-layer-toggles";
import { BORDERS_URL } from "@/lib/geo/maplibre/labels";
import { LOCATIONS } from "@/lib/geo/maplibre/camera-presets";
import { DEFAULT_EARTHQUAKE_WINDOW } from "@/lib/geo/maplibre/earth-science-sources";
import type { CameraContext } from "@/lib/geo/maplibre/camera-context";
import type { MapLibreGlobeState } from "@/lib/geo/maplibre/useMapLibreGlobe";
import type { Simulation } from "@/lib/types";

export interface GeoWorldSceneMapLibreProps {
  simulation: Simulation;
}

// how long a reaction to a click stays on screen, and how long a wrong continent flashes red
const FEEDBACK_MS = 4500;
const WRONG_FLASH_MS = 900;
// the Pacific "Ring of Fire" side of the globe: Japan, Indonesia, Kamchatka
const RING_OF_FIRE_VIEW = { center: [150, 15] as [number, number], zoom: 2.2 };
const CITY_LAYER_IDS = ["city-point", "city-label"];
// one slow turn of the globe while the student has not touched it yet
const IDLE_SPIN = { degrees: 150, durationMs: 60_000 };

// the backend's rough continent keys (useGeoLessonState.exploreContinent) mapped
// to the six school continents — only used when the country outlines failed to load
const BACKEND_CONTINENT_TO_MATERIK: Record<string, MaterikId> = {
  europe: "eurasia",
  asia: "eurasia",
  africa: "africa",
  north_america: "north_america",
  south_america: "south_america",
  oceania: "australia",
  antarctica: "antarctica",
};

type OutlinesState = { status: "loading" | "error"; data: null } | { status: "ready"; data: CountryCollection };

/** Country outlines (Natural Earth) — the same file the globe loads for its labels, so it is already in the HTTP cache. */
function useCountryOutlines(): OutlinesState {
  const [state, setState] = useState<OutlinesState>({ status: "loading", data: null });
  useEffect(() => {
    const controller = new AbortController();
    fetch(BORDERS_URL, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: CountryCollection) => setState({ status: "ready", data }))
      .catch((err) => {
        if (!controller.signal.aborted) {
          // eslint-disable-next-line no-console
          console.warn("Country outlines failed to load:", err);
          setState({ status: "error", data: null });
        }
      });
    return () => controller.abort();
  }, []);
  return state;
}

export default function GeoWorldSceneMapLibre({ simulation }: GeoWorldSceneMapLibreProps) {
  const { t, locale } = useLocale();
  const m = t.geo.missions;
  const lesson = useGeoLessonState(simulation.id);
  const missions = useGeoMissions(simulation.id);
  const outlines = useCountryOutlines();
  const taggedOutlines = useMemo(() => (outlines.data ? tagCountriesWithMaterik(outlines.data) : null), [outlines.data]);

  const missionId: GeoMissionId = missions.mission.id;
  const isContinents = missionId === "geo-mission-continents";
  const isVolcanoes = missionId === "geo-mission-volcanoes";
  const isCore = missionId === "geo-mission-core";

  const [camera, setCamera] = useState<CameraContext | null>(null);
  const [engine, setEngine] = useState<{ getMap: () => any; status: MapLibreGlobeState["status"] }>({
    getMap: () => null,
    status: "loading",
  });
  const handleEngineReady = useCallback((getMap: () => any, status: MapLibreGlobeState["status"]) => {
    setEngine({ getMap, status });
  }, []);
  const mapReady = engine.status === "ready" && !isCore;

  const [featureInfo, setFeatureInfo] = useState<GeoFeatureInfo | null>(null);
  const [selectedLayerKey, setSelectedLayerKey] = useState<EarthLayerKey | null>(null);
  const [feedback, setFeedback] = useState<MissionFeedback | null>(null);
  const [wrongContinent, setWrongContinent] = useState<MaterikId | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrongTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFeedback = useCallback((next: MissionFeedback) => {
    setFeedback(next);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), FEEDBACK_MS);
  }, []);

  useEffect(
    () => () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      if (wrongTimerRef.current) clearTimeout(wrongTimerRef.current);
    },
    []
  );

  // a new mission starts with a clean slate on screen
  useEffect(() => {
    setFeedback(null);
    setFeatureInfo(null);
    setWrongContinent(null);
    setSelectedLayerKey(null);
  }, [missionId]);

  // ---- the globe per mission: labels, camera, layers -------------------------------

  // Mission 1 is about recognising the continents by shape: country names would turn it into reading.
  useEffect(() => {
    const map = engine.getMap();
    if (!map || !mapReady) return;
    try {
      setLabelsVisible(map, !isContinents);
      // city dots are never shown in the missions: next to the volcano dots
      // they read as "points to click", and they bury the globe in labels
      for (const id of CITY_LAYER_IDS) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
      }
    } catch {
      // label layers are part of the base style; if it is still loading they are simply set on the next run
    }
  }, [engine, mapReady, isContinents]);

  // Opening view of each mission. The continents mission also turns the globe
  // slowly until the student touches it (any drag or zoom stops the motion).
  useEffect(() => {
    const map = engine.getMap();
    if (!map || !mapReady) return;
    if (isVolcanoes) {
      map.flyTo({ center: RING_OF_FIRE_VIEW.center, zoom: RING_OF_FIRE_VIEW.zoom, pitch: 0, duration: 2500, essential: true });
      return;
    }
    const start = map.getCenter();
    map.easeTo({
      center: [start.lng + IDLE_SPIN.degrees, LOCATIONS.earth.center[1]],
      zoom: LOCATIONS.earth.zoom,
      pitch: 0,
      duration: IDLE_SPIN.durationMs,
      easing: (x: number) => x,
    });
  }, [engine, mapReady, isVolcanoes]);

  useContinentHighlight({
    getMap: engine.getMap,
    mapReady,
    countries: taggedOutlines,
    enabled: isContinents,
    found: missions.foundContinents,
    wrong: wrongContinent,
  });

  const { markVolcanoOpened, markContinentFound, markLayerExplored } = missions;

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
        const name = String(info.raw.name ?? info.title);
        markVolcanoOpened(name);
        void lesson.exploreVolcano(name, (info.raw.country as string | null) ?? null);
      }
    },
    [lesson, markVolcanoOpened]
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

  // plate boundaries and volcanoes are on the globe only in the volcano mission
  const earthScience = useMemo(
    () => ({ tectonics: isVolcanoes, volcanoes: isVolcanoes, earthquakes: false, climate: false }),
    [isVolcanoes]
  );
  useEarthScienceLayers({
    getMap: engine.getMap,
    mapReady,
    enabled: earthScience,
    earthquakeWindow: DEFAULT_EARTHQUAKE_WINDOW,
    locale,
    labels: earthScienceLabels,
    onFeatureSelect: handleFeatureSelect,
  });

  // ---- mission 1: a click on the globe -----------------------------------------------

  const targetContinent = missions.targetContinent;
  const continentsDone = isContinents && missions.isComplete;

  const judgeContinentClick = useCallback(
    (clicked: MaterikId, lat: number, lng: number) => {
      if (!targetContinent) return;
      const names = m.continents.names;
      if (clicked === targetContinent) {
        markContinentFound(clicked);
        showFeedback({ tone: "success", text: m.continents.correct.replace("{name}", names[clicked]), detail: m.continents.facts[clicked] });
        // logged for the backend score; the mission itself does not wait for it
        void lesson.exploreContinent(lat, lng);
        return;
      }
      showFeedback({
        tone: "error",
        text: m.continents.wrong.replace("{name}", names[clicked]).replace("{target}", names[targetContinent]),
      });
      setWrongContinent(clicked);
      if (wrongTimerRef.current) clearTimeout(wrongTimerRef.current);
      wrongTimerRef.current = setTimeout(() => setWrongContinent(null), WRONG_FLASH_MS);
    },
    [targetContinent, m, markContinentFound, showFeedback, lesson]
  );

  const handleMapClick = useCallback(
    (lngLat: { lng: number; lat: number }) => {
      if (!isContinents || continentsDone || !targetContinent) return;

      if (outlines.status === "ready") {
        const hit = continentAt(lngLat.lng, lngLat.lat, outlines.data);
        if (!hit) {
          showFeedback({ tone: "info", text: m.continents.ocean });
        } else if (!hit.materik) {
          const country = String((locale === "en" ? hit.country.NAME_EN ?? hit.country.NAME : hit.country.NAME_RU ?? hit.country.NAME) ?? "");
          showFeedback({ tone: "info", text: m.continents.island.replace("{country}", country) });
        } else {
          judgeContinentClick(hit.materik, lngLat.lat, lngLat.lng);
        }
        return;
      }

      // No outlines (still loading or the file is unreachable): ask the backend, which answers by rough regions.
      if (outlines.status === "loading") {
        showFeedback({ tone: "info", text: m.loadingData });
        return;
      }
      void lesson.exploreContinent(lngLat.lat, lngLat.lng).then((result) => {
        const clicked = result ? BACKEND_CONTINENT_TO_MATERIK[result.continent] : undefined;
        if (!clicked) showFeedback({ tone: "info", text: m.continents.ocean });
        else judgeContinentClick(clicked, lngLat.lat, lngLat.lng);
      });
    },
    [isContinents, continentsDone, targetContinent, outlines, locale, m, showFeedback, judgeContinentClick, lesson]
  );

  const flyTo = useCallback(
    (center: readonly [number, number], zoom: number) => {
      engine.getMap()?.flyTo({ center, zoom, pitch: 0, bearing: 0, duration: 2000, essential: true });
    },
    [engine]
  );
  const handleHint = useCallback(() => {
    if (!targetContinent) return;
    const view = MATERIK_VIEW[targetContinent];
    flyTo(view.center, view.zoom);
  }, [targetContinent, flyTo]);
  const handleResetView = useCallback(() => flyTo(LOCATIONS.earth.center, LOCATIONS.earth.zoom), [flyTo]);

  // ---- mission 3: layers of the Earth --------------------------------------------------

  const exploredLayerSet = useMemo(() => new Set<EarthLayerKey>(missions.exploredLayers), [missions.exploredLayers]);
  const handleExploreLayer = useCallback(
    (layer: EarthLayerKey) => {
      setSelectedLayerKey(layer);
      markLayerExplored(layer);
      // the layer's facts (depth, temperature, composition) come back from the backend
      void lesson.exploreLayer(layer);
    },
    [lesson, markLayerExplored]
  );

  // all three missions done — submit the attempt for scoring, once
  const attemptSubmittedRef = useRef(false);
  const allDone = missions.isLastMission && missions.isComplete;
  useEffect(() => {
    if (!allDone) {
      attemptSubmittedRef.current = false;
      return;
    }
    if (attemptSubmittedRef.current) return;
    attemptSubmittedRef.current = true;
    void lesson.completeAttempt();
  }, [allDone, lesson]);

  // ---- "Ask Teacher": the same compact context as before -------------------------------

  const aiContext = useMemo(
    () =>
      camera &&
      buildGeoAiContext({
        camera,
        actionsLog: lesson.actionsLog,
        selectedContinentName: lesson.selectedContinent?.name ?? null,
        completionScore: lesson.completionScore,
        activeLayers: earthScience,
        selectedFeature: featureInfo,
        climateScenario: { temperatureAnomaly: 0, triggered: false },
        earthStructureMode: isCore,
      }),
    [camera, lesson.actionsLog, lesson.selectedContinent, lesson.completionScore, earthScience, featureInfo, isCore]
  );

  const missionTitle: Record<GeoMissionId, string> = {
    "geo-mission-continents": m.continents.title,
    "geo-mission-volcanoes": m.volcanoes.title,
    "geo-mission-core": m.core.title,
  };

  const banner = (
    <TaskCompleteBanner
      visible={missions.isComplete}
      taskId={missionId}
      isLast={missions.isLastMission}
      title={missions.isLastMission ? m.allDoneTitle : m.completeTitle}
      subtitle={missions.isLastMission ? m.allDoneText : missionTitle[missionId]}
      xpReward={missions.mission.xpReward}
      nextLabel={m.nextButton}
      restartLabel={m.restartButton}
      onNext={missions.advance}
      onRestart={() => missions.goToMission(0)}
    />
  );

  return (
    <div className="rounded-2xl bg-gradient-to-b from-slate-900 via-slate-950 to-black p-3 sm:p-5">
      <div className="relative">
        {isCore ? (
          <EarthStructureMode
            exploredLayers={exploredLayerSet}
            selectedLayerKey={selectedLayerKey}
            selectedLayer={lesson.selectedLayer?.layer === selectedLayerKey ? lesson.selectedLayer : null}
            isSubmitting={false}
            onExploreLayer={handleExploreLayer}
          />
        ) : (
          <div className="relative h-[76vh] min-h-[460px]">
            <MapLibreGlobeCanvas
              esriEnabledByDefault={false}
              showPresets={false}
              onMapClick={handleMapClick}
              onCameraChange={setCamera}
              onEngineReady={handleEngineReady}
            />

            {isVolcanoes && (
              <div className="pointer-events-none absolute bottom-10 left-3 z-10 max-w-[18rem]">
                <EarthScienceLegend showTectonics showVolcanoes showEarthquakes={false} showClimate={false} />
              </div>
            )}

            {isVolcanoes && featureInfo && (
              <div className="absolute bottom-10 right-3 z-10 w-[min(22rem,calc(100%-1.5rem))]">
                <FeatureInfoPanel info={featureInfo} onClose={() => setFeatureInfo(null)} />
              </div>
            )}
          </div>
        )}

        {/* top-20: the simulation header floats over the top of the scene and reserves no space */}
        <div className="pointer-events-none absolute inset-x-0 top-20 z-20 flex justify-center">
          {missions.isComplete ? (
            banner
          ) : isContinents ? (
            <MissionHud
              prompt={m.continents.findPrompt}
              target={targetContinent ? m.continents.names[targetContinent] : undefined}
              done={missions.done}
              total={missions.mission.total}
              feedback={feedback}
              hintLabel={m.hintButton}
              onHint={handleHint}
              resetLabel={m.resetView}
              onResetView={handleResetView}
            />
          ) : isVolcanoes ? (
            <MissionHud
              prompt={m.volcanoes.prompt}
              done={missions.done}
              total={missions.mission.total}
              feedback={feedback}
              resetLabel={m.resetView}
              onResetView={() => flyTo(RING_OF_FIRE_VIEW.center, RING_OF_FIRE_VIEW.zoom)}
            />
          ) : null}
        </div>
      </div>

      <MissionPanel missions={missions} />

      {aiContext && (
        <div className="pointer-events-none fixed bottom-4 left-4 z-40">
          <div className="pointer-events-auto">
            <AskTeacherWidget world="geo" snapshot={buildGeoHelpContext(aiContext, { simulationId: simulation.id, lessonTitle: simulation.title })} />
          </div>
        </div>
      )}
    </div>
  );
}
