"use client";

/**
 * TileDebugLayer — визуализация тайлового/LOD-движка G2 ЗАГЛУШЕЧНЫМИ данными
 * (см. lib/geo/tile-engine.ts). Существует только когда включён debug-тоггл
 * в GeoWorldScene — не постоянный производственный UI, а инструмент,
 * доказывающий архитектуру: границы тайлов, их LOD/id, что родитель держит
 * покрытие, пока не готовы дети.
 *
 * Камера читается через стандартный R3F useThree()/useFrame() — тайловый
 * движок НЕ завязан на внутренности GlobeControls, ему достаточно текущей
 * позиции камеры, которую даёт сам R3F вне зависимости от того, что именно
 * её туда поставило (GlobeControls, OrbitControls или что угодно другое).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { latLngToVector3 } from "@/lib/geo/coordinates";
import { DebugTileProvider } from "@/lib/geo/tile-provider";
import { TileEngine, type TileEngineStats } from "@/lib/geo/tile-engine";
import type { SelectedTile } from "@/lib/geo/tile-lod";
import { tileBounds, type TileBounds } from "@/lib/geo/tiling";

// Чуть выше поверхности коры (CRUST_R=1 в GeoWorldScene) — чтобы дебаг-слой
// не мерцал (z-fighting) с реальной текстурой Земли под ним.
const TILE_RADIUS = 1.02;
const LABEL_RADIUS = TILE_RADIUS * 1.01;
// LOD не пересчитывается каждый кадр — 5 раз в секунду достаточно для
// визуальной обратной связи и на порядок дешевле по CPU.
const TICK_INTERVAL_S = 0.2;
const SEGMENTS = 6;

function buildTileGeometry(bounds: TileBounds): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const stride = SEGMENTS + 1;

  for (let iy = 0; iy <= SEGMENTS; iy++) {
    const lat = THREE.MathUtils.lerp(bounds.latMax, bounds.latMin, iy / SEGMENTS);
    for (let ix = 0; ix <= SEGMENTS; ix++) {
      const lng = THREE.MathUtils.lerp(bounds.lngMin, bounds.lngMax, ix / SEGMENTS);
      const p = latLngToVector3(lat, lng, TILE_RADIUS);
      positions.push(p.x, p.y, p.z);
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
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

interface RenderableTile {
  tile: SelectedTile;
  color: string;
  label: string;
}

function TileDebugMesh({ tile, color, label }: RenderableTile) {
  const bounds = useMemo(() => tileBounds(tile.id), [tile.id]);
  const geometry = useMemo(() => buildTileGeometry(bounds), [bounds]);
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);
  const labelPosition = useMemo(() => {
    const lat = (bounds.latMin + bounds.latMax) / 2;
    const lng = (bounds.lngMin + bounds.lngMax) / 2;
    return latLngToVector3(lat, lng, LABEL_RADIUS);
  }, [bounds]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      edges.dispose();
    };
  }, [geometry, edges]);

  return (
    <group>
      <mesh geometry={geometry}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={tile.state === "parent-fallback" ? 0.32 : 0.55}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.5} />
      </lineSegments>
      <Text
        position={labelPosition}
        fontSize={0.035}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.002}
        outlineColor="#000000"
      >
        {`${label} (LOD ${tile.id.z})`}
      </Text>
    </group>
  );
}

export interface TileDebugLayerProps {
  onStats?: (stats: TileEngineStats) => void;
}

export default function TileDebugLayer({ onStats }: TileDebugLayerProps) {
  const engineRef = useRef<TileEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new TileEngine(new DebugTileProvider());
  }

  const [renderTiles, setRenderTiles] = useState<RenderableTile[]>([]);
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
      const next: RenderableTile[] = [];
      for (const tile of frame.rendered) {
        const data = frame.tiles.get(tile.key);
        if (data) next.push({ tile, color: data.color, label: data.label });
      }
      setRenderTiles(next);
    }

    onStats?.(frame.stats);
  });

  return (
    <>
      {renderTiles.map(({ tile, color, label }) => (
        <TileDebugMesh key={tile.key} tile={tile} color={color} label={label} />
      ))}
    </>
  );
}
