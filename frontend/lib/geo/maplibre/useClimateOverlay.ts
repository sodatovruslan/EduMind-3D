"use client";

// G6.12 §23-27 — реальная визуализация климатического сценария НА КАРТЕ
// (не только в боковой карточке, §25), поверх УЖЕ существующего backend-
// контракта (`trigger_climate_scenario` → geography_engine.evaluate_climate_scenario,
// см. useGeoLessonState.triggerClimateScenario — не переизобретаем climate
// engine, только визуализируем его результат). Единственный смоделированный
// сценарий в системе — сход селя в Памире при аномалии >= CLIMATE_THRESHOLD_C
// (те же координаты/порог, что GeoWorldScene.tsx §26: "port old warming
// slider semantics" — те же 38.5/72.0/3.0, не выдуманы заново).
import { useEffect, useRef } from "react";

export const PAMIR_LAT = 38.5;
export const PAMIR_LNG = 72.0;
export const CLIMATE_THRESHOLD_C = 3.0;

export interface UseClimateOverlayOptions {
  getMap: () => any;
  mapReady: boolean;
  enabled: boolean;
  temperatureAnomaly: number;
  triggered: boolean;
}

function withStyleReady(map: any, fn: () => void) {
  if (map.isStyleLoaded()) {
    fn();
    return;
  }
  map.once("load", fn);
}

/** 0 (стабильно) → 1 (порог достигнут): от голубого (снег) к красному (сель). Экспортирована для теста — чистая функция, не привязана к React/MapLibre. */
export function anomalyColor(progress: number): string {
  if (progress >= 1) return "#ef4444";
  if (progress >= 0.66) return "#fb923c";
  if (progress >= 0.33) return "#facc15";
  return "#38bdf8";
}

export function useClimateOverlay(options: UseClimateOverlayOptions): void {
  const { getMap, mapReady, enabled, temperatureAnomaly, triggered } = options;
  const createdRef = useRef(false);

  useEffect(() => {
    if (!mapReady) return;
    const map = getMap();
    if (!map) return;

    withStyleReady(map, () => {
      if (map.getSource("geo-climate-pamir")) return;
      map.addSource("geo-climate-pamir", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [PAMIR_LNG, PAMIR_LAT] } },
      });
      map.addLayer({
        id: "geo-climate-pamir-halo",
        type: "circle",
        source: "geo-climate-pamir",
        layout: { visibility: "none" },
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 14, 8, 60],
          "circle-color": "#38bdf8",
          "circle-opacity": 0.35,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
      createdRef.current = true;
    });
  }, [mapReady, getMap]);

  useEffect(() => {
    if (!mapReady || !createdRef.current) return;
    const map = getMap();
    if (!map || !map.getLayer("geo-climate-pamir-halo")) return;
    map.setLayoutProperty("geo-climate-pamir-halo", "visibility", enabled ? "visible" : "none");
    if (!enabled) return;
    const progress = Math.min(1, temperatureAnomaly / CLIMATE_THRESHOLD_C);
    map.setPaintProperty("geo-climate-pamir-halo", "circle-color", anomalyColor(progress));
    map.setPaintProperty("geo-climate-pamir-halo", "circle-opacity", triggered ? 0.55 : 0.25 + progress * 0.2);
  }, [mapReady, enabled, temperatureAnomaly, triggered, getMap]);
}
