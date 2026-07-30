import { describe, expect, it } from "vitest";
import { addSubstance, createEmptyContainer, SUBSTANCES } from "./chemistry-engine";
import { applyReactions, getRegisteredReactions, registerReaction } from "./reaction-engine";

describe("reaction-engine — registry", () => {
  it("has the first Stage 5 reaction set registered", () => {
    const ids = getRegisteredReactions().map((r) => r.id);
    expect(ids).toContain("neutralization-hcl-naoh");
    expect(ids).toContain("precipitation-agno3-nacl");
    expect(ids).toContain("precipitation-cuso4-naoh");
  });

  it("refuses to register a reaction with a duplicate id", () => {
    expect(() =>
      registerReaction({
        id: "neutralization-hcl-naoh",
        title: "dup",
        description: "dup",
        reactants: [],
        products: [],
        isExothermic: false,
      })
    ).toThrow();
  });
});

describe("reaction-engine — neutralization", () => {
  it("converts HCl + NaOH into NaCl + water using real stoichiometry and releases heat", () => {
    let c = createEmptyContainer("c1", "beaker", 20);
    c = addSubstance(c, "hcl", SUBSTANCES.hcl.molarMassGPerMol); // ровно 1 моль HCl
    c = addSubstance(c, "naoh", SUBSTANCES.naoh.molarMassGPerMol); // ровно 1 моль NaOH

    const { container, occurredReactions } = applyReactions(c);

    expect(occurredReactions.map((r) => r.id)).toContain("neutralization-hcl-naoh");
    expect(container.contents.find((x) => x.substanceId === "hcl")).toBeUndefined();
    expect(container.contents.find((x) => x.substanceId === "naoh")).toBeUndefined();
    expect(container.contents.find((x) => x.substanceId === "nacl")?.grams).toBeCloseTo(SUBSTANCES.nacl.molarMassGPerMol, 3);
    expect(container.temperatureC).toBeGreaterThan(20); // экзотермическая реакция подняла температуру
  });

  it("stops at the limiting reagent and leaves the excess untouched", () => {
    let c = createEmptyContainer("c1", "beaker", 20);
    c = addSubstance(c, "hcl", SUBSTANCES.hcl.molarMassGPerMol * 2); // 2 моль HCl
    c = addSubstance(c, "naoh", SUBSTANCES.naoh.molarMassGPerMol); // только 1 моль NaOH — лимитирующий

    const { container } = applyReactions(c);

    expect(container.contents.find((x) => x.substanceId === "naoh")).toBeUndefined();
    expect(container.contents.find((x) => x.substanceId === "hcl")?.grams).toBeCloseTo(SUBSTANCES.hcl.molarMassGPerMol, 3);
  });

  it("does not react when only one reagent is present", () => {
    let c = createEmptyContainer("c1", "beaker", 20);
    c = addSubstance(c, "hcl", 20);

    const { occurredReactions, container } = applyReactions(c);
    expect(occurredReactions).toHaveLength(0);
    expect(container.temperatureC).toBe(20);
  });
});

describe("reaction-engine — precipitation", () => {
  it("forms real AgCl precipitate from AgNO3 + NaCl (1:1)", () => {
    let c = createEmptyContainer("c1", "test_tube", 20);
    c = addSubstance(c, "water", 500);
    c = addSubstance(c, "nacl", SUBSTANCES.nacl.molarMassGPerMol);
    c = addSubstance(c, "agno3", SUBSTANCES.agno3.molarMassGPerMol);

    const { container, occurredReactions } = applyReactions(c);

    expect(occurredReactions.map((r) => r.id)).toContain("precipitation-agno3-nacl");
    expect(container.precipitate.find((x) => x.substanceId === "agcl")?.grams).toBeCloseTo(SUBSTANCES.agcl.molarMassGPerMol, 3);
    expect(container.contents.find((x) => x.substanceId === "nano3")?.grams).toBeCloseTo(SUBSTANCES.nano3.molarMassGPerMol, 3);
  });

  it("respects the 1:2 stoichiometry of CuSO4 + 2 NaOH", () => {
    let c = createEmptyContainer("c1", "test_tube", 20);
    c = addSubstance(c, "water", 1000); // достаточно воды, чтобы весь CuSO4 реально растворился (предел 200 г/л)
    c = addSubstance(c, "cuso4", SUBSTANCES.cuso4.molarMassGPerMol);
    c = addSubstance(c, "naoh", SUBSTANCES.naoh.molarMassGPerMol * 2);

    const { container } = applyReactions(c);

    expect(container.contents.find((x) => x.substanceId === "naoh")).toBeUndefined();
    expect(container.precipitate.find((x) => x.substanceId === "cu_oh_2")?.grams).toBeCloseTo(SUBSTANCES.cu_oh_2.molarMassGPerMol, 3);
  });

  it("only forms the precipitate the limiting reagent allows for 1:2 stoichiometry", () => {
    let c = createEmptyContainer("c1", "test_tube", 20);
    c = addSubstance(c, "water", 500);
    c = addSubstance(c, "cuso4", SUBSTANCES.cuso4.molarMassGPerMol); // 1 моль CuSO4
    c = addSubstance(c, "naoh", SUBSTANCES.naoh.molarMassGPerMol); // только 1 моль NaOH (нужно 2)

    const { container, occurredReactions } = applyReactions(c);

    expect(occurredReactions).toHaveLength(1);
    // extent ограничен NaOH: 1 моль / коэфф. 2 = 0.5 формульной порции
    expect(container.precipitate.find((x) => x.substanceId === "cu_oh_2")?.grams).toBeCloseTo(
      0.5 * SUBSTANCES.cu_oh_2.molarMassGPerMol,
      3
    );
  });
});
