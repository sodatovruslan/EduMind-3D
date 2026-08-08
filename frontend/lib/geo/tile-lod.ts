import { ROOT_TILES, childrenOf, tileCenter, tileKey, type TileId } from "./tiling";

// Чистая числовая тройка вместо THREE.Vector3 — LOD-решение должно
// оставаться тестируемым без WebGL/three.js (см. GEOWORLD_ROADMAP.md,
// "Separate pure tiling/LOD logic from Three.js rendering").
export type Vec3 = readonly [number, number, number];

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function length(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}
function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
function normalize(a: Vec3): Vec3 {
  const l = length(a);
  return l > 0 ? scale(a, 1 / l) : [0, 1, 0];
}

// Та же формула, что lib/geo/coordinates.ts (latLngToVector3), но без
// зависимости от three.js — только направление (единичный вектор), не
// точка на сфере конкретного радиуса.
export function latLngToUnitVec3(latDeg: number, lngDeg: number): Vec3 {
  const latRad = (latDeg * Math.PI) / 180;
  const phiPositive = ((lngDeg + 180) / 360) * Math.PI * 2;
  const cosLat = Math.cos(latRad);
  const y = Math.sin(latRad);
  const x = -Math.cos(phiPositive) * cosLat;
  const z = Math.sin(phiPositive) * cosLat;
  return [x, y, z];
}

export interface LodPolicy {
  /** Максимальный уровень детализации, глубже не делим никогда (защита от бесконечного спуска). */
  maxLod: number;
  /** Радиус глобуса — должен совпадать с CRUST_R сцены. */
  radius: number;
  /** Расстояние камеры (до точки на поверхности), на котором/дальше которого желаемый LOD = 0. */
  baseDistance: number;
  /** Порог скалярного произведения "смотрит ли тайл на камеру" — меньше этого считаем задней стороной/горизонтом. */
  horizonDot: number;
}

export const DEFAULT_LOD_POLICY: LodPolicy = {
  maxLod: 4,
  radius: 1,
  baseDistance: 8,
  horizonDot: -0.15,
};

function desiredLodForDistance(distance: number, policy: LodPolicy): number {
  if (distance <= 0) return policy.maxLod;
  const raw = Math.log2(policy.baseDistance / distance);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(policy.maxLod, Math.floor(raw)));
}

export type TileVisualState = "visible" | "parent-fallback";

export interface SelectedTile {
  id: TileId;
  key: string;
  state: TileVisualState;
}

/** true, если у тайла с этим ключом есть готовые (ready) данные для рендера. */
export type TileReadyLookup = (key: string) => boolean;

export interface TileSelectionResult {
  /** Тайлы, которые нужно показать в этом кадре (готовые листья + "родитель вместо ещё не готовых детей"). */
  rendered: SelectedTile[];
  /** Тайлы, которые стоит запросить у провайдера (желаемые, но ещё не готовые). */
  pending: TileId[];
}

/**
 * Основной обход quadtree — решает, какие тайлы показать ПРЯМО СЕЙЧАС.
 * Спускается только туда, где тайл одновременно (а) обращён к камере и
 * (б) достаточно близко к точке, куда камера реально смотрит — это и даёт
 * "детализация концентрируется вокруг актуального региона", а не деление
 * всей видимой полусферы разом. Пока не все 4 потомка готовы — родитель
 * остаётся видимым (без дыр при переключении LOD).
 */
export function selectTiles(
  cameraPos: Vec3,
  isReady: TileReadyLookup,
  policy: LodPolicy = DEFAULT_LOD_POLICY,
  roots: TileId[] = ROOT_TILES
): TileSelectionResult {
  const camDir = normalize(cameraPos);
  const rendered: SelectedTile[] = [];
  const pending: TileId[] = [];

  function visit(id: TileId): void {
    const center = tileCenter(id);
    const centerDir = latLngToUnitVec3(center.lat, center.lng);
    const facing = dot(centerDir, camDir);
    if (facing < policy.horizonDot) return; // задняя сторона глобуса/за горизонтом — не рендерим и не спускаемся глубже

    const surfacePoint = scale(centerDir, policy.radius);
    const distToTile = length(sub(cameraPos, surfacePoint));
    const desired = desiredLodForDistance(distToTile, policy);
    const key = tileKey(id);
    const ready = isReady(key);

    if (id.z < desired && id.z < policy.maxLod) {
      const kids = childrenOf(id);
      const allKidsReady = kids.every((k) => isReady(tileKey(k)));
      if (allKidsReady) {
        kids.forEach(visit);
        return;
      }
      // Дети ещё не готовы — держим родителя видимым (если он сам готов),
      // просим у провайдера детей ТОЛЬКО когда родитель уже есть чем
      // временно закрыть дыру (прогрессивное уточнение, не спекулятивный
      // запрос глубины раньше, чем она реально станет нужна).
      rendered.push({ id, key, state: ready ? "visible" : "parent-fallback" });
      if (!ready) {
        pending.push(id);
      } else {
        kids.forEach((k) => {
          if (!isReady(tileKey(k))) pending.push(k);
        });
      }
      return;
    }

    rendered.push({ id, key, state: ready ? "visible" : "parent-fallback" });
    if (!ready) pending.push(id);
  }

  roots.forEach(visit);
  return { rendered, pending };
}

/**
 * Тот же обход, но БЕЗ учёта готовности данных — "идеальный" листовой набор
 * тайлов, если бы всё уже было загружено. Используется только в тестах для
 * проверки самой политики LOD в отрыве от состояния кэша/загрузки.
 */
export function desiredLeaves(
  cameraPos: Vec3,
  policy: LodPolicy = DEFAULT_LOD_POLICY,
  roots: TileId[] = ROOT_TILES
): TileId[] {
  const result = selectTiles(cameraPos, () => true, policy, roots);
  return result.rendered.map((t) => t.id);
}
