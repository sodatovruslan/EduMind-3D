import { describe, expect, it } from "vitest";
import { ELECTRICITY_INITIAL_COMPONENTS, mergeElectricityInventory } from "./electricity-inventory";

describe("expanded electricity inventory", () => {
  it("has stable unique component and terminal IDs", () => {
    expect(ELECTRICITY_INITIAL_COMPONENTS).toHaveLength(14);
    const ids = ELECTRICITY_INITIAL_COMPONENTS.map((component) => component.id);
    const terminals = ELECTRICITY_INITIAL_COMPONENTS.flatMap((component) => component.terminals);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(terminals).size).toBe(terminals.length);
  });

  it("provides six fixed educational resistor values", () => {
    const values = ELECTRICITY_INITIAL_COMPONENTS.filter((component) => component.id.startsWith("resistor_")).map((component) => component.resistanceOhm);
    expect(values).toEqual([10, 47, 100, 220, 470, 1000]);
  });

  it("hydrates an old seven-component save with new inventory exactly once", () => {
    const legacy = ELECTRICITY_INITIAL_COMPONENTS.slice(0, 7).map((component) => ({ ...component }));
    const once = mergeElectricityInventory(legacy);
    const twice = mergeElectricityInventory(once);
    expect(once).toHaveLength(14);
    expect(twice).toHaveLength(14);
    expect(new Set(twice.map((component) => component.id)).size).toBe(14);
  });
});
