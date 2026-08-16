import { describe, expect, it } from "vitest";
import { buildTerrainMeshData, DEFAULT_SKIRT_DEPTH, DEFAULT_TERRAIN_RESOLUTION } from "./terrain-mesh";
import { elevationToSceneRadius, DEFAULT_EXAGGERATION } from "./elevation-sampling";
import { latLngToVector3 } from "./coordinates";
import { tileBounds } from "./tiling";

const flatSampler = () => 0; // уровень моря везде — простая, предсказуемая геометрия для проверки формы
const mountainSampler = (lat: number, lng: number) => (lat > 5 && lng > 5 ? 8000 : 0);

describe("GeoWorld G4 — buildTerrainMeshData: базовая геометрия", () => {
  const bounds = { latMin: 0, latMax: 10, lngMin: 0, lngMax: 10 };

  it("основная сетка содержит (resolution+1)^2 вершин ДО добавления юбки", () => {
    const data = buildTerrainMeshData(bounds, flatSampler, { skirtDepth: 0 });
    const stride = DEFAULT_TERRAIN_RESOLUTION + 1;
    expect(data.positions.length / 3).toBe(stride * stride);
    expect(data.uvs.length / 2).toBe(stride * stride);
  });

  it("на уровне моря (0м) все вершины лежат ровно на baseRadius от центра", () => {
    const data = buildTerrainMeshData(bounds, flatSampler, { baseRadius: 1, skirtDepth: 0 });
    for (let i = 0; i < data.positions.length; i += 3) {
      const len = Math.hypot(data.positions[i], data.positions[i + 1], data.positions[i + 2]);
      expect(len).toBeCloseTo(1, 5);
    }
  });

  it("вершина с положительной высотой лежит СТРОГО дальше от центра, чем на уровне моря", () => {
    const data = buildTerrainMeshData(bounds, mountainSampler, { baseRadius: 1, skirtDepth: 0, resolution: 4 });
    const stride = 5;
    let sawElevated = false;
    for (let iy = 0; iy < stride; iy++) {
      for (let ix = 0; ix < stride; ix++) {
        const i = (iy * stride + ix) * 3;
        const len = Math.hypot(data.positions[i], data.positions[i + 1], data.positions[i + 2]);
        if (len > 1.0001) sawElevated = true;
      }
    }
    expect(sawElevated).toBe(true);
  });

  it("индексы треугольников ссылаются только на существующие вершины", () => {
    const data = buildTerrainMeshData(bounds, mountainSampler, { resolution: 4 });
    const vertexCount = data.positions.length / 3;
    for (const idx of data.indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(vertexCount);
    }
  });

  it("не даёт NaN/бесконечности даже на экстремальных высотах и полюсах", () => {
    const poleBounds = { latMin: 80, latMax: 90, lngMin: 0, lngMax: 10 };
    const data = buildTerrainMeshData(poleBounds, () => 8849, { resolution: 4 });
    for (const v of data.positions) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("GeoWorld G4 — юбка (skirt): скрывает щели между разными уровнями LOD", () => {
  const bounds = { latMin: 0, latMax: 10, lngMin: 0, lngMax: 10 };

  it("добавляет ровно 4×(resolution+1) дополнительных вершин юбки", () => {
    const resolution = 4;
    const withSkirt = buildTerrainMeshData(bounds, flatSampler, { resolution, skirtDepth: DEFAULT_SKIRT_DEPTH });
    const withoutSkirt = buildTerrainMeshData(bounds, flatSampler, { resolution, skirtDepth: 0 });
    const stride = resolution + 1;
    expect(withSkirt.positions.length / 3 - withoutSkirt.positions.length / 3).toBe(4 * stride);
  });

  it("вершины юбки лежат БЛИЖЕ к центру планеты, чем соответствующие им граничные вершины основной сетки", () => {
    const resolution = 4;
    const skirtDepth = 0.06;
    const data = buildTerrainMeshData(bounds, flatSampler, { resolution, skirtDepth, baseRadius: 1 });
    const stride = resolution + 1;
    const mainVertexCount = stride * stride;
    // первая вершина юбки (north side, первая точка) должна быть короче базового радиуса ровно на skirtDepth
    const skirtLen = Math.hypot(
      data.positions[mainVertexCount * 3],
      data.positions[mainVertexCount * 3 + 1],
      data.positions[mainVertexCount * 3 + 2]
    );
    expect(skirtLen).toBeCloseTo(1 - skirtDepth, 5);
  });

  it("skirtDepth=0 не добавляет вершин юбки вообще", () => {
    const data = buildTerrainMeshData(bounds, flatSampler, { skirtDepth: 0 });
    const stride = DEFAULT_TERRAIN_RESOLUTION + 1;
    expect(data.positions.length / 3).toBe(stride * stride);
  });
});

describe("GeoWorld G4 — согласованность швов между соседними тайлами ОДНОГО уровня LOD", () => {
  it("общая граница двух соседних (по долготе) внутренних тайлов даёт ИДЕНТИЧНЫЕ позиции вершин при одном и том же сэмплере", () => {
    const west = tileBounds({ z: 1, x: 0, y: 0 }); // lng -180..0
    const east = tileBounds({ z: 1, x: 1, y: 0 }); // lng 0..180 — сосед west по долготе, общая граница lng=0
    expect(west.lngMax).toBe(east.lngMin); // сами внутренние границы стыкуются точно (проверено уже в tiling.test.ts) — предпосылка этого теста

    const sampler = (lat: number, lng: number) => Math.abs(lat) * 100 + Math.abs(lng) * 10; // детерминированная, но не тривиально-константная функция

    const resolution = 8;
    const westMesh = buildTerrainMeshData(west, sampler, { resolution, skirtDepth: 0 });
    const eastMesh = buildTerrainMeshData(east, sampler, { resolution, skirtDepth: 0 });

    const stride = resolution + 1;
    // восточный край west-тайла (ix=resolution) должен совпасть с западным краем east-тайла (ix=0)
    for (let iy = 0; iy < stride; iy++) {
      const westEdgeIdx = (iy * stride + resolution) * 3;
      const eastEdgeIdx = (iy * stride + 0) * 3;
      expect(westMesh.positions[westEdgeIdx]).toBeCloseTo(eastMesh.positions[eastEdgeIdx], 10);
      expect(westMesh.positions[westEdgeIdx + 1]).toBeCloseTo(eastMesh.positions[eastEdgeIdx + 1], 10);
      expect(westMesh.positions[westEdgeIdx + 2]).toBeCloseTo(eastMesh.positions[eastEdgeIdx + 2], 10);
    }
  });
});

describe("GeoWorld G4 — соответствие формуле elevationToSceneRadius", () => {
  it("позиция вершины на заданной высоте совпадает с latLngToVector3 на радиусе из elevationToSceneRadius", () => {
    const bounds = { latMin: 0, latMax: 0.0001, lngMin: 0, lngMax: 0.0001 }; // крошечный тайл — вершина (0,0) почти точно совпадает с сэмплом
    const sampler = () => 1000;
    const data = buildTerrainMeshData(bounds, sampler, { resolution: 1, skirtDepth: 0, baseRadius: 1, exaggeration: DEFAULT_EXAGGERATION });
    const expectedRadius = elevationToSceneRadius(1000, 1, DEFAULT_EXAGGERATION);
    const expected = latLngToVector3(bounds.latMax, bounds.lngMin, expectedRadius);
    expect(data.positions[0]).toBeCloseTo(expected.x, 6);
    expect(data.positions[1]).toBeCloseTo(expected.y, 6);
    expect(data.positions[2]).toBeCloseTo(expected.z, 6);
  });
});
