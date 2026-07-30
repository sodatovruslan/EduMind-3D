import { describe, expect, it } from "vitest";
import { addSubstance, createEmptyContainer, heat } from "./chemistry-engine";
import { checkSafety } from "./chemistry-safety";

describe("chemistry-safety — checkSafety", () => {
  it("warns about heating an empty container", () => {
    let c = createEmptyContainer("c1", "beaker");
    c = heat(c, 50);
    const warnings = checkSafety({ container: c });
    expect(warnings.some((w) => w.code === "empty_container_heated" && w.severity === "danger")).toBe(true);
  });

  it("does not warn about heating a container that actually has contents", () => {
    let c = createEmptyContainer("c1", "beaker");
    c = addSubstance(c, "water", 200);
    c = heat(c, 50);
    expect(checkSafety({ container: c }).some((w) => w.code === "empty_container_heated")).toBe(false);
  });

  it("flags overheating above the safe glassware threshold", () => {
    let c = createEmptyContainer("c1", "beaker");
    c = addSubstance(c, "water", 200);
    c = heat(c, 290); // 20 -> 310
    const warnings = checkSafety({ container: c });
    expect(warnings.some((w) => w.code === "overheating")).toBe(true);
  });

  it("warns about mixing acid and base with too little water dilution", () => {
    let c = createEmptyContainer("c1", "beaker");
    c = addSubstance(c, "hcl", 50);
    c = addSubstance(c, "naoh", 50);
    const warnings = checkSafety({ container: c });
    expect(warnings.some((w) => w.code === "low_dilution_acid_base")).toBe(true);
  });

  it("does not warn about dilution once enough water is present", () => {
    let c = createEmptyContainer("c1", "beaker");
    c = addSubstance(c, "water", 1000);
    c = addSubstance(c, "hcl", 10);
    c = addSubstance(c, "naoh", 10);
    const warnings = checkSafety({ container: c });
    expect(warnings.some((w) => w.code === "low_dilution_acid_base")).toBe(false);
  });

  it("flags adding acid before water as the unsafe sequence", () => {
    let c = createEmptyContainer("c1", "beaker");
    c = addSubstance(c, "hcl", 20);
    c = addSubstance(c, "water", 200);
    const warnings = checkSafety({ container: c, firstAddedOrder: ["hcl", "water"] });
    expect(warnings.some((w) => w.code === "wrong_sequence_acid_first" && w.severity === "danger")).toBe(true);
  });

  it("does not flag the safe sequence of water before acid", () => {
    let c = createEmptyContainer("c1", "beaker");
    c = addSubstance(c, "water", 200);
    c = addSubstance(c, "hcl", 20);
    const warnings = checkSafety({ container: c, firstAddedOrder: ["water", "hcl"] });
    expect(warnings.some((w) => w.code === "wrong_sequence_acid_first")).toBe(false);
  });

  it("returns no warnings for a calm, safe container", () => {
    let c = createEmptyContainer("c1", "beaker");
    c = addSubstance(c, "water", 500);
    c = addSubstance(c, "nacl", 20);
    expect(checkSafety({ container: c })).toHaveLength(0);
  });
});
