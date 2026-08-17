export interface CabinetConfig {
  id: string;
  displayName: string;
  worldPosition: [number, number, number];
  size: [number, number, number];
  doorHitboxSize: [number, number, number];
  doorOpenAngleRad: number;
  shelfLocalY: number;
}

const CABINET_Z = -2.92;

export const CABINET_REGISTRY: Record<string, CabinetConfig> = {
  "cabinet-left-outer": {
    id: "cabinet-left-outer",
    displayName: "Кислоты / Acids",
    worldPosition: [-4.6, 1.8, CABINET_Z],
    size: [1.1, 0.7, 0.55],
    doorHitboxSize: [1.02, 0.62, 0.06],
    doorOpenAngleRad: -1.9,
    shelfLocalY: -0.18,
  },
  "cabinet-left-inner": {
    id: "cabinet-left-inner",
    displayName: "Основания и индикаторы",
    worldPosition: [-3.0, 1.8, CABINET_Z],
    size: [1.1, 0.7, 0.55],
    doorHitboxSize: [1.02, 0.62, 0.06],
    doorOpenAngleRad: -1.9,
    shelfLocalY: -0.18,
  },
  "cabinet-right-inner": {
    id: "cabinet-right-inner",
    displayName: "Соли и растворы",
    worldPosition: [3.0, 1.8, CABINET_Z],
    size: [1.1, 0.7, 0.55],
    doorHitboxSize: [1.02, 0.62, 0.06],
    doorOpenAngleRad: -1.9,
    shelfLocalY: -0.18,
  },
  "cabinet-right-outer": {
    id: "cabinet-right-outer",
    displayName: "Твёрдые вещества и оборудование",
    worldPosition: [4.6, 1.8, CABINET_Z],
    size: [1.1, 0.7, 0.55],
    doorHitboxSize: [1.02, 0.62, 0.06],
    doorOpenAngleRad: -1.9,
    shelfLocalY: -0.18,
  },
};

export const CABINET_IDS = Object.freeze(Object.keys(CABINET_REGISTRY));

const CABINET_NAMES = {
  "cabinet-left-outer": { ru: "Кислоты", en: "Acids", tg: "Кислотаҳо" },
  "cabinet-left-inner": { ru: "Основания и индикаторы", en: "Bases and indicators", tg: "Асосҳо ва индикаторҳо" },
  "cabinet-right-inner": { ru: "Соли и растворы", en: "Salts and solutions", tg: "Намакҳо ва маҳлулҳо" },
  "cabinet-right-outer": { ru: "Твёрдые вещества и оборудование", en: "Solids and equipment", tg: "Моддаҳои сахт ва таҷҳизот" },
} as const;

export function getCabinetDisplayName(id: string, locale: "ru" | "en" | "tg"): string {
  return CABINET_NAMES[id as keyof typeof CABINET_NAMES]?.[locale] ?? CABINET_REGISTRY[id]?.displayName ?? id;
}

export function getCabinet(id: string): CabinetConfig | null {
  return CABINET_REGISTRY[id] ?? null;
}

export function findCabinetContainingPosition(
  position: [number, number],
  elevation: number,
  tolerance = 0.4
): string | null {
  for (const cabinet of Object.values(CABINET_REGISTRY)) {
    const [x, y, z] = cabinet.worldPosition;
    const dx = position[0] - x;
    const dz = position[1] - z;
    const dy = elevation - y;
    if (Math.abs(dx) <= cabinet.size[0] / 2 + tolerance &&
        Math.abs(dz) <= cabinet.size[2] / 2 + tolerance &&
        Math.abs(dy) <= cabinet.size[1] / 2 + tolerance) {
      return cabinet.id;
    }
  }
  return null;
}
