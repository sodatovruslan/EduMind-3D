import { describe, expect, it } from "vitest";
import {
  INTERACTABLE_REGISTRY,
  PORTABLE_CHEMISTRY_IDS,
  SAFE_BURNER_PICKUP_TEMPERATURE_C,
  getInteractable,
} from "./interactables";

export const EXPECTED_PORTABLE_CHEMISTRY_IDS = [
  "beaker-1",
  "flask-1",
  "test-tube-1",
  "stock-water",
  "stock-nacl",
  "stock-hcl",
  "stock-naoh",
  "stock-cuso4",
  "stock-agno3",
  "pipette-1",
  "thermometer-1",
  "glass-rod-1",
  "burner-1",
  "stand-1",
  "scale-1",
] as const;

const STATIONARY_IDS = [
  "workbench",
  "floor",
  "back-wall",
  "left-wall",
  "right-wall",
  "sink-counter",
  "cabinet-left-outer",
  "cabinet-left-inner",
  "cabinet-right-inner",
  "cabinet-right-outer",
  "ceiling-light-1",
] as const;

describe("INTERACTABLE_REGISTRY — Stage S-2.5 coverage", () => {
  it("содержит ровно все 15 подтверждённых переносимых ID", () => {
    expect([...PORTABLE_CHEMISTRY_IDS].sort()).toEqual([...EXPECTED_PORTABLE_CHEMISTRY_IDS].sort());
    expect(Object.keys(INTERACTABLE_REGISTRY)).toHaveLength(15);
  });

  it.each(EXPECTED_PORTABLE_CHEMISTRY_IDS)("%s имеет полный hold/placement capability", (id) => {
    const capability = getInteractable(id);
    expect(capability).not.toBeNull();
    expect(capability?.canBeHeld).toBe(true);
    expect(capability?.canBePlaced).toBe(true);
    expect(capability?.allowedSurfaces).toContain("table");
    expect(capability?.interactionRadius).toBeGreaterThan(0);
    expect(capability?.interactionHeight).toBeGreaterThan(0);
    expect(capability?.placementFootprint.radius).toBeGreaterThan(0);
    expect(["move", "pour"]).toContain(capability?.legacyDragMode);
  });

  it.each(STATIONARY_IDS)("стационарный объект %s отсутствует в registry", (id) => {
    expect(getInteractable(id)).toBeNull();
  });
});

describe("state-dependent pickup policies", () => {
  const burner = INTERACTABLE_REGISTRY["burner-1"];

  it("разрешает взять выключенную холодную горелку", () => {
    const state = { isOn: false, hasActiveFlame: false, temperatureC: 20 };
    expect(burner.canPickUpNow(state)).toBe(true);
    expect(burner.blockedReason(state)).toBeNull();
  });

  it("блокирует включённую горелку и объясняет причину", () => {
    const state = { isOn: true, hasActiveFlame: true, temperatureC: 20 };
    expect(burner.canPickUpNow(state)).toBe(false);
    expect(burner.blockedReason(state)).toBe("Сначала выключите горелку");
  });

  it("блокирует выключенную, но горячую горелку", () => {
    const state = {
      isOn: false,
      hasActiveFlame: false,
      temperatureC: SAFE_BURNER_PICKUP_TEMPERATURE_C,
    };
    expect(burner.canPickUpNow(state)).toBe(false);
    expect(burner.blockedReason(state)).toBe("Дождитесь, пока горелка остынет");
  });

  it.each(["stock-water", "stock-nacl", "stock-hcl", "stock-naoh", "stock-cuso4", "stock-agno3"])(
    "%s разрешает pickup независимо от состояния крышки в Stage S-4",
    (id) => {
      const bottle = INTERACTABLE_REGISTRY[id];
      expect(bottle.canPickUpNow({})).toBe(true);
      expect(bottle.canPickUpNow({ capState: "closed" })).toBe(true);
      expect(bottle.canPickUpNow({ capState: "open" })).toBe(true);
      expect(bottle.blockedReason({})).toBeNull();
    }
  );

  it.each(["stock-water", "stock-nacl", "stock-hcl", "stock-naoh", "stock-cuso4", "stock-agno3"])(
    "%s сохраняет общий legacy drag-to-pour",
    (id) => {
      expect(INTERACTABLE_REGISTRY[id].legacyDragMode).toBe("pour");
    }
  );
});
