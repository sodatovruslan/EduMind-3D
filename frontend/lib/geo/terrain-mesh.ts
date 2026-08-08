import * as THREE from "three";
import { latLngToVector3 } from "./coordinates";
import { DEFAULT_EXAGGERATION, elevationToSceneRadius } from "./elevation-sampling";
import type { TileBounds } from "./tiling";

/**
 * Ограниченное разрешение сетки рельефа на тайл — 16×16 квадов (17×17
 * вершин). Выбрано как золотая середина между "гора реально выглядит
 * объёмной" и "не тысячи вершин на обычный ноутбук на тайл" (см. ТЗ G4,
 * раздел "Terrain tile mesh resolution" — сравнивались 8/16/32; 8 давало
 * заметно гранёные склоны на тестовых высотах Памира/Гималаев, 32
 * учетверяет вершины почти без заметной разницы на радиусе экрана обычного
 * зума — 16 выбран как разумный default, не измерялся на реальном железе
 * пользователя, подлежит уточнению по факту жалоб на производительность).
 */
export const DEFAULT_TERRAIN_RESOLUTION = 16;

/**
 * Глубина "юбки" по краям тайла в единицах сцены — тонкая вертикальная
 * стенка, свисающая от края тайла к центру планеты, скрывающая щели между
 * соседними тайлами на РАЗНЫХ уровнях LOD (разное разрешение сетки высот
 * → разные значения на теоретически одной и той же границе). Стандартная,
 * простая и надёжная техника (см. ТЗ G4, раздел "Seams" — явно предложена
 * как один из вариантов). Значение с запасом больше максимально возможного
 * подъёма при максимальной экзагерации (см. elevation-sampling.test.ts —
 * Эверест с educational-экзагерацией даёт подъём ~0.02 юнита; 0.06 — запас
 * с кратным превышением на случай ещё большей ручной экзагерации).
 */
export const DEFAULT_SKIRT_DEPTH = 0.06;

export type ElevationSampler = (lat: number, lng: number) => number;

export interface TerrainMeshOptions {
  resolution?: number;
  baseRadius?: number;
  exaggeration?: number;
  /** 0 отключает юбки (например, для превью/тестов, где швы не важны). */
  skirtDepth?: number;
}

export interface TerrainMeshData {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

/**
 * Строит геометрию тайла рельефа: основная сетка следует кривизне планеты
 * (через latLngToVector3, ту же формулу, что у всей остальной сцены) и
 * высоте (через sampleElevationAt → elevationToSceneRadius), плюс
 * опциональная "юбка" по периметру. НЕ зависит от React/R3F — testable
 * напрямую (THREE.Vector3 — чистая математика, WebGL не нужен).
 */
export function buildTerrainMeshData(bounds: TileBounds, sampleElevationAt: ElevationSampler, options: TerrainMeshOptions = {}): TerrainMeshData {
  const resolution = options.resolution ?? DEFAULT_TERRAIN_RESOLUTION;
  const baseRadius = options.baseRadius ?? 1;
  const exaggeration = options.exaggeration ?? DEFAULT_EXAGGERATION;
  const skirtDepth = options.skirtDepth ?? DEFAULT_SKIRT_DEPTH;
  const stride = resolution + 1;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const mainVertices: THREE.Vector3[] = [];

  for (let iy = 0; iy < stride; iy++) {
    const lat = THREE.MathUtils.lerp(bounds.latMax, bounds.latMin, iy / resolution);
    const v = 1 - iy / resolution;
    for (let ix = 0; ix < stride; ix++) {
      const lng = THREE.MathUtils.lerp(bounds.lngMin, bounds.lngMax, ix / resolution);
      const u = ix / resolution;
      const rawMeters = sampleElevationAt(lat, lng);
      const radius = elevationToSceneRadius(rawMeters, baseRadius, exaggeration);
      const p = latLngToVector3(lat, lng, radius);
      mainVertices.push(p);
      positions.push(p.x, p.y, p.z);
      uvs.push(u, v);
    }
  }

  for (let iy = 0; iy < resolution; iy++) {
    for (let ix = 0; ix < resolution; ix++) {
      const a = iy * stride + ix;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  if (skirtDepth > 0) {
    addSkirt(
      mainVertices,
      stride,
      resolution,
      skirtDepth,
      positions,
      uvs,
      indices
    );
  }

  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}

// Индексы граничных вершин основной сетки по каждой из 4 сторон, в порядке
// обхода вдоль границы — переиспользуются для построения полосы юбки.
function edgeIndices(stride: number, resolution: number, side: "north" | "south" | "west" | "east"): number[] {
  const idx: number[] = [];
  if (side === "north") for (let ix = 0; ix < stride; ix++) idx.push(0 * stride + ix);
  if (side === "south") for (let ix = 0; ix < stride; ix++) idx.push(resolution * stride + ix);
  if (side === "west") for (let iy = 0; iy < stride; iy++) idx.push(iy * stride + 0);
  if (side === "east") for (let iy = 0; iy < stride; iy++) idx.push(iy * stride + resolution);
  return idx;
}

function addSkirt(
  mainVertices: THREE.Vector3[],
  stride: number,
  resolution: number,
  skirtDepth: number,
  positions: number[],
  uvs: number[],
  indices: number[]
): void {
  const sides: Array<"north" | "south" | "west" | "east"> = ["north", "south", "west", "east"];
  for (const side of sides) {
    const edge = edgeIndices(stride, resolution, side);
    const droppedBase = positions.length / 3;
    for (const vertexIndex of edge) {
      const p = mainVertices[vertexIndex];
      const dropped = p.clone().setLength(Math.max(0, p.length() - skirtDepth));
      positions.push(dropped.x, dropped.y, dropped.z);
      uvs.push(0, 0); // юбка невидима под текстурой соседней геометрии — UV не важен
    }
    for (let i = 0; i < edge.length - 1; i++) {
      const topA = edge[i];
      const topB = edge[i + 1];
      const bottomA = droppedBase + i;
      const bottomB = droppedBase + i + 1;
      // сторона наружу — обход против часовой стрелки со стороны внешнего наблюдателя
      indices.push(topA, bottomA, topB, topB, bottomA, bottomB);
    }
  }
}
