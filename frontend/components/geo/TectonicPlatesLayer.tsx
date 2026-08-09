"use client";

/**
 * TectonicPlatesLayer — G6: границы литосферных плит (PB2002, Peter Bird
 * 2003). Тот же паттерн, что CountryBordersLayer (G5): один статичный
 * датасет на всю сессию, hemisphere-culling по камере, без TileEngine.
 * Клик по границе → компактная карточка (PlateA vs PlateB, тип границы).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { latLngToVector3 } from "@/lib/geo/coordinates";
import {
  buildPlateNameLookup,
  createPlateBoundaryLoader,
  createPlatePolygonLoader,
  plateBoundaryColor,
  type PlateBoundaryFeatureCollection,
  type PlatePolygonFeatureCollection,
} from "@/lib/geo/providers/tectonic-plates";
import { isFacingCamera } from "@/lib/geo/geo-vector-lod";
import { lngLatToLatLng } from "@/lib/geo/vector-geojson";
import type { GeoFeatureInfo } from "./GeoFeatureInfoCard";

const BOUNDARY_RADIUS = 1.008;
const TICK_INTERVAL_S = 0.5;

interface BoundaryEntry {
  key: string;
  points: Array<[number, number, number]>;
  color: string;
  representativeLat: number;
  representativeLng: number;
  plateA: string;
  plateB: string;
  type: string;
}

export interface TectonicPlatesLayerProps {
  onSelect: (info: GeoFeatureInfo) => void;
}

export default function TectonicPlatesLayer({ onSelect }: TectonicPlatesLayerProps) {
  const boundaryLoaderRef = useRef(createPlateBoundaryLoader());
  const polygonLoaderRef = useRef(createPlatePolygonLoader());
  const [boundaries, setBoundaries] = useState<PlateBoundaryFeatureCollection | null>(null);
  const [plateNames, setPlateNames] = useState<Map<string, string>>(new Map());
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const lastTickRef = useRef(0);

  useEffect(() => {
    const boundaryLoader = boundaryLoaderRef.current;
    const polygonLoader = polygonLoaderRef.current;
    return () => {
      boundaryLoader.dispose();
      polygonLoader.dispose();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    boundaryLoaderRef.current.load("default").then((data) => {
      if (!cancelled) setBoundaries(data);
    }).catch(() => {});
    polygonLoaderRef.current.load("default").then((data: PlatePolygonFeatureCollection) => {
      if (!cancelled) setPlateNames(buildPlateNameLookup(data));
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const entries: BoundaryEntry[] = useMemo(() => {
    if (!boundaries) return [];
    return boundaries.features.map((feature, i) => {
      const coords = feature.geometry.coordinates;
      const points = coords.map((coord) => {
        const { lat, lng } = lngLatToLatLng(coord);
        const p = latLngToVector3(lat, lng, BOUNDARY_RADIUS);
        return [p.x, p.y, p.z] as [number, number, number];
      });
      const mid = coords[Math.floor(coords.length / 2)];
      const { lat: repLat, lng: repLng } = lngLatToLatLng(mid);
      return {
        key: `${feature.properties.Name}-${i}`,
        points,
        color: plateBoundaryColor(feature.properties.Type),
        representativeLat: repLat,
        representativeLng: repLng,
        plateA: feature.properties.PlateA,
        plateB: feature.properties.PlateB,
        type: feature.properties.Type,
      };
    });
  }, [boundaries]);

  useFrame((state) => {
    if (state.clock.elapsedTime - lastTickRef.current < TICK_INTERVAL_S) return;
    lastTickRef.current = state.clock.elapsedTime;
    const camPos = state.camera.position;
    const cam: [number, number, number] = [camPos.x, camPos.y, camPos.z];
    const next = new Set<string>();
    for (const entry of entries) {
      if (isFacingCamera(entry.representativeLat, entry.representativeLng, cam)) next.add(entry.key);
    }
    setVisibleKeys(next);
  });

  function handleClick(e: ThreeEvent<MouseEvent>, entry: BoundaryEntry) {
    e.stopPropagation();
    const nameA = plateNames.get(entry.plateA) ?? entry.plateA;
    const nameB = plateNames.get(entry.plateB) ?? entry.plateB;
    onSelect({
      title: `${nameA} / ${nameB}`,
      subtitle: "Граница литосферных плит",
      lines: [
        entry.type === "subduction"
          ? "Тип: зона субдукции — одна плита погружается под другую."
          : "Тип границы: не классифицирован в источнике (PB2002).",
      ],
      position: [e.point.x, e.point.y, e.point.z],
    });
  }

  const visible = entries.filter((e) => visibleKeys.has(e.key));

  return (
    <>
      {visible.map((entry) => (
        <group key={entry.key} onClick={(e) => handleClick(e, entry)}>
          <Line points={entry.points} color={entry.color} transparent opacity={0.75} lineWidth={2} />
        </group>
      ))}
    </>
  );
}
