import { describe, expect, it } from "vitest";
import {
  SUBSTANCES,
  addSubstance,
  aggregateStateOf,
  computeColorHex,
  createEmptyContainer,
  heat,
  pour,
  totalMassG,
  totalVolumeMl,
} from "./chemistry-engine";

describe("chemistry-engine — addSubstance / solubility", () => {
  it("fully dissolves salt below the solubility limit", () => {
    let c = createEmptyContainer("c1", "beaker");
    c = addSubstance(c, "water", 500); // 500 г воды ~ 0.5 л
    c = addSubstance(c, "nacl", 50); // 360 г/л * 0.5 л = 180 г предел — 50 г полностью растворится

    expect(c.contents.find((x) => x.substanceId === "nacl")?.grams).toBeCloseTo(50, 5);
    expect(c.precipitate).toHaveLength(0);
  });

  it("precipitates the excess once the solubility limit is exceeded", () => {
    let c = createEmptyContainer("c1", "beaker");
    c = addSubstance(c, "water", 500); // предел растворения NaCl = 180 г
    c = addSubstance(c, "nacl", 250);

    const dissolved = c.contents.find((x) => x.substanceId === "nacl")?.grams ?? 0;
    const precipitated = c.precipitate.find((x) => x.substanceId === "nacl")?.grams ?? 0;
    expect(dissolved).toBeCloseTo(180, 5);
    expect(precipitated).toBeCloseTo(70, 5);
    expect(dissolved + precipitated).toBeCloseTo(250, 5); // масса сохраняется
  });

  it("keeps adding to the precipitate once already saturated", () => {
    let c = createEmptyContainer("c1", "beaker");
    c = addSubstance(c, "water", 500);
    c = addSubstance(c, "nacl", 180); // ровно предел
    c = addSubstance(c, "nacl", 20); // все 20 г уходят в осадок

    expect(c.contents.find((x) => x.substanceId === "nacl")?.grams).toBeCloseTo(180, 5);
    expect(c.precipitate.find((x) => x.substanceId === "nacl")?.grams).toBeCloseTo(20, 5);
  });

  it("re-dissolves an existing salt precipitate when water is added later", () => {
    let c = createEmptyContainer("c1", "beaker");
    c = addSubstance(c, "nacl", 20);
    expect(c.precipitate.find((x) => x.substanceId === "nacl")?.grams).toBeCloseTo(20, 5);

    c = addSubstance(c, "water", 100); // предел NaCl = 36 г
    expect(c.contents.find((x) => x.substanceId === "nacl")?.grams).toBeCloseTo(20, 5);
    expect(c.precipitate.find((x) => x.substanceId === "nacl")).toBeUndefined();
    expect(totalMassG(c)).toBeCloseTo(120, 5);
  });
});

describe("chemistry-engine — computeColorHex", () => {
  it("returns a neutral color for an empty container", () => {
    const c = createEmptyContainer("c1", "test_tube");
    expect(computeColorHex(c)).toBe("#e2e8f0");
  });

  it("returns the pure substance color when only one (already-liquid) substance is present", () => {
    // HCl в этой модели — уже готовый водный раствор (isAcid, без
    // solubilityGPerLiterWater), поэтому попадает в contents сразу, без воды
    let c = createEmptyContainer("c1", "test_tube");
    c = addSubstance(c, "hcl", 10);
    expect(computeColorHex(c).toLowerCase()).toBe(SUBSTANCES.hcl.colorHex.toLowerCase());
  });

  it("does not color a soluble solid added without any solvent (nothing to dissolve into)", () => {
    let c = createEmptyContainer("c1", "test_tube");
    c = addSubstance(c, "cuso4", 10); // без воды — весь остается нерастворенным осадком
    expect(c.precipitate.find((x) => x.substanceId === "cuso4")?.grams).toBeCloseTo(10, 5);
    expect(c.contents).toHaveLength(0);
    expect(computeColorHex(c)).toBe("#e2e8f0");
  });
});

describe("chemistry-engine — aggregateStateOf", () => {
  it("is liquid at room temperature", () => {
    let c = createEmptyContainer("c1", "beaker", 20);
    c = addSubstance(c, "water", 200);
    expect(aggregateStateOf(c)).toBe("liquid");
  });

  it("becomes gas once heated to the boiling point of water", () => {
    let c = createEmptyContainer("c1", "beaker", 20);
    c = addSubstance(c, "water", 200);
    c = heat(c, 85); // 20 -> 105, выше точки кипения воды (100)
    expect(c.temperatureC).toBeCloseTo(105, 5);
    expect(aggregateStateOf(c)).toBe("gas");
  });
});

describe("chemistry-engine — pour", () => {
  it("conserves total mass when pouring the full contents", () => {
    let source = createEmptyContainer("src", "test_tube");
    source = addSubstance(source, "water", 100);
    source = addSubstance(source, "nacl", 20);
    const target = createEmptyContainer("tgt", "beaker");

    const massBefore = totalMassG(source) + totalMassG(target);
    const { source: newSource, target: newTarget } = pour(source, target, 1);
    const massAfter = totalMassG(newSource) + totalMassG(newTarget);

    expect(massAfter).toBeCloseTo(massBefore, 5);
    expect(totalMassG(newSource)).toBeCloseTo(0, 5);
    expect(totalMassG(newTarget)).toBeCloseTo(massBefore, 5);
  });

  it("moves only the requested fraction and leaves the rest in the source", () => {
    let source = createEmptyContainer("src", "test_tube");
    source = addSubstance(source, "water", 100);
    const target = createEmptyContainer("tgt", "beaker");

    const { source: newSource, target: newTarget } = pour(source, target, 0.5);

    expect(totalMassG(newSource)).toBeCloseTo(50, 5);
    expect(totalMassG(newTarget)).toBeCloseTo(50, 5);
  });

  it("mixes temperature as a mass-weighted average", () => {
    let hot = createEmptyContainer("hot", "test_tube", 80);
    hot = addSubstance(hot, "water", 100);
    let cold = createEmptyContainer("cold", "beaker", 20);
    cold = addSubstance(cold, "water", 100);

    const { target } = pour(hot, cold, 1);
    // равные массы при 80°C и 20°C -> среднее 50°C
    expect(target.temperatureC).toBeCloseTo(50, 5);
  });

  it("rebalances target solubility when water is poured onto an existing salt precipitate", () => {
    let source = createEmptyContainer("src", "test_tube");
    source = addSubstance(source, "water", 100);
    let target = createEmptyContainer("tgt", "beaker");
    target = addSubstance(target, "nacl", 40);

    const massBefore = totalMassG(source) + totalMassG(target);
    const result = pour(source, target, 1);
    const dissolved = result.target.contents.find((x) => x.substanceId === "nacl")?.grams ?? 0;
    const precipitated = result.target.precipitate.find((x) => x.substanceId === "nacl")?.grams ?? 0;

    expect(dissolved).toBeCloseTo(36, 5);
    expect(precipitated).toBeCloseTo(4, 5);
    expect(totalMassG(result.source) + totalMassG(result.target)).toBeCloseTo(massBefore, 5);
  });
});

describe("chemistry-engine — totalVolumeMl", () => {
  it("derives volume from mass and density", () => {
    let c = createEmptyContainer("c1", "beaker");
    c = addSubstance(c, "water", 200); // плотность 1.0 -> 200 мл
    expect(totalVolumeMl(c)).toBeCloseTo(200, 5);
  });
});
