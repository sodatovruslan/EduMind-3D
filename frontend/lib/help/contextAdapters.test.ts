import { describe, expect, it } from "vitest";
import { buildChemistryHelpContext, buildElectricityHelpContext, buildGeoHelpContext } from "./contextAdapters";
import type { LabAIContext } from "@/lib/ai-context-builder";
import type { ChemistryAIContext } from "@/lib/chemistry-context-builder";
import type { GeoAiContext } from "@/lib/geo/education/aiContext";

const WHITELISTED_KEYS = new Set([
  "world",
  "context_version",
  "simulation_id",
  "experiment_id",
  "task_id",
  "task_title",
  "current_step",
  "progress",
  "selected_object",
  "safety_state",
  "measurements",
  "extra",
]);

function makeLabAIContext(overrides: Partial<LabAIContext> = {}): LabAIContext {
  return {
    currentTask: { id: "task-1", title: "Ohm's Law", difficulty: "easy" },
    taskStatus: "in_progress" as LabAIContext["taskStatus"],
    xp: 10,
    physics: {
      currentA: 0.5,
      voltageV: 9,
      resistanceOhm: 220,
      isCircuitActive: true,
      isShortCircuit: false,
      isClosedLoop: true,
      switchState: "CLOSED",
      fuseState: "OK",
      lampState: "ON",
    },
    validation: { completed: false, errors: [], warnings: [], measurements: {} },
    connections: [],
    components: [{ id: "resistor-220", kind: "resistor" }],
    labExperience: null,
    ...overrides,
  };
}

describe("buildElectricityHelpContext", () => {
  it("maps physics/task fields into a compact, whitelisted snapshot", () => {
    const snapshot = buildElectricityHelpContext(makeLabAIContext(), { simulationId: "sim-1", selectedComponentId: "resistor-220" });

    expect(snapshot.world).toBe("electricity");
    expect(snapshot.context_version).toBe(1);
    expect(snapshot.simulation_id).toBe("sim-1");
    expect(snapshot.task_id).toBe("task-1");
    expect(snapshot.task_title).toBe("Ohm's Law");
    expect(snapshot.selected_object).toBe("resistor (resistor-220)");
    expect(snapshot.safety_state).toBe("normal");
    expect(snapshot.measurements).toEqual({ voltage_v: "9", current_a: "0.5", resistance_ohm: "220" });
    expect(Object.keys(snapshot).every((k) => WHITELISTED_KEYS.has(k))).toBe(true);
  });

  it("reports short_circuit as the safety state when the circuit is shorted", () => {
    const snapshot = buildElectricityHelpContext(makeLabAIContext({ physics: { ...makeLabAIContext().physics, isShortCircuit: true } }), {});
    expect(snapshot.safety_state).toBe("short_circuit");
  });

  it("reports fuse_blown when the fuse is blown (and not shorted)", () => {
    const snapshot = buildElectricityHelpContext(makeLabAIContext({ physics: { ...makeLabAIContext().physics, fuseState: "BLOWN" } }), {});
    expect(snapshot.safety_state).toBe("fuse_blown");
  });

  it("prefers the guided-lab experiment's id/title over the quick-task's when present", () => {
    const context = makeLabAIContext({
      labExperience: {
        currentExperiment: { id: "ohms-law-guided", title: "Guided Ohm's Law", difficulty: "easy", goal: "measure" },
        currentStep: { kind: "measure", instruction: "Measure the current", unlocked: true },
        measurementsRecorded: 0,
        recentMeasurements: [],
        completedExperimentIds: [],
        lastNotebookEntry: null,
        conclusionDraft: "",
      },
    });
    const snapshot = buildElectricityHelpContext(context, {});
    expect(snapshot.experiment_id).toBe("ohms-law-guided");
    expect(snapshot.task_title).toBe("Guided Ohm's Law");
    expect(snapshot.current_step).toBe("Measure the current");
  });

  it("never includes raw renderer objects — no components/connections arrays leak through", () => {
    const snapshot = buildElectricityHelpContext(makeLabAIContext(), {});
    expect(snapshot).not.toHaveProperty("components");
    expect(snapshot).not.toHaveProperty("connections");
  });
});

function makeChemistryAIContext(overrides: Partial<ChemistryAIContext> = {}): ChemistryAIContext {
  return {
    currentExperiment: { id: "acid-base", title: "Acid-Base Titration", difficulty: "medium" },
    experimentStatus: "in_progress" as ChemistryAIContext["experimentStatus"],
    temperature: 22,
    substances: [],
    reactions: [],
    validation: { completed: false, errors: [], warnings: [], measurements: {} },
    laboratoryState: { containerId: "beaker-1", totalMassG: 50, totalVolumeMl: 100, colorHex: "#ffffff", aggregateState: "liquid" as ChemistryAIContext["laboratoryState"]["aggregateState"] },
    safetyWarnings: [],
    hazard: null,
    labExperience: null,
    ...overrides,
  };
}

describe("buildChemistryHelpContext", () => {
  it("maps experiment/temperature/laboratory state into a compact snapshot", () => {
    const snapshot = buildChemistryHelpContext(makeChemistryAIContext(), { simulationId: "sim-2" });
    expect(snapshot.world).toBe("chemistry");
    expect(snapshot.experiment_id).toBe("acid-base");
    expect(snapshot.task_title).toBe("Acid-Base Titration");
    expect(snapshot.safety_state).toBe("normal");
    expect(snapshot.measurements).toEqual({ temperature_c: "22", total_mass_g: "50", total_volume_ml: "100" });
  });

  it("reports the hazard level as safety_state when a hazard is active", () => {
    const snapshot = buildChemistryHelpContext(
      makeChemistryAIContext({
        hazard: {
          level: "boiling",
          causes: [],
          temperatureC: 105,
          pressureKPa: 120,
          gasAmountG: 0,
          pressureRatio: 1.2,
          temperatureRatio: 1.1,
          containerIntegrityLevel: "stable",
          isSealed: false,
          hasHeatSource: true,
          shouldStopExperiment: false,
          recentAccidentLog: [],
        },
      }),
      {}
    );
    expect(snapshot.safety_state).toBe("boiling");
    expect(snapshot.extra?.pressure_kpa).toBe("120");
  });

  it("falls back to the first safety warning code when there is no hazard", () => {
    const snapshot = buildChemistryHelpContext(makeChemistryAIContext({ safetyWarnings: [{ code: "overheating", message: "too hot", severity: "warning" }] }), {});
    expect(snapshot.safety_state).toBe("overheating");
  });

  it("never sends the full inventory/workspace state — only the derived laboratory summary", () => {
    const snapshot = buildChemistryHelpContext(makeChemistryAIContext(), {});
    expect(snapshot).not.toHaveProperty("substances");
    expect(snapshot).not.toHaveProperty("containers");
  });
});

function makeGeoAiContext(overrides: Partial<GeoAiContext> = {}): GeoAiContext {
  return {
    world: "geo3d",
    renderer: "maplibre",
    camera: { center: [68.78, 38.86], zoom: 4.2, bearing: 0, pitch: 0 },
    lastAction: null,
    exploredLayers: [],
    selectedContinent: null,
    actionsCount: 0,
    completionScore: 40,
    activeLayers: { tectonics: true, volcanoes: false, earthquakes: false, climate: false },
    selectedFeature: null,
    climateScenario: { temperatureAnomaly: 0, triggered: false },
    earthStructureMode: false,
    ...overrides,
  };
}

describe("buildGeoHelpContext", () => {
  it("maps camera/layers/progress into a compact snapshot, never a raw GeoJSON feature", () => {
    const snapshot = buildGeoHelpContext(makeGeoAiContext(), { simulationId: "sim-3", lessonTitle: "Earth Structure" });
    expect(snapshot.world).toBe("geo");
    expect(snapshot.task_title).toBe("Earth Structure");
    expect(snapshot.progress).toBe(40);
    expect(snapshot.extra?.active_layers).toBe("tectonics");
    expect(snapshot.extra?.camera_zoom).toBe("4.2");
  });

  it("formats the selected feature as 'kind: title', never the raw feature object", () => {
    const snapshot = buildGeoHelpContext(
      makeGeoAiContext({ selectedFeature: { kind: "volcano", title: "Klyuchevskaya", lines: [] } }),
      {}
    );
    expect(snapshot.selected_object).toBe("volcano: Klyuchevskaya");
  });

  it("falls back to the selected continent when there is no selected feature", () => {
    const snapshot = buildGeoHelpContext(makeGeoAiContext({ selectedContinent: "Asia" }), {});
    expect(snapshot.selected_object).toBe("continent: Asia");
  });

  it("reports the climate anomaly only when the scenario actually triggered", () => {
    const untriggered = buildGeoHelpContext(makeGeoAiContext({ climateScenario: { temperatureAnomaly: 2, triggered: false } }), {});
    expect(untriggered.extra?.climate_temperature_anomaly).toBeUndefined();

    const triggered = buildGeoHelpContext(makeGeoAiContext({ climateScenario: { temperatureAnomaly: 3, triggered: true } }), {});
    expect(triggered.extra?.climate_temperature_anomaly).toBe("+3°C");
  });

  it("never claims a named region from camera coordinates — reports plain numbers only", () => {
    const snapshot = buildGeoHelpContext(makeGeoAiContext(), {});
    expect(snapshot.extra?.camera_center).toBe("68.78,38.86");
  });
});
