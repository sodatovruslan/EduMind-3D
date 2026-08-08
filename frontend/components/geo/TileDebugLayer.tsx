"use client";

/**
 * TileDebugLayer — ЧИСТО презентационный слой поверх реального движка (G3):
 * рисует контур + подпись (id/LOD) внутренней geodetic-сетки G2 для тайлов,
 * которые ДВИЖОК СЧИТАЕТ активными прямо сейчас. Не владеет ни TileEngine,
 * ни провайдером, не тикает сам — раньше (G2) у него был собственный
 * DebugTileProvider/TileEngine, но с приходом реального провайдера (G3) это
 * означало бы ДВА параллельных движка и двойной сетевой трафик одновременно
 * с рассинхронизированными debug-границами. Теперь единственный источник
 * истины — TileEngine внутри RealEarthTileLayer, этот компонент только рисует
 * то, что ему передали.
 *
 * Специально рисует НАШИ внутренние границы (tileBounds(id)), а не реальные
 * границы тайлов провайдера — цель именно в том, чтобы видеть решения
 * LOD-движка (какие внутренние ячейки он считает активными), а не сетку
 * конкретного провайдера имиджей.
 */

import { useMemo } from "react";
import * as THREE from "three";
// drei <Line>, не сырой JSX-тег <line> — тот конфликтует с SVG-элементом
// "line" из типов React (тот же приём, что PlateBoundaries в GeoWorldScene.tsx).
import { Line, Text } from "@react-three/drei";
import { latLngToVector3 } from "@/lib/geo/coordinates";
import type { SelectedTile } from "@/lib/geo/tile-lod";
import { tileBounds, type TileBounds } from "@/lib/geo/tiling";

const OUTLINE_RADIUS = 1.025; // чуть выше слоя реальных тайлов (1.021), чтобы контур не терялся под картинкой
const SEGMENTS = 6;

function buildOutlinePoints(bounds: TileBounds): Array<[number, number, number]> {
  const points: Array<[number, number, number]> = [];
  const push = (lat: number, lng: number) => {
    const p = latLngToVector3(lat, lng, OUTLINE_RADIUS);
    points.push([p.x, p.y, p.z]);
  };
  for (let ix = 0; ix <= SEGMENTS; ix++) push(bounds.latMax, THREE.MathUtils.lerp(bounds.lngMin, bounds.lngMax, ix / SEGMENTS));
  for (let iy = 0; iy <= SEGMENTS; iy++) push(THREE.MathUtils.lerp(bounds.latMax, bounds.latMin, iy / SEGMENTS), bounds.lngMax);
  for (let ix = SEGMENTS; ix >= 0; ix--) push(bounds.latMin, THREE.MathUtils.lerp(bounds.lngMin, bounds.lngMax, ix / SEGMENTS));
  for (let iy = SEGMENTS; iy >= 0; iy--) push(THREE.MathUtils.lerp(bounds.latMax, bounds.latMin, iy / SEGMENTS), bounds.lngMin);
  return points;
}

function TileOutline({ tile }: { tile: SelectedTile }) {
  const bounds = useMemo(() => tileBounds(tile.id), [tile.id]);
  const points = useMemo(() => buildOutlinePoints(bounds), [bounds]);
  const labelPosition = useMemo(() => {
    const lat = (bounds.latMin + bounds.latMax) / 2;
    const lng = (bounds.lngMin + bounds.lngMax) / 2;
    return latLngToVector3(lat, lng, OUTLINE_RADIUS * 1.005);
  }, [bounds]);

  return (
    <group>
      <Line points={points} color={tile.state === "parent-fallback" ? "#fbbf24" : "#22d3ee"} transparent opacity={0.85} lineWidth={1.5} />
      <Text
        position={labelPosition}
        fontSize={0.03}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.002}
        outlineColor="#000000"
      >
        {`${tile.key} (LOD ${tile.id.z})`}
      </Text>
    </group>
  );
}

export interface TileDebugLayerProps {
  tiles: SelectedTile[];
}

export default function TileDebugLayer({ tiles }: TileDebugLayerProps) {
  return (
    <>
      {tiles.map((tile) => (
        <TileOutline key={tile.key} tile={tile} />
      ))}
    </>
  );
}
