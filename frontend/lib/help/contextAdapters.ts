import type { HelpContextSnapshot } from "@/lib/help-client";
import type { LabAIContext } from "@/lib/ai-context-builder";
import type { ChemistryAIContext } from "@/lib/chemistry-context-builder";
import type { GeoAiContext } from "@/lib/geo/education/aiContext";

/**
 * T10 §37 — shared HelpContext "adapters", one thin function per world.
 * Deliberately NOT a from-scratch scan of each world's raw
 * state/renderer objects: Electricity/Chemistry/GeoWorld already each
 * have a purpose-built, renderer-independent AI-context builder
 * (ai-context-builder.ts / chemistry-context-builder.ts /
 * geo/education/aiContext.ts) used for the (currently unwired) AI
 * Teacher/Guide features — these adapters just RE-SHAPE that already-
 * compact object into the backend's whitelisted HelpContextSnapshot
 * (brief §32), never touch Three.js/MapLibre/inventory state directly.
 *
 * `context_version: 1` (brief §38) — bump this (and the backend schema's
 * CONTEXT_SCHEMA_VERSION) together if the shape ever needs to change;
 * unknown/older fields are ignored server-side, not hard-rejected, so
 * there's no migration engine to build for this.
 */
const CONTEXT_VERSION = 1;

function trim(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

export function buildElectricityHelpContext(
  context: LabAIContext,
  params: { simulationId?: string | null; selectedComponentId?: string | null }
): HelpContextSnapshot {
  const { physics, currentTask, labExperience, components } = context;
  const selectedComponent = params.selectedComponentId ? components.find((c) => c.id === params.selectedComponentId) : null;

  const safetyState = physics.isShortCircuit ? "short_circuit" : physics.fuseState === "BLOWN" ? "fuse_blown" : "normal";

  const measurements: Record<string, string> = {
    voltage_v: String(physics.voltageV),
    current_a: String(physics.currentA),
    resistance_ohm: String(physics.resistanceOhm),
  };

  const extra: Record<string, string> = {
    switch_state: physics.switchState,
    lamp_state: physics.lampState,
    fuse_state: physics.fuseState,
  };

  const experiment = labExperience?.currentExperiment;

  return {
    world: "electricity",
    context_version: CONTEXT_VERSION,
    simulation_id: params.simulationId ?? null,
    experiment_id: experiment?.id ?? currentTask?.id ?? null,
    task_id: currentTask?.id ?? null,
    task_title: trim(experiment?.title ?? currentTask?.title ?? null, 300),
    current_step: trim(labExperience?.currentStep?.instruction ?? null, 300),
    progress: null,
    selected_object: selectedComponent ? `${selectedComponent.kind} (${selectedComponent.id})` : null,
    safety_state: safetyState,
    measurements,
    extra,
  };
}

export function buildChemistryHelpContext(
  context: ChemistryAIContext,
  params: { simulationId?: string | null; selectedObjectLabel?: string | null }
): HelpContextSnapshot {
  const { currentExperiment, temperature, laboratoryState, hazard, safetyWarnings, labExperience } = context;

  const safetyState = hazard ? hazard.level : safetyWarnings[0]?.code ?? "normal";

  const measurements: Record<string, string> = {
    temperature_c: String(temperature),
    total_mass_g: String(laboratoryState.totalMassG),
    total_volume_ml: String(laboratoryState.totalVolumeMl),
  };

  const extra: Record<string, string> = { aggregate_state: laboratoryState.aggregateState };
  if (hazard) {
    extra.pressure_kpa = String(hazard.pressureKPa);
    extra.container_integrity = hazard.containerIntegrityLevel;
  }
  if (labExperience) extra.mode = labExperience.mode;

  return {
    world: "chemistry",
    context_version: CONTEXT_VERSION,
    simulation_id: params.simulationId ?? null,
    experiment_id: currentExperiment?.id ?? null,
    task_id: null,
    task_title: trim(currentExperiment?.title ?? null, 300),
    current_step: trim(labExperience?.currentStep?.instruction ?? null, 300),
    progress: null,
    selected_object: trim(params.selectedObjectLabel ?? laboratoryState.containerId, 300),
    safety_state: trim(safetyState, 300),
    measurements,
    extra,
  };
}

export function buildGeoHelpContext(
  context: GeoAiContext,
  params: { simulationId?: string | null; lessonTitle?: string | null }
): HelpContextSnapshot {
  const { camera, selectedFeature, selectedContinent, climateScenario, activeLayers, earthStructureMode, completionScore } = context;

  const selectedObject = selectedFeature
    ? `${selectedFeature.kind}: ${selectedFeature.title}`
    : selectedContinent
      ? `continent: ${selectedContinent}`
      : null;

  const activeLayerNames = (Object.keys(activeLayers) as Array<keyof typeof activeLayers>).filter((key) => activeLayers[key]);

  // Camera is reported as plain numbers, same restraint as camera-
  // context.ts itself (brief §7's "camera region summary where
  // reliable" is deliberately NOT a claimed place name — no region
  // lookup exists in this codebase, and this adapter doesn't invent one).
  const extra: Record<string, string> = {
    active_layers: activeLayerNames.join(",") || "none",
    earth_structure_mode: String(earthStructureMode),
    camera_center: `${camera.center[0].toFixed(2)},${camera.center[1].toFixed(2)}`,
    camera_zoom: camera.zoom.toFixed(1),
  };
  if (climateScenario.triggered) {
    extra.climate_temperature_anomaly = `+${climateScenario.temperatureAnomaly}°C`;
  }

  return {
    world: "geo",
    context_version: CONTEXT_VERSION,
    simulation_id: params.simulationId ?? null,
    experiment_id: null,
    task_id: null,
    task_title: trim(params.lessonTitle ?? null, 300),
    current_step: null,
    progress: completionScore,
    selected_object: trim(selectedObject, 300),
    safety_state: null,
    measurements: null,
    extra,
  };
}
