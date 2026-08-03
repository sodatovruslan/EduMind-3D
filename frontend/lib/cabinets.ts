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
    displayName: "Левый шкаф",
    worldPosition: [-4.6, 1.8, CABINET_Z],
    size: [1.1, 0.7, 0.55],
    doorHitboxSize: [1.02, 0.62, 0.06],
    doorOpenAngleRad: -1.9,
    shelfLocalY: -0.18,
  },
  "cabinet-left-inner": {
    id: "cabinet-left-inner",
    displayName: "Шкаф для посуды",
    worldPosition: [-3.0, 1.8, CABINET_Z],
    size: [1.1, 0.7, 0.55],
    doorHitboxSize: [1.02, 0.62, 0.06],
    doorOpenAngleRad: -1.9,
    shelfLocalY: -0.18,
  },
  "cabinet-right-inner": {
    id: "cabinet-right-inner",
    displayName: "Правый шкаф",
    worldPosition: [3.0, 1.8, CABINET_Z],
    size: [1.1, 0.7, 0.55],
    doorHitboxSize: [1.02, 0.62, 0.06],
    doorOpenAngleRad: -1.9,
    shelfLocalY: -0.18,
  },
  "cabinet-right-outer": {
    id: "cabinet-right-outer",
    displayName: "Крайний правый шкаф",
    worldPosition: [4.6, 1.8, CABINET_Z],
    size: [1.1, 0.7, 0.55],
    doorHitboxSize: [1.02, 0.62, 0.06],
    doorOpenAngleRad: -1.9,
    shelfLocalY: -0.18,
  },
};

export const CABINET_IDS = Object.freeze(Object.keys(CABINET_REGISTRY));

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
