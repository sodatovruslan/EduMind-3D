// G6.11 §18 — renderer-independent AI context foundation. NOT wired to an
// actual AI chat/guide component yet (explicitly out of scope — that's
// G6.13's "AI Geo Guide"). This only defines the SHAPE: a small, plain,
// JSON-serializable object built from real state (lesson progress + camera
// position) — no raw MapLibre/Three.js instances, no hallucinated
// geolocation (camera center is reported as coordinates, never claimed to
// be a named place — see camera-context.ts).
import type { CameraContext } from "../maplibre/camera-context";
import type { GeoFeatureInfo } from "./featureInfo";

// G6.12 §38 — расширяет G6.11-контекст активными Earth Science слоями,
// выбранным объектом и состоянием климатического сценария/Earth Structure
// Mode. Всё ещё renderer-independent, всё ещё ТОЛЬКО компактная
// семантика — `selectedFeature` уже сжат до {kind,title,subtitle,lines}
// компонентом, который его строит (useEarthScienceLayers.ts), сырой
// GeoJSON сюда никогда не попадает (§38: "never send full raw GeoJSON").
// Полноценный AI Geo Guide, который реально использует этот контекст —
// G6.13, здесь он по-прежнему только считается, никуда не отправляется.
export interface GeoActiveLayers {
  tectonics: boolean;
  volcanoes: boolean;
  earthquakes: boolean;
  climate: boolean;
}

export interface GeoClimateScenarioContext {
  temperatureAnomaly: number;
  triggered: boolean;
}

export interface GeoAiContext {
  world: "geo3d";
  renderer: "maplibre";
  camera: CameraContext;
  lastAction: { type: string; [key: string]: unknown } | null;
  exploredLayers: string[];
  selectedContinent: string | null;
  actionsCount: number;
  completionScore: number | null;
  activeLayers: GeoActiveLayers;
  selectedFeature: GeoFeatureInfo | null;
  climateScenario: GeoClimateScenarioContext;
  earthStructureMode: boolean;
}

export interface GeoAiContextInput {
  camera: CameraContext;
  actionsLog: Array<Record<string, unknown>>;
  selectedContinentName: string | null;
  completionScore: number | null;
  activeLayers: GeoActiveLayers;
  selectedFeature: GeoFeatureInfo | null;
  climateScenario: GeoClimateScenarioContext;
  earthStructureMode: boolean;
}

export function buildGeoAiContext(input: GeoAiContextInput): GeoAiContext {
  const { camera, actionsLog, selectedContinentName, completionScore, activeLayers, selectedFeature, climateScenario, earthStructureMode } = input;
  const exploredLayers = actionsLog
    .filter((a) => a.action_type === "explore_layer" && typeof a.layer === "string")
    .map((a) => a.layer as string);
  const last = actionsLog[actionsLog.length - 1];
  return {
    world: "geo3d",
    renderer: "maplibre",
    camera,
    lastAction: last ? { type: String(last.action_type), ...last } : null,
    exploredLayers,
    selectedContinent: selectedContinentName,
    actionsCount: actionsLog.length,
    completionScore,
    activeLayers,
    selectedFeature,
    climateScenario,
    earthStructureMode,
  };
}
