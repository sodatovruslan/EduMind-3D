/**
 * Interaction Core — Stage S-2: чистая геометрия размещения на поверхности.
 * Сейчас единственная поверхность — стол; полки/шкафы Stage S-3 переиспользуют
 * те же функции с другими bounds, не переписывая эту логику. Без React/Three
 * зависимостей — тестируется напрямую, без рендера.
 */

export interface PlacementSurfaceBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// реальные границы столешницы: Workbench — boxGeometry [9, 0.1, 4.2] на
// position [0, -0.05, 0] -> X in [-4.5,4.5], Z in [-2.1,2.1], верх на y≈0.
// Запас от физического края не нужен отдельной константой — его дает радиус
// самого предмета в isPointOnSurface (край предмета не должен свисать).
export const TABLE_SURFACE: PlacementSurfaceBounds = {
  minX: -4.5,
  maxX: 4.5,
  minZ: -2.1,
  maxZ: 2.1,
};

export interface PlacementOccupant {
  position: [number, number];
  radius: number;
}

// небольшой зазор поверх суммы радиусов — чисто визуальный запас, чтобы
// соседние предметы не казались слипшимися вплотную друг с другом
const CLEARANCE_MARGIN = 0.06;

/**
 * true, если предмет радиусом `radius` с центром в `point` целиком помещается
 * в границы поверхности — учитывает физический размер предмета, а не только
 * его центральную точку (иначе половина сосуда могла бы свисать за край).
 */
export function isPointOnSurface(
  point: [number, number],
  bounds: PlacementSurfaceBounds,
  radius: number
): boolean {
  const [x, z] = point;
  return x - radius >= bounds.minX && x + radius <= bounds.maxX && z - radius >= bounds.minZ && z + radius <= bounds.maxZ;
}

/**
 * true, если предмет радиусом `radius` с центром в `point` не пересекается ни
 * с одним из `occupants` — каждый занятый предмет учитывается своим
 * собственным радиусом, не общей константой.
 */
export function isPointClearOfOccupants(point: [number, number], radius: number, occupants: PlacementOccupant[]): boolean {
  return occupants.every((occupant) => {
    const dx = point[0] - occupant.position[0];
    const dz = point[1] - occupant.position[1];
    const dist = Math.sqrt(dx * dx + dz * dz);
    return dist >= radius + occupant.radius + CLEARANCE_MARGIN;
  });
}

export function isPlacementValid(
  point: [number, number],
  radius: number,
  bounds: PlacementSurfaceBounds,
  occupants: PlacementOccupant[]
): boolean {
  return isPointOnSurface(point, bounds, radius) && isPointClearOfOccupants(point, radius, occupants);
}

// радиус физического "следа" предмета на столе — те же числа, что уже
// используются для Hitbox соответствующей геометрии в ChemistryWorldScene.tsx
// (см. ContainerMesh/StockBottleMesh/*Mesh). Держим отдельно от Hitbox
// намеренно: Hitbox — про клик/наведение, это — про физическое место на
// поверхности; числа сейчас совпадают, но это два разных по смыслу понятия.
export const FOOTPRINT_RADIUS_BY_KIND: Record<string, number> = {
  beaker: 0.32,
  flask: 0.32,
  test_tube: 0.32,
  burner: 0.3,
  stand: 0.28,
  pipette: 0.12,
  thermometer: 0.1,
  glass_rod: 0.1,
  scale: 0.35,
};

export const STOCK_BOTTLE_FOOTPRINT_RADIUS = 0.17;

const DEFAULT_FOOTPRINT_RADIUS = 0.3;

export function getFootprintRadius(kind: string): number {
  return FOOTPRINT_RADIUS_BY_KIND[kind] ?? DEFAULT_FOOTPRINT_RADIUS;
}
