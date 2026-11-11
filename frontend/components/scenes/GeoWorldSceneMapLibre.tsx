"use client";

// GeoWorld — the globe with three missions, built like the task flows of the
// Electricity and Chemistry labs:
//   1. Find the continents  — click the continent the prompt asks for.
//   2. Records of the Earth — find the longest river, the deepest trench…
//   3. Guess the country    — recognise a country from its outline alone.
//
// All three are played on the MapLibre renderer (satellite imagery, real
// terrain). The cut-open Earth (EarthStructureMode) is still here, but as a
// reference mode behind a button, not as a scored mission — and it still
// swaps places with the map, so the two heavy WebGL contexts never live at
// once.
//
// What counts as progress is decided from real actions on the globe, in the
// browser: every answer is a click tested against real geometry — Natural
// Earth country outlines, or the curated anchor of a record. The backend
// round-trips of useGeoLessonState are kept for scoring and for the layer
// facts, but a mission never waits on them.
//
// Country names are hidden in every mission on purpose: with labels on, all
// three tasks turn into reading instead of knowing the map.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/lib/locale-context";
import MapLibreGlobeCanvas from "@/components/geo/maplibre/MapLibreGlobeCanvas";
import EarthStructureMode from "@/components/geo/maplibre/EarthStructureMode";
import MissionHud, { type MissionFeedback } from "@/components/geo/missions/MissionHud";
import MissionPanel from "@/components/geo/missions/MissionPanel";
import CountrySilhouette from "@/components/geo/missions/CountrySilhouette";
import TaskCompleteBanner from "@/components/lab/TaskCompleteBanner";
import AskTeacherWidget from "@/components/help/AskTeacherWidget";
import { useGeoLessonState, type EarthLayerKey } from "@/lib/geo/education/useGeoLessonState";
import { useGeoMissions, type GeoMissionId } from "@/lib/geo/education/useGeoMissions";
import {
  MATERIK_VIEW,
  continentAt,
  countryAt,
  materikOfCountry,
  tagCountriesWithMaterik,
  type CountryCollection,
  type MaterikId,
} from "@/lib/geo/education/continents";
import { distanceToRecordKm, isRecordHit, recordById } from "@/lib/geo/education/geo-records";
import { cameraForBounds, silhouetteOfCountry } from "@/lib/geo/education/country-shapes";
import { buildGeoAiContext } from "@/lib/geo/education/aiContext";
import { buildGeoHelpContext } from "@/lib/help/contextAdapters";
import { useContinentHighlight } from "@/lib/geo/maplibre/useContinentHighlight";
import { useCountryHighlight } from "@/lib/geo/maplibre/useCountryHighlight";
import { setLabelsVisible } from "@/lib/geo/maplibre/base-layer-toggles";
import { BORDERS_URL } from "@/lib/geo/maplibre/labels";
import { LOCATIONS } from "@/lib/geo/maplibre/camera-presets";
import type { CameraContext } from "@/lib/geo/maplibre/camera-context";
import type { MapLibreGlobeState } from "@/lib/geo/maplibre/useMapLibreGlobe";
import type { Simulation } from "@/lib/types";

export interface GeoWorldSceneMapLibreProps {
  simulation: Simulation;
}

// how long a reaction to a click stays on screen, and how long a wrong answer flashes red
const FEEDBACK_MS = 4500;
const WRONG_FLASH_MS = 900;
const CITY_LAYER_IDS = ["city-point", "city-label"];
// one slow turn of the globe while the student has not touched it yet
const IDLE_SPIN = { degrees: 150, durationMs: 60_000 };
/** Under this distance the miss is called "very close" instead of "not there". */
const NEAR_MISS_KM = 1200;

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

/** A distance a student can read: tens of kilometres near by, hundreds far away. */
function roundKm(km: number): number {
  return km < 1000 ? Math.max(10, Math.round(km / 10) * 10) : Math.round(km / 100) * 100;
}

export default function GeoWorldSceneMapLibre({ simulation }: GeoWorldSceneMapLibreProps) {
  const { t, locale } = useLocale();
  const m = t.geo.missions;
  const lesson = useGeoLessonState(simulation.id);
  const missions = useGeoMissions(simulation.id);
  const outlines = useCountryOutlines();
  const countries = outlines.status === "ready" ? outlines.data : null;
  const taggedOutlines = useMemo(() => (countries ? tagCountriesWithMaterik(countries) : null), [countries]);

  const missionId: GeoMissionId = missions.mission.id;
  const isContinents = missionId === "geo-mission-continents";
  const isRecords = missionId === "geo-mission-records";
  const isShapes = missionId === "geo-mission-shapes";

  const [camera, setCamera] = useState<CameraContext | null>(null);
  const [engine, setEngine] = useState<{ getMap: () => any; status: MapLibreGlobeState["status"] }>({
    getMap: () => null,
    status: "loading",
  });
  const handleEngineReady = useCallback((getMap: () => any, status: MapLibreGlobeState["status"]) => {
    setEngine({ getMap, status });
  }, []);

  // the cut-open Earth: a reference mode, scores nothing, and takes the
  // WebGL context over from the map while it is open
  const [structureMode, setStructureMode] = useState(false);
  const [exploredLayers, setExploredLayers] = useState<Set<EarthLayerKey>>(() => new Set());
  const [selectedLayerKey, setSelectedLayerKey] = useState<EarthLayerKey | null>(null);
  const mapReady = engine.status === "ready" && !structureMode;

  const [feedback, setFeedback] = useState<MissionFeedback | null>(null);
  const [wrongContinent, setWrongContinent] = useState<MaterikId | null>(null);
  const [wrongCountry, setWrongCountry] = useState<string | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrongTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFeedback = useCallback((next: MissionFeedback) => {
    setFeedback(next);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), FEEDBACK_MS);
  }, []);

  const flashWrong = useCallback((apply: () => void, clear: () => void) => {
    apply();
    if (wrongTimerRef.current) clearTimeout(wrongTimerRef.current);
    wrongTimerRef.current = setTimeout(clear, WRONG_FLASH_MS);
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
    setWrongContinent(null);
    setWrongCountry(null);
  }, [missionId]);

  // ---- the globe per mission: labels and opening view ---------------------------------

  // Names on the map would answer every one of the three questions for the
  // student, so they stay off for all missions; city dots bury the globe in
  // clutter and read as "things to click".
  useEffect(() => {
    const map = engine.getMap();
    if (!map || !mapReady) return;
    try {
      setLabelsVisible(map, false);
      for (const id of CITY_LAYER_IDS) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
      }
    } catch {
      // label layers are part of the base style; if it is still loading they are simply set on the next run
    }
  }, [engine, mapReady]);

  // Opening view: the whole Earth. The continents mission also turns the
  // globe slowly until the student touches it (any drag or zoom stops it).
  useEffect(() => {
    const map = engine.getMap();
    if (!map || !mapReady) return;
    if (!isContinents) {
      map.flyTo({ center: LOCATIONS.earth.center, zoom: LOCATIONS.earth.zoom, pitch: 0, duration: 1800, essential: true });
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
  }, [engine, mapReady, isContinents]);

  useContinentHighlight({
    getMap: engine.getMap,
    mapReady,
    countries: taggedOutlines,
    enabled: isContinents,
    found: missions.foundContinents,
    wrong: wrongContinent,
  });

  useCountryHighlight({
    getMap: engine.getMap,
    mapReady,
    countries,
    enabled: isShapes,
    found: missions.foundShapes,
    wrong: wrongCountry,
  });

  const { markContinentFound, markRecordFound, markShapeFound, registerMiss } = missions;

  const flyTo = useCallback(
    (center: readonly [number, number], zoom: number) => {
      engine.getMap()?.flyTo({ center, zoom, pitch: 0, bearing: 0, duration: 2000, essential: true });
    },
    [engine]
  );
  const handleResetView = useCallback(() => flyTo(LOCATIONS.earth.center, LOCATIONS.earth.zoom), [flyTo]);

  const countryName = useCallback(
    (properties: Record<string, unknown>): string =>
      String((locale === "en" ? properties.NAME_EN ?? properties.NAME : properties.NAME_RU ?? properties.NAME) ?? ""),
    [locale]
  );

  // ---- mission 1: find the continents --------------------------------------------------

  const targetContinent = missions.targetContinent;

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
      registerMiss();
      showFeedback({
        tone: "error",
        text: m.continents.wrong.replace("{name}", names[clicked]).replace("{target}", names[targetContinent]),
      });
      flashWrong(
        () => setWrongContinent(clicked),
        () => setWrongContinent(null)
      );
    },
    [targetContinent, m, markContinentFound, registerMiss, showFeedback, flashWrong, lesson]
  );

  const handleContinentClick = useCallback(
    (lng: number, lat: number) => {
      if (!targetContinent) return;
      if (countries) {
        const hit = continentAt(lng, lat, countries);
        if (!hit) showFeedback({ tone: "info", text: m.continents.ocean });
        else if (!hit.materik) showFeedback({ tone: "info", text: m.continents.island.replace("{country}", countryName(hit.country)) });
        else judgeContinentClick(hit.materik, lat, lng);
        return;
      }
      if (outlines.status === "loading") {
        showFeedback({ tone: "info", text: m.loadingData });
        return;
      }
      // No outlines at all: ask the backend, which answers by rough regions.
      void lesson.exploreContinent(lat, lng).then((result) => {
        const clicked = result ? BACKEND_CONTINENT_TO_MATERIK[result.continent] : undefined;
        if (!clicked) showFeedback({ tone: "info", text: m.continents.ocean });
        else judgeContinentClick(clicked, lat, lng);
      });
    },
    [targetContinent, countries, outlines.status, m, countryName, showFeedback, judgeContinentClick, lesson]
  );

  // ---- mission 2: records of the Earth -------------------------------------------------

  const targetRecord = missions.targetRecord;
  const record = useMemo(() => (targetRecord ? recordById(targetRecord) : null), [targetRecord]);

  const handleRecordClick = useCallback(
    (lng: number, lat: number) => {
      if (!record) return;
      // a country answer cannot be judged without the outlines
      if (record.target.kind === "country" && !countries) {
        showFeedback({ tone: "info", text: outlines.status === "loading" ? m.loadingData : m.continents.ocean });
        return;
      }
      const click = [lng, lat] as const;
      if (isRecordHit(record, click, countries)) {
        markRecordFound(record.id);
        showFeedback({
          tone: "success",
          text: m.records.correct.replace("{name}", m.records.answers[record.id]),
          detail: m.records.facts[record.id],
        });
        flyTo(record.view.center, record.view.zoom);
        // a real place was found on the globe — logged for the backend score
        void lesson.exploreContinent(lat, lng);
        return;
      }
      registerMiss();
      const km = roundKm(distanceToRecordKm(record, click, countries));
      const template = km <= NEAR_MISS_KM ? m.records.wrongNear : m.records.wrongFar;
      showFeedback({ tone: "error", text: template.replace("{km}", String(km)) });
    },
    [record, countries, outlines.status, m, markRecordFound, registerMiss, showFeedback, flyTo, lesson]
  );

  // ---- mission 3: guess the country by its shape ---------------------------------------

  const targetShape = missions.targetShape;
  const silhouette = useMemo(
    () => (countries && targetShape ? silhouetteOfCountry(countries, targetShape) : null),
    [countries, targetShape]
  );

  const handleShapeClick = useCallback(
    (lng: number, lat: number) => {
      if (!targetShape) return;
      if (!countries) {
        showFeedback({ tone: "info", text: outlines.status === "loading" ? m.loadingData : m.shapes.ocean });
        return;
      }
      const hit = countryAt(lng, lat, countries);
      if (!hit) {
        showFeedback({ tone: "info", text: m.shapes.ocean });
        return;
      }
      const clickedCode = String(hit.ADM0_A3 ?? "");
      if (clickedCode === targetShape) {
        markShapeFound(clickedCode);
        showFeedback({ tone: "success", text: m.shapes.correct.replace("{name}", countryName(hit)) });
        void lesson.exploreContinent(lat, lng);
        return;
      }
      registerMiss();
      showFeedback({ tone: "error", text: m.shapes.wrong.replace("{name}", countryName(hit)) });
      flashWrong(
        () => setWrongCountry(clickedCode),
        () => setWrongCountry(null)
      );
    },
    [targetShape, countries, outlines.status, m, countryName, markShapeFound, registerMiss, showFeedback, flashWrong, lesson]
  );

  // ---- one click handler for the globe --------------------------------------------------

  const handleMapClick = useCallback(
    (lngLat: { lng: number; lat: number }) => {
      if (missions.isComplete) return;
      if (isContinents) handleContinentClick(lngLat.lng, lngLat.lat);
      else if (isRecords) handleRecordClick(lngLat.lng, lngLat.lat);
      else if (isShapes) handleShapeClick(lngLat.lng, lngLat.lat);
    },
    [missions.isComplete, isContinents, isRecords, isShapes, handleContinentClick, handleRecordClick, handleShapeClick]
  );

  // ---- hint and skip --------------------------------------------------------------------

  const handleHint = useCallback(() => {
    if (isContinents && targetContinent) {
      const view = MATERIK_VIEW[targetContinent];
      flyTo(view.center, view.zoom);
      return;
    }
    if (isRecords && record) {
      flyTo(record.view.center, record.view.zoom);
      return;
    }
    if (isShapes && targetShape && countries) {
      const feature = countries.features.find((f) => String(f.properties.ADM0_A3 ?? "") === targetShape);
      const materik = feature ? materikOfCountry(feature.properties, 0) : null;
      if (materik) {
        showFeedback({ tone: "info", text: m.shapes.hintContinent.replace("{continent}", m.continents.names[materik]) });
        const view = MATERIK_VIEW[materik];
        flyTo(view.center, view.zoom);
      } else if (silhouette) {
        const view = cameraForBounds(silhouette.bounds);
        flyTo(view.center, Math.max(1.4, view.zoom - 2));
      }
    }
  }, [isContinents, targetContinent, isRecords, record, isShapes, targetShape, countries, silhouette, m, showFeedback, flyTo]);

  // skipping only makes sense where a single question can block the run
  const canSkip = (isRecords || isShapes) && missions.hintOffered;

  // ---- the reference mode: the Earth cut open -------------------------------------------

  const handleExploreLayer = useCallback(
    (layer: EarthLayerKey) => {
      setSelectedLayerKey(layer);
      setExploredLayers((prev) => (prev.has(layer) ? prev : new Set(prev).add(layer)));
      // the layer's facts (depth, temperature, composition) come back from the backend
      void lesson.exploreLayer(layer);
    },
    [lesson]
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

  // ---- "Ask Teacher": the same compact context as before ---------------------------------

  const noLayers = useMemo(() => ({ tectonics: false, volcanoes: false, earthquakes: false, climate: false }), []);
  const aiContext = useMemo(
    () =>
      camera &&
      buildGeoAiContext({
        camera,
        actionsLog: lesson.actionsLog,
        selectedContinentName: lesson.selectedContinent?.name ?? null,
        completionScore: lesson.completionScore,
        activeLayers: noLayers,
        selectedFeature: null,
        climateScenario: { temperatureAnomaly: 0, triggered: false },
        earthStructureMode: structureMode,
      }),
    [camera, lesson.actionsLog, lesson.selectedContinent, lesson.completionScore, noLayers, structureMode]
  );

  // Test bridge, same idea as __e2eGeoMap next door: which question is on
  // screen right now. A browser test cannot read it off the globe (the
  // whole point of the missions is that nothing is labelled), and the
  // questions are reshuffled every run. Dev builds only.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as any).__e2eGeoMission = () => ({
      missionId,
      target: isContinents ? targetContinent : isRecords ? targetRecord : targetShape,
      done: missions.done,
      total: missions.mission.total,
      isComplete: missions.isComplete,
    });
  }, [missionId, isContinents, isRecords, targetContinent, targetRecord, targetShape, missions.done, missions.mission.total, missions.isComplete]);

  const missionTitle: Record<GeoMissionId, string> = {
    "geo-mission-continents": m.continents.title,
    "geo-mission-records": m.records.title,
    "geo-mission-shapes": m.shapes.title,
  };

  const hudPrompt = isContinents ? m.continents.findPrompt : isRecords ? m.records.prompt : m.shapes.prompt;
  const hudTarget = isContinents
    ? targetContinent
      ? m.continents.names[targetContinent]
      : undefined
    : isRecords && targetRecord
      ? m.records.questions[targetRecord]
      : undefined;

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
        {structureMode ? (
          <EarthStructureMode
            exploredLayers={exploredLayers}
            selectedLayerKey={selectedLayerKey}
            selectedLayer={lesson.selectedLayer?.layer === selectedLayerKey ? lesson.selectedLayer : null}
            isSubmitting={false}
            onExploreLayer={handleExploreLayer}
            onReturnToSurface={() => setStructureMode(false)}
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

            {isShapes && !missions.isComplete && (
              <div className="absolute bottom-10 left-3 z-10">
                <CountrySilhouette silhouette={silhouette} caption={m.shapes.caption} />
              </div>
            )}

            <div className="absolute bottom-10 right-3 z-10">
              <button
                type="button"
                onClick={() => setStructureMode(true)}
                title={m.structure.note}
                data-testid="geo-structure-open"
                className="ds-focus-ring pointer-events-auto rounded-full border border-white/15 bg-slate-950/80 px-3 py-1.5 text-xs font-medium text-slate-100 backdrop-blur-md transition-colors hover:bg-white/10"
              >
                {m.structure.openButton}
              </button>
            </div>
          </div>
        )}

        {/* top-20: the simulation header floats over the top of the scene and reserves no space */}
        {!structureMode && (
          <div className="pointer-events-none absolute inset-x-0 top-20 z-20 flex justify-center">
            {missions.isComplete ? (
              banner
            ) : (
              <MissionHud
                prompt={hudPrompt}
                target={hudTarget}
                done={missions.done}
                total={missions.mission.total}
                feedback={feedback}
                hintLabel={m.hintButton}
                onHint={handleHint}
                skipLabel={canSkip ? m.skipButton : undefined}
                onSkip={canSkip ? missions.skipTarget : undefined}
                resetLabel={m.resetView}
                onResetView={handleResetView}
              />
            )}
          </div>
        )}
      </div>

      <MissionPanel missions={missions} countries={countries} />

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
