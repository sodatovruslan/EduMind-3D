import { getCabinet } from "./cabinets";
import type { InteractableConfig } from "./interactables";

export interface StorageSlot {
  id: string;
  cabinetId: string;
  shelfId?: string;
  position: [number, number];
  elevation: number;
  rotationY: number;
  radius: number;
  allowedKinds: readonly string[];
}

export const STORAGE_SLOT_REGISTRY: Record<string, StorageSlot> = {
  "cabinet-left-outer-slot-1": {
    id: "cabinet-left-outer-slot-1",
    cabinetId: "cabinet-left-outer",
    shelfId: "cabinet-left-outer-shelf-1",
    position: [-4.6, -2.8925],
    elevation: 1.8,
    rotationY: 0,
    radius: 0.18,
    allowedKinds: ["stock_safe_liquid", "stock_safe_solid"],
  },
  "cabinet-left-inner-slot-1": {
    id: "cabinet-left-inner-slot-1",
    cabinetId: "cabinet-left-inner",
    shelfId: "cabinet-left-inner-shelf-1",
    position: [-3.0, -2.8925],
    elevation: 1.85,
    rotationY: 0,
    radius: 0.34,
    allowedKinds: ["flask"],
  },
  "cabinet-right-inner-slot-1": {
    id: "cabinet-right-inner-slot-1",
    cabinetId: "cabinet-right-inner",
    shelfId: "cabinet-right-inner-shelf-1",
    position: [3.0, -2.8925],
    elevation: 1.72,
    rotationY: 0,
    radius: 0.16,
    allowedKinds: ["pipette", "thermometer", "glass_rod"],
  },
  "cabinet-right-outer-slot-1": {
    id: "cabinet-right-outer-slot-1",
    cabinetId: "cabinet-right-outer",
    shelfId: "cabinet-right-outer-shelf-1",
    position: [4.6, -2.8925],
    elevation: 1.66,
    rotationY: 0,
    radius: 0.35,
    allowedKinds: ["burner", "scale"],
  },
};

export function getSlot(id: string): StorageSlot | null {
  return STORAGE_SLOT_REGISTRY[id] ?? null;
}

export function findSlotsForCabinet(cabinetId: string): StorageSlot[] {
  if (!getCabinet(cabinetId)) return [];
  return Object.values(STORAGE_SLOT_REGISTRY).filter((slot) => slot.cabinetId === cabinetId);
}

export function isKindAllowedInSlot(slot: StorageSlot, kind: string): boolean {
  return slot.allowedKinds.length === 0 || slot.allowedKinds.includes(kind);
}

export function isItemCompatibleWithSlot(slot: StorageSlot, capability: InteractableConfig): boolean {
  return (
    capability.canBeHeld &&
    capability.placementFootprint.radius <= slot.radius &&
    isKindAllowedInSlot(slot, capability.storageKind)
  );
}

export function findAvailableSlot(
  cabinetId: string,
  capability: InteractableConfig,
  occupiedSlotIds: ReadonlySet<string>
): StorageSlot | null {
  return (
    findSlotsForCabinet(cabinetId).find(
      (slot) => !occupiedSlotIds.has(slot.id) && isItemCompatibleWithSlot(slot, capability)
    ) ?? null
  );
}
