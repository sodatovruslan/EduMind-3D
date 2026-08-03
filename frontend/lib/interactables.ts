/**
 * Универсальный capability registry Interaction Core.
 *
 * Реестр описывает возможности конкретного экземпляра, а runtime-state
 * приходит извне через домен модуля. Поэтому чистый lib-слой не импортирует
 * React или ChemistryWorkspaceProvider и остаётся пригодным для других сцен.
 */

export type PlacementSurfaceKind = "table";
export type LegacyDragMode = "none" | "move" | "pour";

export interface InteractableRuntimeState {
  rotationY?: number;
  position?: [number, number];
  elevation?: number;
  storageSlotId?: string | null;
  isOn?: boolean;
  temperatureC?: number;
  hasActiveFlame?: boolean;
  isCapOpen?: boolean;
  capState?: "closed" | "open";
}

export interface PlacementFootprint {
  shape: "circle";
  radius: number;
}

export interface InteractableConfig {
  displayName: string;
  storageKind: string;
  canBeHeld: boolean;
  canBePlaced: boolean;
  allowedSurfaces: readonly PlacementSurfaceKind[];
  handOffset: [number, number, number];
  handRotation: [number, number, number];
  interactionRadius: number;
  interactionHeight: number;
  placementFootprint: PlacementFootprint;
  tableElevation: number;
  canPickUpNow: (state: InteractableRuntimeState) => boolean;
  blockedReason: (state: InteractableRuntimeState) => string | null;
  legacyDragMode: LegacyDragMode;
}

export const SAFE_BURNER_PICKUP_TEMPERATURE_C = 45;

const canAlwaysPickUp = () => true;
const neverBlocked = () => null;

const canPickUpCappedBottle = (state: InteractableRuntimeState) => state.isCapOpen !== true;
const cappedBottleBlockedReason = (state: InteractableRuntimeState) =>
  state.isCapOpen === true ? "Сначала закройте крышку" : null;

const canPickUpBurner = (state: InteractableRuntimeState) =>
  state.isOn !== true &&
  state.hasActiveFlame !== true &&
  (state.temperatureC ?? 20) < SAFE_BURNER_PICKUP_TEMPERATURE_C;

const burnerBlockedReason = (state: InteractableRuntimeState) => {
  if (state.isOn === true || state.hasActiveFlame === true) return "Сначала выключите горелку";
  if ((state.temperatureC ?? 20) >= SAFE_BURNER_PICKUP_TEMPERATURE_C) {
    return "Дождитесь, пока горелка остынет";
  }
  return null;
};

const TABLE_ONLY = ["table"] as const;

function portableConfig(
  config: Omit<
    InteractableConfig,
    "canBeHeld" | "canBePlaced" | "allowedSurfaces" | "canPickUpNow" | "blockedReason"
  > &
    Partial<
      Pick<InteractableConfig, "canPickUpNow" | "blockedReason">
    >
): InteractableConfig {
  return {
    ...config,
    canBeHeld: true,
    canBePlaced: true,
    allowedSurfaces: TABLE_ONLY,
    canPickUpNow: config.canPickUpNow ?? canAlwaysPickUp,
    blockedReason: config.blockedReason ?? neverBlocked,
  };
}

const CONTAINER_HAND: Pick<InteractableConfig, "handOffset" | "handRotation"> = {
  handOffset: [0.32, -0.24, -0.6],
  handRotation: [0, 0, 0],
};

const BOTTLE_HAND: Pick<InteractableConfig, "handOffset" | "handRotation"> = {
  handOffset: [0.3, -0.27, -0.55],
  handRotation: [0, 0, 0],
};

const LONG_TOOL_HAND: Pick<InteractableConfig, "handOffset" | "handRotation"> = {
  handOffset: [0.3, -0.23, -0.55],
  // S-2.5 не вводит полную 3D-ориентацию: исходная модель и доменный
  // rotationY остаются без изменений.
  handRotation: [0, 0, 0],
};

function container(displayName: string, storageKind: string, radius = 0.32): InteractableConfig {
  return portableConfig({
    displayName,
    storageKind,
    ...CONTAINER_HAND,
    interactionRadius: radius,
    interactionHeight: 0.7,
    placementFootprint: { shape: "circle", radius: 0.32 },
    tableElevation: 0.05,
    legacyDragMode: "pour",
  });
}

function stockBottle(displayName: string, storageKind: string): InteractableConfig {
  return portableConfig({
    displayName,
    storageKind,
    ...BOTTLE_HAND,
    interactionRadius: 0.25,
    interactionHeight: 0.5,
    placementFootprint: { shape: "circle", radius: 0.17 },
    tableElevation: 0.16,
    legacyDragMode: "pour",
  });
}

export const INTERACTABLE_REGISTRY: Record<string, InteractableConfig> = {
  "beaker-1": container("Стакан", "beaker", 0.34),
  "flask-1": container("Колба", "flask", 0.34),
  "test-tube-1": container("Пробирка", "test_tube", 0.24),

  "stock-water": stockBottle("Бутылка: Вода", "stock_safe_liquid"),
  "stock-nacl": stockBottle("Бутылка: Поваренная соль", "stock_safe_solid"),
  "stock-hcl": stockBottle("Бутылка: Соляная кислота", "stock_hazardous_reagent"),
  "stock-naoh": stockBottle("Бутылка: Гидроксид натрия", "stock_hazardous_reagent"),
  "stock-cuso4": stockBottle("Бутылка: Сульфат меди", "stock_hazardous_reagent"),
  "stock-agno3": stockBottle("Бутылка: Нитрат серебра", "stock_hazardous_reagent"),

  "pipette-1": portableConfig({
    displayName: "Пипетка",
    storageKind: "pipette",
    ...LONG_TOOL_HAND,
    interactionRadius: 0.16,
    interactionHeight: 0.6,
    placementFootprint: { shape: "circle", radius: 0.12 },
    tableElevation: 0.05,
    legacyDragMode: "move",
  }),
  "thermometer-1": portableConfig({
    displayName: "Термометр",
    storageKind: "thermometer",
    ...LONG_TOOL_HAND,
    interactionRadius: 0.14,
    interactionHeight: 0.55,
    placementFootprint: { shape: "circle", radius: 0.1 },
    tableElevation: 0.05,
    legacyDragMode: "move",
  }),
  "glass-rod-1": portableConfig({
    displayName: "Стеклянная палочка",
    storageKind: "glass_rod",
    ...LONG_TOOL_HAND,
    interactionRadius: 0.14,
    interactionHeight: 0.62,
    placementFootprint: { shape: "circle", radius: 0.1 },
    tableElevation: 0.05,
    legacyDragMode: "move",
  }),
  "burner-1": portableConfig({
    displayName: "Горелка",
    storageKind: "burner",
    handOffset: [0.34, -0.3, -0.65],
    handRotation: [0, 0, 0],
    interactionRadius: 0.3,
    interactionHeight: 0.5,
    placementFootprint: { shape: "circle", radius: 0.3 },
    tableElevation: 0,
    canPickUpNow: canPickUpBurner,
    blockedReason: burnerBlockedReason,
    legacyDragMode: "move",
  }),
  "stand-1": portableConfig({
    displayName: "Штатив",
    storageKind: "stand",
    handOffset: [0.38, -0.38, -0.75],
    handRotation: [0, 0, 0],
    interactionRadius: 0.3,
    interactionHeight: 1.1,
    placementFootprint: { shape: "circle", radius: 0.28 },
    tableElevation: 0,
    legacyDragMode: "move",
  }),
  "scale-1": portableConfig({
    displayName: "Весы",
    storageKind: "scale",
    handOffset: [0.35, -0.3, -0.65],
    handRotation: [0, 0, 0],
    interactionRadius: 0.35,
    interactionHeight: 0.3,
    placementFootprint: { shape: "circle", radius: 0.35 },
    tableElevation: 0,
    legacyDragMode: "move",
  }),
};

export const PORTABLE_CHEMISTRY_IDS = Object.freeze(Object.keys(INTERACTABLE_REGISTRY));

export function getInteractable(id: string): InteractableConfig | null {
  return INTERACTABLE_REGISTRY[id] ?? null;
}
