"use client";

/**
 * RealEarthTileLayer — G3: подключает НАСТОЯЩИЕ спутниковые снимки Земли
 * (NASA GIBS, BlueMarble_NextGeneration) поверх того же G2 тайлового/LOD-
 * движка (TileEngine), который раньше двигал только цветные заглушки.
 *
 * Существующий базовый шар Земли в EarthLayers (GeoWorldScene.tsx,
 * локальная NASA-текстура colorMap) НЕ убирается и не заменяется — он
 * остаётся низкодетальным fallback, который виден ВСЕГДА, в том числе пока
 * настоящие тайлы этого слоя ещё грузятся. Реальные тайлы рисуются как
 * непрозрачные заплатки чуть выше поверхности коры — по мере готовности
 * они прогрессивно перекрывают базовую текстуру более резкой картинкой;
 * пока тайл не готов, сквозь эту область просто видно ту же самую базовую
 * текстуру — чёрных дыр в принципе быть не может, потому что база есть
 * всегда, а не является частью этого слоя.
 *
 * Камера читается через штатный R3F useThree()/useFrame() — как и
 * debug-слой G2, этот компонент НЕ обращается к GlobeControls вообще.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { latLngToVector3 } from "@/lib/geo/coordinates";
import { GibsTileProvider } from "@/lib/geo/providers/gibs-provider";
import { TerrariumElevationProvider } from "@/lib/geo/providers/terrarium-provider";
import { ElevationEngineAdapter } from "@/lib/geo/elevation-engine-adapter";
import { TileEngine, type TileEngineStats } from "@/lib/geo/tile-engine";
import type { SelectedTile } from "@/lib/geo/tile-lod";
import { tileBounds, type TileBounds } from "@/lib/geo/tiling";
import type { TileData } from "@/lib/geo/tile-provider";
import type { ElevationTileData } from "@/lib/geo/elevation-provider";
import { sampleElevation } from "@/lib/geo/elevation-sampling";
import { buildTerrainMeshData, DEFAULT_TERRAIN_RESOLUTION } from "@/lib/geo/terrain-mesh";

// Между базовой корой (radius=1) и облаками (1.015) — реальные тайлы стоят
// НИЖЕ облаков (облака визуально продолжают "парить" над новой картинкой,
// как и раньше над старой), но заметно выше coры/границ плит (1.003). Это
// базовый (не приподнятый рельефом) радиус — G4 отталкивается от него.
const REAL_TILE_RADIUS = 1.008;
const TICK_INTERVAL_S = 0.2;
const FLAT_SEGMENTS = 8;

function buildFlatPatchGeometry(bounds: TileBounds): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const stride = FLAT_SEGMENTS + 1;

  for (let iy = 0; iy <= FLAT_SEGMENTS; iy++) {
    const lat = THREE.MathUtils.lerp(bounds.latMax, bounds.latMin, iy / FLAT_SEGMENTS);
    const v = 1 - iy / FLAT_SEGMENTS;
    for (let ix = 0; ix <= FLAT_SEGMENTS; ix++) {
      const lng = THREE.MathUtils.lerp(bounds.lngMin, bounds.lngMax, ix / FLAT_SEGMENTS);
      const u = ix / FLAT_SEGMENTS;
      const p = latLngToVector3(lat, lng, REAL_TILE_RADIUS);
      positions.push(p.x, p.y, p.z);
      uvs.push(u, v);
    }
  }
  for (let iy = 0; iy < FLAT_SEGMENTS; iy++) {
    for (let ix = 0; ix < FLAT_SEGMENTS; ix++) {
      const a = iy * stride + ix;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// G4: рельеф строится из ТЕХ ЖЕ данных высот, но геометрия остаётся тем же
// мешем, что несёт текстуру снимка (см. ТЗ G4, раздел "Imagery on terrain" —
// "terrain mesh + imagery material, НЕ отдельная оболочка рядом" — иначе
// z-fighting/дублирование). Смещение по высоте применяется ТОЛЬКО когда
// готовы и снимок, и рельеф для одного и того же тайла — иначе плоская
// заплатка G3 без изменений (никакой "голой кочки" без текстуры).
function buildTerrainedPatchGeometry(bounds: TileBounds, elevation: ElevationTileData, exaggeration: number): THREE.BufferGeometry {
  const mesh = buildTerrainMeshData(bounds, (lat, lng) => sampleElevation(elevation, lat, lng), {
    resolution: DEFAULT_TERRAIN_RESOLUTION,
    baseRadius: REAL_TILE_RADIUS,
    exaggeration,
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(mesh.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

interface RealTileMeshProps {
  tile: SelectedTile;
  data: TileData;
  elevation?: ElevationTileData;
  exaggeration: number;
}

function RealTileMesh({ tile, data, elevation, exaggeration }: RealTileMeshProps) {
  const bounds = useMemo(() => data.bounds ?? tileBounds(tile.id), [data.bounds, tile.id]);
  const geometry = useMemo(
    () => (elevation ? buildTerrainedPatchGeometry(bounds, elevation, exaggeration) : buildFlatPatchGeometry(bounds)),
    [bounds, elevation, exaggeration]
  );
  const texture = useMemo(() => {
    if (!data.image) return null;
    const tex = new THREE.Texture(data.image);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }, [data.image]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      texture?.dispose();
    };
  }, [geometry, texture]);

  if (!texture) return null;

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial map={texture} roughness={0.85} metalness={0} />
    </mesh>
  );
}

export interface RealEarthTileLayerProps {
  /** Вызывается раз в тик-интервал (throttled) — для debug-оверлея/счётчиков в родителе. */
  onFrame?: (rendered: SelectedTile[], stats: TileEngineStats) => void;
  /** G4: раздельная от снимков статистика движка рельефа — свой кэш/очередь запросов (см. GEOWORLD_ROADMAP.md, "Do NOT couple imagery and elevation providers"). */
  onTerrainFrame?: (stats: TileEngineStats) => void;
  /** Визуальный множитель высоты (см. lib/geo/elevation-sampling.ts, EXAGGERATION_PRESETS). 0 отключает рельеф целиком — плоские заплатки, как в G3. */
  exaggeration: number;
}

export default function RealEarthTileLayer({ onFrame, onTerrainFrame, exaggeration }: RealEarthTileLayerProps) {
  const engineRef = useRef<TileEngine<TileData> | null>(null);
  if (!engineRef.current) {
    engineRef.current = new TileEngine(new GibsTileProvider());
  }
  // G4: ОТДЕЛЬНЫЙ движок для рельефа — свой кэш, своя очередь запросов, свой
  // провайдер. Общий у них только тип позиции камеры и чистая LOD-политика
  // (tile-lod.ts) — намеренно НЕ единый инстанс с движком снимков.
  const terrainEngineRef = useRef<TileEngine<ElevationTileData> | null>(null);
  if (!terrainEngineRef.current) {
    terrainEngineRef.current = new TileEngine(new ElevationEngineAdapter(new TerrariumElevationProvider()));
  }

  const [renderTiles, setRenderTiles] = useState<Array<{ tile: SelectedTile; data: TileData; elevation?: ElevationTileData }>>([]);
  const lastKeysRef = useRef<string>("");
  const lastTickAtRef = useRef(0);
  const terrainTilesRef = useRef<Map<string, ElevationTileData>>(new Map());

  useEffect(() => {
    const engine = engineRef.current;
    const terrainEngine = terrainEngineRef.current;
    return () => {
      engine?.dispose();
      terrainEngine?.dispose();
    };
  }, []);

  useFrame((state) => {
    const engine = engineRef.current;
    const terrainEngine = terrainEngineRef.current;
    if (!engine || !terrainEngine) return;
    if (state.clock.elapsedTime - lastTickAtRef.current < TICK_INTERVAL_S) return;
    lastTickAtRef.current = state.clock.elapsedTime;

    const camPos = state.camera.position;
    const camVec: [number, number, number] = [camPos.x, camPos.y, camPos.z];
    const frame = engine.tick(camVec);
    const terrainFrame = exaggeration > 0 ? terrainEngine.tick(camVec) : null;
    terrainTilesRef.current = terrainFrame?.tiles ?? new Map();

    const nextKeys = frame.rendered
      .map((t) => `${t.key}:${terrainTilesRef.current.has(t.key)}`)
      .sort()
      .join("|");
    if (nextKeys !== lastKeysRef.current) {
      lastKeysRef.current = nextKeys;
      const next: Array<{ tile: SelectedTile; data: TileData; elevation?: ElevationTileData }> = [];
      for (const tile of frame.rendered) {
        const data = frame.tiles.get(tile.key);
        if (data?.image) next.push({ tile, data, elevation: terrainTilesRef.current.get(tile.key) });
      }
      setRenderTiles(next);
    }

    onFrame?.(frame.rendered, frame.stats);
    if (terrainFrame) onTerrainFrame?.(terrainFrame.stats);
  });

  return (
    <>
      {renderTiles.map(({ tile, data, elevation }) => (
        <RealTileMesh key={tile.key} tile={tile} data={data} elevation={elevation} exaggeration={exaggeration} />
      ))}
    </>
  );
}
