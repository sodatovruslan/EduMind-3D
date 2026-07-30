import { describe, expect, it } from "vitest";
import { addSubstance, createEmptyContainer, heat, SUBSTANCES } from "./chemistry-engine";
import { applyReactions } from "./reaction-engine";
import { EXPERIMENTS, ExperimentStatus, deriveExperimentStatus, validateExperiment, type LabState } from "./experiment-validator";

function experimentById(id: string) {
  const experiment = EXPERIMENTS.find((e) => e.id === id);
  if (!experiment) throw new Error(`experiment ${id} not found`);
  return experiment;
}

describe("experiment-validator — dissolution", () => {
  const experiment = experimentById("experiment-1-dissolve-salt");

  it("completes when salt fully dissolves in water", () => {
    let c = createEmptyContainer("c1", "beaker");
    c = addSubstance(c, "water", 500);
    c = addSubstance(c, "nacl", 50); // ниже предела растворимости
    const state: LabState = { container: c, occurredReactionIds: [] };

    const result = validateExperiment(experiment, state);
    expect(result.completed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails with salt_not_dissolved when the solubility limit is exceeded", () => {
    let c = createEmptyContainer("c1", "beaker");
    c = addSubstance(c, "water", 500);
    c = addSubstance(c, "nacl", 300); // выше предела (180 г при 0.5 л)
    const state: LabState = { container: c, occurredReactionIds: [] };

    const result = validateExperiment(experiment, state);
    expect(result.completed).toBe(false);
    expect(result.errors.some((e) => e.code === "salt_not_dissolved")).toBe(true);
  });

  it("reports no_water and no_salt on an empty container", () => {
    const c = createEmptyContainer("c1", "beaker");
    const state: LabState = { container: c, occurredReactionIds: [] };
    const result = validateExperiment(experiment, state);
    expect(result.completed).toBe(false);
    expect(result.errors.map((e) => e.code)).toEqual(expect.arrayContaining(["no_water", "no_salt"]));
  });
});

describe("experiment-validator — neutralization", () => {
  const experiment = experimentById("experiment-2-neutralization");

  it("completes once the Reaction Engine actually reports the neutralization", () => {
    let c = createEmptyContainer("c1", "beaker", 20);
    c = addSubstance(c, "hcl", SUBSTANCES.hcl.molarMassGPerMol);
    c = addSubstance(c, "naoh", SUBSTANCES.naoh.molarMassGPerMol);
    const { container, occurredReactions } = applyReactions(c);

    const result = validateExperiment(experiment, { container, occurredReactionIds: occurredReactions.map((r) => r.id) });
    expect(result.completed).toBe(true);
  });

  it("reports missing_base when only the acid was added", () => {
    let c = createEmptyContainer("c1", "beaker", 20);
    c = addSubstance(c, "hcl", 20);
    const result = validateExperiment(experiment, { container: c, occurredReactionIds: [] });
    expect(result.completed).toBe(false);
    expect(result.errors.some((e) => e.code === "missing_base")).toBe(true);
  });
});

describe("experiment-validator — precipitation", () => {
  const experiment = experimentById("experiment-3-precipitation");

  it("completes once AgCl precipitate actually forms", () => {
    let c = createEmptyContainer("c1", "test_tube", 20);
    c = addSubstance(c, "water", 500);
    c = addSubstance(c, "nacl", SUBSTANCES.nacl.molarMassGPerMol);
    c = addSubstance(c, "agno3", SUBSTANCES.agno3.molarMassGPerMol);
    const { container, occurredReactions } = applyReactions(c);

    const result = validateExperiment(experiment, { container, occurredReactionIds: occurredReactions.map((r) => r.id) });
    expect(result.completed).toBe(true);
    expect(result.measurements.precipitateG).toBeGreaterThan(0);
  });

  it("does not complete from an unrelated reaction (e.g. neutralization only)", () => {
    let c = createEmptyContainer("c1", "test_tube", 20);
    c = addSubstance(c, "hcl", SUBSTANCES.hcl.molarMassGPerMol);
    c = addSubstance(c, "naoh", SUBSTANCES.naoh.molarMassGPerMol);
    const { container, occurredReactions } = applyReactions(c);

    const result = validateExperiment(experiment, { container, occurredReactionIds: occurredReactions.map((r) => r.id) });
    expect(result.completed).toBe(false);
  });
});

describe("experiment-validator — heating water", () => {
  const experiment = experimentById("experiment-4-heat-water");

  it("completes once water reaches boiling point", () => {
    let c = createEmptyContainer("c1", "beaker", 20);
    c = addSubstance(c, "water", 200);
    c = heat(c, 85); // 20 -> 105
    const result = validateExperiment(experiment, { container: c, occurredReactionIds: [] });
    expect(result.completed).toBe(true);
  });

  it("reports not_hot_enough below 100°C", () => {
    let c = createEmptyContainer("c1", "beaker", 20);
    c = addSubstance(c, "water", 200);
    c = heat(c, 30); // 20 -> 50
    const result = validateExperiment(experiment, { container: c, occurredReactionIds: [] });
    expect(result.completed).toBe(false);
    expect(result.errors.some((e) => e.code === "not_hot_enough")).toBe(true);
  });
});

describe("experiment-validator — deriveExperimentStatus", () => {
  it("is NOT_STARTED before any interaction", () => {
    const c = createEmptyContainer("c1", "beaker");
    const result = validateExperiment(experimentById("experiment-1-dissolve-salt"), { container: c, occurredReactionIds: [] });
    expect(deriveExperimentStatus(result, false)).toBe(ExperimentStatus.NOT_STARTED);
  });

  it("is IN_PROGRESS once started but not completed", () => {
    let c = createEmptyContainer("c1", "beaker");
    c = addSubstance(c, "water", 100);
    const result = validateExperiment(experimentById("experiment-1-dissolve-salt"), { container: c, occurredReactionIds: [] });
    expect(deriveExperimentStatus(result, true)).toBe(ExperimentStatus.IN_PROGRESS);
  });

  it("is COMPLETED when the validator reports completed", () => {
    let c = createEmptyContainer("c1", "beaker");
    c = addSubstance(c, "water", 500);
    c = addSubstance(c, "nacl", 50);
    const result = validateExperiment(experimentById("experiment-1-dissolve-salt"), { container: c, occurredReactionIds: [] });
    expect(deriveExperimentStatus(result, true)).toBe(ExperimentStatus.COMPLETED);
  });
});
