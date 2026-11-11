import { describe, expect, it } from "vitest";
import { addSubstance, createEmptyContainer } from "./chemistry-engine";
import { applyReactions } from "./reaction-engine";
import { isOnBench, nextBenchHint } from "./chemistry-bench-focus";

const empty = () => createEmptyContainer("c1", "beaker");
const off = { burnerOn: false, isOnBurner: false };

describe("isOnBench", () => {
  it("keeps the task equipment and hides the rest of the table", () => {
    expect(isOnBench({ id: "beaker-1", storageSlotId: null })).toBe(true);
    expect(isOnBench({ id: "stock-agno3", storageSlotId: null })).toBe(true);
    expect(isOnBench({ id: "stock-hcl", storageSlotId: null })).toBe(false);
    expect(isOnBench({ id: "test-tube-3", storageSlotId: null })).toBe(false);
    expect(isOnBench({ id: "scale-1" })).toBe(false);
  });

  it("never hides what is stored in a cabinet", () => {
    expect(isOnBench({ id: "stock-h2so4", storageSlotId: "cabinet-left-outer-slot-2" })).toBe(true);
  });
});

describe("nextBenchHint", () => {
  it("dissolving salt: water first, then salt, then nothing", () => {
    const experimentId = "experiment-1-dissolve-salt";
    let c = empty();
    expect(nextBenchHint({ experimentId, container: c, ...off })).toBe("stock-water");
    c = addSubstance(c, "water", 100);
    expect(nextBenchHint({ experimentId, container: c, ...off })).toBe("stock-nacl");
    c = addSubstance(c, "nacl", 10);
    expect(nextBenchHint({ experimentId, container: c, ...off })).toBeNull();
  });

  it("precipitation: asks for silver nitrate once the salt solution is there, and stops after the reaction", () => {
    const experimentId = "experiment-3-precipitation";
    let c = addSubstance(addSubstance(empty(), "water", 100), "nacl", 10);
    expect(nextBenchHint({ experimentId, container: c, ...off })).toBe("stock-agno3");
    c = applyReactions(addSubstance(c, "agno3", 10)).container;
    expect(nextBenchHint({ experimentId, container: c, ...off })).toBeNull();
  });

  it("boiling: water, then the burner until the vessel stands on it with the flame on", () => {
    const experimentId = "experiment-4-heat-water";
    let c = empty();
    expect(nextBenchHint({ experimentId, container: c, ...off })).toBe("stock-water");
    c = addSubstance(c, "water", 100);
    expect(nextBenchHint({ experimentId, container: c, ...off })).toBe("burner-1");
    expect(nextBenchHint({ experimentId, container: c, burnerOn: false, isOnBurner: true })).toBe("burner-1");
    expect(nextBenchHint({ experimentId, container: c, burnerOn: true, isOnBurner: true })).toBeNull();
  });

  it("has no hint for tasks it does not know", () => {
    expect(nextBenchHint({ experimentId: "experiment-2-neutralization", container: empty(), ...off })).toBeNull();
  });
});
