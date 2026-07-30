import { describe, expect, it } from "vitest";
import { addSubstance, createEmptyContainer, heat } from "./chemistry-engine";
import { applyReactions } from "./reaction-engine";
import { EXPERIMENTS, ExperimentStatus, validateExperiment } from "./experiment-validator";
import { checkSafety } from "./chemistry-safety";
import { buildChemistryAIContext } from "./chemistry-context-builder";
import { CONTAINER_PHYSICS, createDefaultIntegrity } from "./container-physics";
import { AMBIENT_PRESSURE_KPA } from "./pressure-engine";
import { evaluateHazard } from "./hazard-engine";

describe("chemistry-context-builder — buildChemistryAIContext", () => {
  it("reflects real dissolved/precipitated substances and never invents an error absent from validation", () => {
    let c = createEmptyContainer("c1", "beaker", 20);
    c = addSubstance(c, "water", 500);
    c = addSubstance(c, "nacl", 300); // выше предела растворимости -> часть в осадке
    const experiment = EXPERIMENTS[0];
    const validation = validateExperiment(experiment, { container: c, occurredReactionIds: [] });
    const safetyWarnings = checkSafety({ container: c });

    const ctx = buildChemistryAIContext({
      experiment,
      experimentStatus: ExperimentStatus.IN_PROGRESS,
      container: c,
      occurredReactionIds: [],
      validation,
      safetyWarnings,
    });

    expect(ctx.substances.some((s) => s.id === "nacl" && s.dissolved && s.amountG > 0)).toBe(true);
    expect(ctx.substances.some((s) => s.id === "nacl" && !s.dissolved && s.amountG > 0)).toBe(true);
    expect(ctx.validation.errors).toEqual(validation.errors.map((e) => ({ code: e.code, message: e.message })));
    expect(ctx.temperature).toBe(20);
  });

  it("marks only the reaction that actually occurred as occurred:true", () => {
    let c = createEmptyContainer("c1", "beaker", 20);
    c = addSubstance(c, "hcl", 40);
    c = addSubstance(c, "naoh", 40);
    const { container, occurredReactions } = applyReactions(c);
    const experiment = EXPERIMENTS.find((e) => e.id === "experiment-2-neutralization")!;
    const occurredIds = occurredReactions.map((r) => r.id);
    const validation = validateExperiment(experiment, { container, occurredReactionIds: occurredIds });

    const ctx = buildChemistryAIContext({
      experiment,
      experimentStatus: ExperimentStatus.COMPLETED,
      container,
      occurredReactionIds: occurredIds,
      validation,
      safetyWarnings: [],
    });

    const neutralization = ctx.reactions.find((r) => r.id === "neutralization-hcl-naoh");
    const precipitation = ctx.reactions.find((r) => r.id === "precipitation-agno3-nacl");
    expect(neutralization?.occurred).toBe(true);
    expect(precipitation?.occurred).toBe(false);
  });

  it("forwards real safety warnings unchanged", () => {
    let c = createEmptyContainer("c1", "beaker");
    c = addSubstance(c, "hcl", 20); // ничего кроме кислоты — сработает empty-ish/dilution-type checks
    const safetyWarnings = checkSafety({ container: c });
    const experiment = EXPERIMENTS[1];
    const validation = validateExperiment(experiment, { container: c, occurredReactionIds: [] });

    const ctx = buildChemistryAIContext({
      experiment,
      experimentStatus: ExperimentStatus.IN_PROGRESS,
      container: c,
      occurredReactionIds: [],
      validation,
      safetyWarnings,
    });

    expect(ctx.safetyWarnings).toEqual(safetyWarnings);
  });

  it("hazard остается null, если не передан (обратная совместимость с существующими вызывающими)", () => {
    const c = createEmptyContainer("c1", "beaker", 20);
    const experiment = EXPERIMENTS[0];
    const validation = validateExperiment(experiment, { container: c, occurredReactionIds: [] });
    const ctx = buildChemistryAIContext({
      experiment,
      experimentStatus: ExperimentStatus.NOT_STARTED,
      container: c,
      occurredReactionIds: [],
      validation,
      safetyWarnings: [],
    });
    expect(ctx.hazard).toBeNull();
  });

  it("при переданном hazard передает реальные детерминированные причины, а не текст от AI", () => {
    let c = createEmptyContainer("c1", "beaker", 20);
    c = addSubstance(c, "water", 300);
    c = heat(c, 90);
    const profile = CONTAINER_PHYSICS.beaker;
    const hazard = evaluateHazard({
      container: c,
      profile,
      isSealed: true,
      hasHeatSource: true,
      safetyWarnings: [],
      reactionLog: [],
      previousIntegrity: createDefaultIntegrity(profile),
      previousPressureKPa: AMBIENT_PRESSURE_KPA,
      previousTemperatureC: 20,
      dtSeconds: 1,
    });

    const experiment = EXPERIMENTS[0];
    const validation = validateExperiment(experiment, { container: c, occurredReactionIds: [] });
    const ctx = buildChemistryAIContext({
      experiment,
      experimentStatus: ExperimentStatus.IN_PROGRESS,
      container: c,
      occurredReactionIds: [],
      validation,
      safetyWarnings: [],
      hazard,
      accidentLog: [],
    });

    expect(ctx.hazard).not.toBeNull();
    expect(ctx.hazard?.level).toBe(hazard.level);
    expect(ctx.hazard?.isSealed).toBe(true);
    expect(ctx.hazard?.pressureKPa).toBeCloseTo(hazard.pressureKPa, 5);
  });
});
