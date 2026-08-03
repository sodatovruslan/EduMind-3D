import { describe, expect, it } from "vitest";
import { canStoreItemNow, getBlockedStorageReason } from "./storage-slots";
import { INTERACTABLE_REGISTRY } from "./interactables";

describe("Stage S-4 — Real Bottle Caps Unit & Domain Contract", () => {
  it("all 6 stock bottles use the common capability contract", () => {
    const bottles = ["stock-water", "stock-nacl", "stock-hcl", "stock-naoh", "stock-cuso4", "stock-agno3"];
    bottles.forEach((id) => {
      const cap = INTERACTABLE_REGISTRY[id];
      expect(cap).toBeDefined();
      expect(cap.storageKind).toMatch(/^stock_/);
      expect(cap.canBeHeld).toBe(true);
      expect(cap.canBePlaced).toBe(true);
      expect(cap.canPickUpNow({})).toBe(true);
      expect(cap.blockedReason({})).toBeNull();
    });
  });

  it("canStoreItemNow blocks storage for open bottles and active burners", () => {
    expect(canStoreItemNow({ capState: "open" })).toBe(false);
    expect(canStoreItemNow({ capState: "closed" })).toBe(true);
    expect(canStoreItemNow({ isOn: true })).toBe(false);
    expect(canStoreItemNow({ hasActiveFlame: true })).toBe(false);
    expect(canStoreItemNow({ isOn: false })).toBe(true);
  });

  it("getBlockedStorageReason returns correct warning strings for storage constraints", () => {
    expect(getBlockedStorageReason({ capState: "open" })).toBe("Закройте крышку перед хранением");
    expect(getBlockedStorageReason({ isOn: true })).toBe("Сначала выключите горелку");
    expect(getBlockedStorageReason({ capState: "closed" })).toBeNull();
  });
});
