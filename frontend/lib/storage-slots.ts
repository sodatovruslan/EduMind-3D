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

const CABINET_SLOT_KINDS: Record<string, readonly string[]> = {
  "cabinet-left-outer": ["stock_acids", "stock_safe_liquid"],
  "cabinet-left-inner": ["stock_bases_indicators", "flask"],
  "cabinet-right-inner": ["stock_salts_solutions", "pipette", "thermometer", "glass_rod"],
  "cabinet-right-outer": ["stock_solids_equipment", "burner", "scale"],
};

function createAdditionalCabinetSlots(): Record<string, StorageSlot> {
  const result: Record<string, StorageSlot> = {};
  for (const cabinetId of Object.keys(CABINET_SLOT_KINDS)) {
    const cabinet = getCabinet(cabinetId);
    if (!cabinet) continue;
    for (let index = 2; index <= 9; index += 1) {
      const zeroBased = index - 1;
      const column = zeroBased % 3;
      const row = Math.floor(zeroBased / 3);
      const id = `${cabinetId}-slot-${index}`;
      result[id] = {
        id,
        cabinetId,
        shelfId: `${cabinetId}-shelf-${row + 1}`,
        position: [cabinet.worldPosition[0] + (column - 1) * 0.34, cabinet.worldPosition[2] + 0.0275],
        elevation: 1.58 + row * 0.22,
        rotationY: 0,
        radius: 0.18,
        // Added shelf positions are inventory-only. The original slot 1
        // remains the backwards-compatible equipment return location.
        allowedKinds: CABINET_SLOT_KINDS[cabinetId].filter((kind) => kind.startsWith("stock_")),
      };
    }
  }
  return result;
}

export const STORAGE_SLOT_REGISTRY: Record<string, StorageSlot> = {
  ...createAdditionalCabinetSlots(),
  "cabinet-left-outer-slot-1": {
    id: "cabinet-left-outer-slot-1",
    cabinetId: "cabinet-left-outer",
    shelfId: "cabinet-left-outer-shelf-1",
    position: [-4.6, -2.8925],
    elevation: 1.8,
    rotationY: 0,
    radius: 0.18,
    allowedKinds: CABINET_SLOT_KINDS["cabinet-left-outer"],
  },
  "cabinet-left-inner-slot-1": {
    id: "cabinet-left-inner-slot-1",
    cabinetId: "cabinet-left-inner",
    shelfId: "cabinet-left-inner-shelf-1",
    position: [-3.0, -2.8925],
    elevation: 1.85,
    rotationY: 0,
    radius: 0.34,
    allowedKinds: CABINET_SLOT_KINDS["cabinet-left-inner"],
  },
  "cabinet-right-inner-slot-1": {
    id: "cabinet-right-inner-slot-1",
    cabinetId: "cabinet-right-inner",
    shelfId: "cabinet-right-inner-shelf-1",
    position: [3.0, -2.8925],
    elevation: 1.72,
    rotationY: 0,
    radius: 0.16,
    allowedKinds: CABINET_SLOT_KINDS["cabinet-right-inner"],
  },
  "cabinet-right-outer-slot-1": {
    id: "cabinet-right-outer-slot-1",
    cabinetId: "cabinet-right-outer",
    shelfId: "cabinet-right-outer-shelf-1",
    position: [4.6, -2.8925],
    elevation: 1.66,
    rotationY: 0,
    radius: 0.35,
    allowedKinds: CABINET_SLOT_KINDS["cabinet-right-outer"],
  },
};

export function getSlot(id: string): StorageSlot | null {
  return STORAGE_SLOT_REGISTRY[id] ?? null;
}

export function findSlotsForCabinet(cabinetId: string): StorageSlot[] {
  if (!getCabinet(cabinetId)) return [];
  return Object.values(STORAGE_SLOT_REGISTRY)
    .filter((slot) => slot.cabinetId === cabinetId)
    .sort((a, b) => Number(a.id.match(/slot-(\d+)$/)?.[1] ?? 0) - Number(b.id.match(/slot-(\d+)$/)?.[1] ?? 0));
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

export interface StorageConstraintItemState {
  id?: string;
  capState?: "closed" | "open";
  isOn?: boolean;
  hasActiveFlame?: boolean;
  temperatureC?: number;
}

export function canStoreItemNow(itemState: StorageConstraintItemState): boolean {
  if (itemState.capState === "open") return false;
  if (itemState.isOn === true || itemState.hasActiveFlame === true) return false;
  return true;
}

export function getBlockedStorageReason(itemState: StorageConstraintItemState): string | null {
  if (itemState.capState === "open") return "Закройте крышку перед хранением";
  if (itemState.isOn === true || itemState.hasActiveFlame === true) return "Сначала выключите горелку";
  return null;
}
