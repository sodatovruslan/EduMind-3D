"use client";

/**
 * CountryBordersLayer — G5: контуры государственных границ (Natural Earth,
 * public domain). НЕ использует TileEngine/квадротрёх (см.
 * lib/geo/geo-vector-lod.ts за обоснованием) — переключает ЦЕЛЫЙ датасет
 * между "coarse" (110m) и "medium" (50m) по дистанции камеры, как и любая
 * обычная картографическая библиотека.
 *
 * Линии — не закрашенные полигоны (сознательно: нам нужны КОНТУРЫ границ,
 * не заливка стран цветом, полная триангуляция полигонов не нужна и
 * заметно дороже).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { latLngToVector3 } from "@/lib/geo/coordinates";
import { createBorderLoader, type CountryFeatureCollection } from "@/lib/geo/providers/natural-earth";
import { isFacingCamera, pickBorderTier, type BorderTier } from "@/lib/geo/geo-vector-lod";
import { extractRings, lngLatToLatLng, simplifyRing } from "@/lib/geo/vector-geojson";

// Чуть выше поверхности коры/снимка (radius=1..1.021) и НИЖЕ облаков
// (1.015) — та же логика послойности, что у PlateBoundaries/TileDebugLayer.
const BORDER_RADIUS = 1.006;
const TICK_INTERVAL_S = 0.5; // дистанция камеры меняется плавно — высокая частота не нужна
const MAX_RING_POINTS = 300; // см. simplifyRing — детальные береговые линии прореживаются

interface RingEntry {
  key: string;
  points: Array<[number, number, number]>;
  representativeLat: number;
  representativeLng: number;
}

export default function CountryBordersLayer() {
  const loaderRef = useRef(createBorderLoader());
  const [tier, setTier] = useState<BorderTier>("coarse");
  const [data, setData] = useState<CountryFeatureCollection | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const lastTickRef = useRef(0);

  useEffect(() => {
    const loader = loaderRef.current;
    return () => loader.dispose();
  }, []);

  useEffect(() => {
    let cancelled = false;
    loaderRef.current
      .load(tier)
      .then((collection) => {
        if (!cancelled) setData(collection);
      })
      .catch(() => {
        // Сетевая/HTTP-ошибка — границы просто не появятся на этом тике;
        // базовый глобус (G3/G4) остаётся полностью рабочим без них,
        // это дополнительный слой, а не критическая зависимость.
      });
    return () => {
      cancelled = true;
    };
  }, [tier]);

  const rings: RingEntry[] = useMemo(() => {
    if (!data) return [];
    const out: RingEntry[] = [];
    for (const feature of data.features) {
      const featureRings = extractRings(feature.geometry);
      featureRings.forEach((ring, i) => {
        const simplified = simplifyRing(ring, MAX_RING_POINTS);
        const points = simplified.map((coord) => {
          const { lat, lng } = lngLatToLatLng(coord);
          const p = latLngToVector3(lat, lng, BORDER_RADIUS);
          return [p.x, p.y, p.z] as [number, number, number];
        });
        const { lat: repLat, lng: repLng } = lngLatToLatLng(simplified[0]);
        out.push({ key: `${feature.properties.NAME}-${i}`, points, representativeLat: repLat, representativeLng: repLng });
      });
    }
    return out;
  }, [data]);

  useFrame((state) => {
    if (state.clock.elapsedTime - lastTickRef.current < TICK_INTERVAL_S) return;
    lastTickRef.current = state.clock.elapsedTime;

    const camPos = state.camera.position;
    const distance = camPos.length();
    const nextTier = pickBorderTier(distance);
    if (nextTier !== tier) setTier(nextTier);

    const cam: [number, number, number] = [camPos.x, camPos.y, camPos.z];
    const next = new Set<string>();
    for (const ring of rings) {
      if (isFacingCamera(ring.representativeLat, ring.representativeLng, cam)) next.add(ring.key);
    }
    setVisibleKeys(next);
  });

  const visibleRings = rings.filter((r) => visibleKeys.has(r.key));

  return (
    <>
      {visibleRings.map((ring) => (
        <Line key={ring.key} points={ring.points} color="#fbbf24" transparent opacity={0.55} lineWidth={1} />
      ))}
    </>
  );
}
