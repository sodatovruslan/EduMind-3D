import { describe, expect, it } from "vitest";
import {
  STORAGE_SLOT_REGISTRY,
  findAvailableSlot,
  findSlotsForCabinet,
  getSlot,
  isItemCompatibleWithSlot,
  isKindAllowedInSlot,
  type StorageSlot,
} from "./storage-slots";
import { getInteractable } from "./interactables";

const anyKindSlot: StorageSlot = {
  id: "open-shelf-slot",
  cabinetId: "cabinet-left-inner",
  position: [0, 0],
  elevation: 1,
  rotationY: 0,
  radius: 0.4,
  allowedKinds: [],
};

describe("Storage Slot Registry", () => {
  it("возвращает слот и все слоты владельца", () => {
    const slot = getSlot("cabinet-left-inner-slot-1");
    expect(slot).toBe(STORAGE_SLOT_REGISTRY["cabinet-left-inner-slot-1"]);
    expect(findSlotsForCabinet("cabinet-left-inner")).toEqual([slot]);
    expect(findSlotsForCabinet("missing")).toEqual([]);
  });

  it("пустой allowedKinds разрешает любой kind, непустой требует точного совпадения", () => {
    expect(isKindAllowedInSlot(anyKindSlot, "pipette")).toBe(true);
    const flaskSlot = getSlot("cabinet-left-inner-slot-1")!;
    expect(isKindAllowedInSlot(flaskSlot, "flask")).toBe(true);
    expect(isKindAllowedInSlot(flaskSlot, "beaker")).toBe(false);
  });

  it("проверяет одновременно kind и footprint", () => {
    const flaskSlot = getSlot("cabinet-left-inner-slot-1")!;
    expect(isItemCompatibleWithSlot(flaskSlot, getInteractable("flask-1")!)).toBe(true);
    expect(isItemCompatibleWithSlot(flaskSlot, getInteractable("beaker-1")!)).toBe(false);
    expect(isItemCompatibleWithSlot(flaskSlot, getInteractable("stand-1")!)).toBe(false);
  });

  it("не возвращает занятый или несовместимый слот", () => {
    const flask = getInteractable("flask-1")!;
    expect(findAvailableSlot("cabinet-left-inner", flask, new Set())?.id).toBe(
      "cabinet-left-inner-slot-1"
    );
    expect(findAvailableSlot("cabinet-left-inner", flask, new Set(["cabinet-left-inner-slot-1"]))).toBeNull();
    expect(findAvailableSlot("cabinet-left-inner", getInteractable("beaker-1")!, new Set())).toBeNull();
  });

  it("не смешивает тонкие инструменты, крупное оборудование и опасные реактивы", () => {
    const thinSlot = getSlot("cabinet-right-inner-slot-1")!;
    const equipmentSlot = getSlot("cabinet-right-outer-slot-1")!;
    const safeStockSlot = getSlot("cabinet-left-outer-slot-1")!;
    expect(isItemCompatibleWithSlot(thinSlot, getInteractable("pipette-1")!)).toBe(true);
    expect(isItemCompatibleWithSlot(thinSlot, getInteractable("burner-1")!)).toBe(false);
    expect(isItemCompatibleWithSlot(thinSlot, getInteractable("stand-1")!)).toBe(false);
    expect(isItemCompatibleWithSlot(equipmentSlot, getInteractable("burner-1")!)).toBe(true);
    expect(isItemCompatibleWithSlot(safeStockSlot, getInteractable("stock-water")!)).toBe(true);
    expect(isItemCompatibleWithSlot(safeStockSlot, getInteractable("stock-hcl")!)).toBe(false);
  });
});
