"use client";

/**
 * CityLabelsLayer — G5: подписи городов (Natural Earth populated places),
 * появляющиеся прогрессивно при приближении камеры — больше городов
 * (по SCALERANK) видно ближе к поверхности. Та же архитектура датасета-по-
 * тиру, что CountryBordersLayer, не TileEngine (см. geo-vector-lod.ts).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { latLngToVector3 } from "@/lib/geo/coordinates";
import { createCityLoader, type CityFeatureCollection } from "@/lib/geo/providers/natural-earth";
import { isFacingCamera, maxVisibleScaleRank, pickBorderTier, type BorderTier } from "@/lib/geo/geo-vector-lod";
import { lngLatToLatLng } from "@/lib/geo/vector-geojson";

const LABEL_RADIUS = 1.01;
const TICK_INTERVAL_S = 0.5;
// Жёсткий потолок числа одновременно отрисованных подписей — независимо от
// фильтров по SCALERANK/видимости, страховка от неожиданного всплеска (см.
// ТЗ G4/G5 "bounded" — тот же принцип, что лимит конкурентных запросов).
const MAX_VISIBLE_LABELS = 150;

interface CityEntry {
  key: string;
  name: string;
  lat: number;
  lng: number;
  scaleRank: number;
}

export default function CityLabelsLayer() {
  const loaderRef = useRef(createCityLoader());
  const [tier, setTier] = useState<BorderTier>("coarse");
  const [data, setData] = useState<CityFeatureCollection | null>(null);
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
        // Как и границы — подписи городов необязательны для работоспособности сцены.
      });
    return () => {
      cancelled = true;
    };
  }, [tier]);

  const cities: CityEntry[] = useMemo(() => {
    if (!data) return [];
    return data.features.map((feature, i) => {
      const { lat, lng } = lngLatToLatLng(feature.geometry.coordinates);
      return {
        key: `${feature.properties.NAME}-${i}`,
        name: feature.properties.NAME_RU || feature.properties.NAME,
        lat,
        lng,
        scaleRank: feature.properties.SCALERANK,
      };
    });
  }, [data]);

  useFrame((state) => {
    if (state.clock.elapsedTime - lastTickRef.current < TICK_INTERVAL_S) return;
    lastTickRef.current = state.clock.elapsedTime;

    const camPos = state.camera.position;
    const distance = camPos.length();
    const nextTier = pickBorderTier(distance);
    if (nextTier !== tier) setTier(nextTier);

    const cam: [number, number, number] = [camPos.x, camPos.y, camPos.z];
    const maxRank = maxVisibleScaleRank(distance);
    const next = new Set<string>();
    let count = 0;
    for (const city of cities) {
      if (count >= MAX_VISIBLE_LABELS) break;
      if (city.scaleRank > maxRank) continue;
      if (!isFacingCamera(city.lat, city.lng, cam)) continue;
      next.add(city.key);
      count++;
    }
    setVisibleKeys(next);
  });

  const visibleCities = cities.filter((c) => visibleKeys.has(c.key));

  return (
    <>
      {visibleCities.map((city) => {
        const p = latLngToVector3(city.lat, city.lng, LABEL_RADIUS);
        return (
          <Text
            key={city.key}
            position={[p.x, p.y, p.z]}
            fontSize={0.018}
            color="#e2e8f0"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.0015}
            outlineColor="#000000"
          >
            {city.name}
          </Text>
        );
      })}
    </>
  );
}
