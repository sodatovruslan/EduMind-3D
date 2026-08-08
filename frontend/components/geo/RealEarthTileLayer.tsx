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
import { TileEngine, type TileEngineStats } from "@/lib/geo/tile-engine";
import type { SelectedTile } from "@/lib/geo/tile-lod";
import { tileBounds, type TileBounds } from "@/lib/geo/tiling";
import type { TileData } from "@/lib/geo/tile-provider";

// Между базовой корой (radius=1) и облаками (1.015) — реальные тайлы стоят
// НИЖЕ облаков (облака визуально продолжают "парить" над новой картинкой,
// как и раньше над старой), но заметно выше coры/границ плит (1.003).
const REAL_TILE_RADIUS = 1.008;
const TICK_INTERVAL_S = 0.2;
const SEGMENTS = 8;

function buildPatchGeometry(bounds: TileBounds): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const stride = SEGMENTS + 1;

  for (let iy = 0; iy <= SEGMENTS; iy++) {
    const lat = THREE.MathUtils.lerp(bounds.latMax, bounds.latMin, iy / SEGMENTS);
    const v = 1 - iy / SEGMENTS;
    for (let ix = 0; ix <= SEGMENTS; ix++) {
      const lng = THREE.MathUtils.lerp(bounds.lngMin, bounds.lngMax, ix / SEGMENTS);
      const u = ix / SEGMENTS;
      const p = latLngToVector3(lat, lng, REAL_TILE_RADIUS);
      positions.push(p.x, p.y, p.z);
      uvs.push(u, v);
    }
  }
  for (let iy = 0; iy < SEGMENTS; iy++) {
    for (let ix = 0; ix < SEGMENTS; ix++) {
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

function RealTileMesh({ tile, data }: { tile: SelectedTile; data: TileData }) {
  const bounds = useMemo(() => data.bounds ?? tileBounds(tile.id), [data.bounds, tile.id]);
  const geometry = useMemo(() => buildPatchGeometry(bounds), [bounds]);
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
}

export default function RealEarthTileLayer({ onFrame }: RealEarthTileLayerProps) {
  const engineRef = useRef<TileEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new TileEngine(new GibsTileProvider());
  }

  const [renderTiles, setRenderTiles] = useState<Array<{ tile: SelectedTile; data: TileData }>>([]);
  const lastKeysRef = useRef<string>("");
  const lastTickAtRef = useRef(0);

  useEffect(() => {
    const engine = engineRef.current;
    return () => {
      engine?.dispose();
    };
  }, []);

  useFrame((state) => {
    const engine = engineRef.current;
    if (!engine) return;
    if (state.clock.elapsedTime - lastTickAtRef.current < TICK_INTERVAL_S) return;
    lastTickAtRef.current = state.clock.elapsedTime;

    const camPos = state.camera.position;
    const frame = engine.tick([camPos.x, camPos.y, camPos.z]);

    const nextKeys = frame.rendered
      .map((t) => t.key)
      .sort()
      .join("|");
    if (nextKeys !== lastKeysRef.current) {
      lastKeysRef.current = nextKeys;
      const next: Array<{ tile: SelectedTile; data: TileData }> = [];
      for (const tile of frame.rendered) {
        const data = frame.tiles.get(tile.key);
        if (data?.image) next.push({ tile, data });
      }
      setRenderTiles(next);
    }

    onFrame?.(frame.rendered, frame.stats);
  });

  return (
    <>
      {renderTiles.map(({ tile, data }) => (
        <RealTileMesh key={tile.key} tile={tile} data={data} />
      ))}
    </>
  );
}
