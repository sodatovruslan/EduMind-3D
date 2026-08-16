"use client";

/**
 * EarthquakesLayer — G6: землетрясения M4.5+ за последний месяц (USGS,
 * снимок, не живой поток). Дальше от Земли видны только крупные (M6+),
 * ближе — раскрываются все вплоть до M4.5 (тот же принцип "far: minimal,
 * closer: more", что maxVisibleScaleRank у городов в G5).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { latLngToVector3 } from "@/lib/geo/coordinates";
import { createEarthquakeLoader, magnitudeColor, type EarthquakeFeatureCollection } from "@/lib/geo/providers/earthquakes";
import { isFacingCamera } from "@/lib/geo/geo-vector-lod";
import type { GeoFeatureInfo } from "./GeoFeatureInfoCard";

const MARKER_RADIUS = 1.012;
const TICK_INTERVAL_S = 0.5;

/** Дальше — только заметные толчки; ближе — раскрываются все M4.5+. Тот же принцип, что maxVisibleScaleRank в geo-vector-lod.ts, но здесь не переиспользуем её напрямую — другая единица измерения (магнитуда, не ранг). */
export function minVisibleMagnitude(cameraDistance: number): number {
  if (cameraDistance > 4) return 6.5;
  if (cameraDistance > 2.5) return 5.5;
  return 4.5;
}

interface QuakeEntry {
  id: string;
  lat: number;
  lng: number;
  depth: number;
  mag: number;
  place: string;
  point: [number, number, number];
}

export interface EarthquakesLayerProps {
  onSelect: (info: GeoFeatureInfo) => void;
}

export default function EarthquakesLayer({ onSelect }: EarthquakesLayerProps) {
  const loaderRef = useRef(createEarthquakeLoader());
  const [data, setData] = useState<EarthquakeFeatureCollection | null>(null);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const lastTickRef = useRef(0);

  useEffect(() => {
    const loader = loaderRef.current;
    return () => loader.dispose();
  }, []);

  useEffect(() => {
    let cancelled = false;
    loaderRef.current
      .load("default")
      .then((collection) => {
        if (!cancelled) setData(collection);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const entries: QuakeEntry[] = useMemo(() => {
    if (!data) return [];
    return data.features.map((feature, i) => {
      const [lng, lat, depth] = feature.geometry.coordinates;
      const p = latLngToVector3(lat, lng, MARKER_RADIUS);
      return {
        id: `${feature.properties.time}-${i}`,
        lat,
        lng,
        depth,
        mag: feature.properties.mag,
        place: feature.properties.place,
        point: [p.x, p.y, p.z],
      };
    });
  }, [data]);

  useFrame((state) => {
    if (state.clock.elapsedTime - lastTickRef.current < TICK_INTERVAL_S) return;
    lastTickRef.current = state.clock.elapsedTime;
    const camPos = state.camera.position;
    const distance = camPos.length();
    const cam: [number, number, number] = [camPos.x, camPos.y, camPos.z];
    const minMag = minVisibleMagnitude(distance);
    const next = new Set<string>();
    for (const entry of entries) {
      if (entry.mag < minMag) continue;
      if (!isFacingCamera(entry.lat, entry.lng, cam)) continue;
      next.add(entry.id);
    }
    setVisibleIds(next);
  });

  function handleClick(e: ThreeEvent<MouseEvent>, entry: QuakeEntry) {
    e.stopPropagation();
    onSelect({
      title: `M ${entry.mag.toFixed(1)}`,
      subtitle: entry.place,
      lines: [`Глубина: ${entry.depth.toFixed(0)} км`, `Дата: ${new Date(Number(entry.id.split("-")[0])).toLocaleDateString("ru-RU")}`],
      position: [e.point.x, e.point.y, e.point.z],
    });
  }

  const visible = entries.filter((e) => visibleIds.has(e.id));

  return (
    <>
      {visible.map((entry) => (
        <mesh key={entry.id} position={entry.point} onClick={(e) => handleClick(e, entry)}>
          <sphereGeometry args={[0.006 + entry.mag * 0.0015, 8, 8]} />
          <meshBasicMaterial color={magnitudeColor(entry.mag)} transparent opacity={0.85} />
        </mesh>
      ))}
    </>
  );
}
