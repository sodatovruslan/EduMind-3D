"use client";

// G6.12 — тектонические плиты / вулканы / землетрясения как НАТИВНЫЕ
// MapLibre source+layer (GeoJSON + встроенная кластеризация вулканов,
// data-driven paint для магнитуды/типа границы), а не тысячи React/DOM-
// компонентов (§30 задания: "React = UI, MapLibre = geographic rendering").
// Датасеты — ТЕ ЖЕ самые, уже лицензионно проверенные провайдеры, что
// использует старый R3F-рендерер (lib/geo/providers/*, см.
// earth-science-sources.ts) — никаких новых источников (§10/§14/§17).
//
// Failure isolation (§32): у каждого слоя СВОЙ try/catch и свой статус —
// падение вулканов не блокирует тектонику/землетрясения и не блокирует
// сам глобус (загрузка стартует только ПОСЛЕ первого кадра карты, лениво,
// при первом включении слоя пользователем — не блокирует cold start).
//
// Toggle = video/none видимость (setLayoutProperty), НЕ add/removeLayer:
// source/layer/click-listener создаются РОВНО ОДИН раз за жизнь карты
// (guard через `map.getSource(...)`) — переключение off→on→off не плодит
// дублирующиеся `map.on("click", ...)` подписчики (реальный баг, найденный
// при проектировании: MapLibre-делегированные листенеры привязаны к
// layerId по строке, не к конкретному instance слоя — remove+re-add с тем
// же id тихо накапливал бы второй, третий... N-ный обработчик клика).
import { useEffect, useRef, useState } from "react";
import { VectorDatasetLoader } from "../vector-dataset-loader";
import {
  createPlateBoundaryLoader,
  createPlatePolygonLoader,
  createEarthquakeWindowLoader,
  buildPlateNameLookup,
  VolcanoProvider,
  volcanoesToFeatureCollection,
  type EarthquakeWindowKey,
  type PlateBoundaryFeatureCollection,
  type PlatePolygonFeatureCollection,
} from "./earth-science-sources";
import type { GeoFeatureInfo } from "../education/featureInfo";
import { INTL_LOCALE_TAG, type Locale } from "../../i18n/locales";
import { buildPlateBoundaryInfo, buildVolcanoInfo, buildEarthquakeInfo } from "./feature-info-builders";

/** Верхняя граница для клавиатурно-доступного списка объектов (§41) — не весь датасет, компактный список. */
const SAMPLE_LIMIT = 15;

export type EarthScienceLayerId = "tectonics" | "volcanoes" | "earthquakes";
export type LayerLoadStatus = "idle" | "loading" | "ready" | "error";

export interface EarthScienceLayerToggles {
  tectonics: boolean;
  volcanoes: boolean;
  earthquakes: boolean;
}

export interface EarthScienceLabels {
  plateBoundarySubduction: string;
  plateBoundaryUnclassified: string;
  volcanoElevation: string;
  volcanoType: string;
  volcanoLastEruption: string;
  volcanoLastEruptionBce: string;
  volcanoDeaths: string;
  earthquakeDepth: string;
  earthquakeDate: string;
}

export interface UseEarthScienceLayersOptions {
  getMap: () => any;
  mapReady: boolean;
  enabled: EarthScienceLayerToggles;
  earthquakeWindow: EarthquakeWindowKey;
  locale: Locale;
  labels: EarthScienceLabels;
  onFeatureSelect: (info: GeoFeatureInfo) => void;
}

export interface SampleFeature {
  key: string;
  label: string;
  onSelect: () => void;
}

export interface EarthScienceLayerDiagnostics {
  status: Record<EarthScienceLayerId, LayerLoadStatus>;
  featureCounts: Record<EarthScienceLayerId, number>;
  errors: Record<EarthScienceLayerId, string | null>;
  /** §41 — клавиатурно-доступная альтернатива клику по глобусу: компактный список объектов (первые SAMPLE_LIMIT). */
  sampleFeatures: Record<EarthScienceLayerId, SampleFeature[]>;
}

const SUBDUCTION_COLOR = "#f97316";
const OTHER_BOUNDARY_COLOR = "#facc15";
const VOLCANO_COLOR = "#ef4444";

function withStyleReady(map: any, fn: () => void) {
  if (map.isStyleLoaded()) {
    fn();
    return;
  }
  // isStyleLoaded() is also false while tiles are still streaming in (for
  // example during a camera flight), long after the one-time "load" event
  // has fired, so waiting for "load" alone could wait forever and the layer
  // never appeared. Sources and layers can be added as soon as the style
  // itself is parsed, so try right away and only wait if the map refuses.
  try {
    fn();
    return;
  } catch {
    // the style really is not ready yet
  }
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    map.off("load", run);
    map.off("idle", run);
    fn();
  };
  map.once("load", run);
  map.once("idle", run);
}

function setLayersVisible(map: any, layerIds: string[], visible: boolean) {
  for (const id of layerIds) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  }
}

export function useEarthScienceLayers(options: UseEarthScienceLayersOptions): EarthScienceLayerDiagnostics {
  const { getMap, mapReady, enabled, earthquakeWindow, locale, labels, onFeatureSelect } = options;

  const [status, setStatus] = useState<Record<EarthScienceLayerId, LayerLoadStatus>>({
    tectonics: "idle",
    volcanoes: "idle",
    earthquakes: "idle",
  });
  const [featureCounts, setFeatureCounts] = useState<Record<EarthScienceLayerId, number>>({
    tectonics: 0,
    volcanoes: 0,
    earthquakes: 0,
  });
  const [errors, setErrors] = useState<Record<EarthScienceLayerId, string | null>>({
    tectonics: null,
    volcanoes: null,
    earthquakes: null,
  });
  const [sampleFeatures, setSampleFeatures] = useState<Record<EarthScienceLayerId, SampleFeature[]>>({
    tectonics: [],
    volcanoes: [],
    earthquakes: [],
  });

  const boundaryLoaderRef = useRef<VectorDatasetLoader<PlateBoundaryFeatureCollection> | null>(null);
  const polygonLoaderRef = useRef<VectorDatasetLoader<PlatePolygonFeatureCollection> | null>(null);
  const plateNamesRef = useRef<Map<string, string>>(new Map());
  const volcanoProviderRef = useRef<VolcanoProvider | null>(null);
  const earthquakeLoaderRef = useRef<VectorDatasetLoader<any> | null>(null);

  const onFeatureSelectRef = useRef(onFeatureSelect);
  const labelsRef = useRef(labels);
  const localeRef = useRef(locale);
  useEffect(() => {
    onFeatureSelectRef.current = onFeatureSelect;
    labelsRef.current = labels;
    localeRef.current = locale;
  });

  useEffect(() => {
    boundaryLoaderRef.current = createPlateBoundaryLoader();
    polygonLoaderRef.current = createPlatePolygonLoader();
    volcanoProviderRef.current = new VolcanoProvider();
    earthquakeLoaderRef.current = createEarthquakeWindowLoader();
    return () => {
      boundaryLoaderRef.current?.dispose();
      polygonLoaderRef.current?.dispose();
      volcanoProviderRef.current?.dispose();
      earthquakeLoaderRef.current?.dispose();
    };
  }, []);

  // Тектоника — создаётся один раз при первом включении, дальше только visibility toggle.
  useEffect(() => {
    if (!mapReady || !enabled.tectonics) return;
    const map = getMap();
    if (!map) return;
    let cancelled = false;
    const alreadyExists = Boolean(map.getSource("geo-tectonics"));

    withStyleReady(map, () => {
      if (cancelled || map.getSource("geo-tectonics")) {
        if (map.getSource("geo-tectonics")) setLayersVisible(map, ["geo-tectonics-line"], true);
        return;
      }

      map.addSource("geo-tectonics", { type: "geojson", data: { type: "FeatureCollection", features: [] }, generateId: true });
      map.addLayer({
        id: "geo-tectonics-line",
        type: "line",
        source: "geo-tectonics",
        layout: { "line-cap": "round" },
        paint: {
          "line-color": ["match", ["get", "Type"], "subduction", SUBDUCTION_COLOR, OTHER_BOUNDARY_COLOR],
          "line-width": ["match", ["get", "Type"], "subduction", 3, 2],
          // Не color-only различие типов границ (§13) — subduction: сплошная
          // толще, прочее: пунктир — читается и на ч/б экране, и дальтониками.
          "line-dasharray": ["match", ["get", "Type"], "subduction", ["literal", [1, 0]], ["literal", [2, 1.5]]],
          "line-opacity": 0.85,
        },
      });

      map.on("mouseenter", "geo-tectonics-line", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "geo-tectonics-line", () => (map.getCanvas().style.cursor = ""));
      map.on("click", "geo-tectonics-line", (e: any) => {
        const feature = e.features?.[0];
        if (!feature) return;
        onFeatureSelectRef.current(buildPlateBoundaryInfo(feature.properties ?? {}, plateNamesRef.current, labelsRef.current));
      });
    });

    if (alreadyExists) return; // данные уже загружены прошлый раз, только видимость включили выше

    setStatus((s) => ({ ...s, tectonics: "loading" }));
    Promise.all([boundaryLoaderRef.current!.load("default"), polygonLoaderRef.current!.load("default")])
      .then(([boundaries, polygons]) => {
        if (cancelled) return;
        plateNamesRef.current = buildPlateNameLookup(polygons);
        const m = getMap();
        // Гонка (реальная, не гипотетическая): если fetch завершился РАНЬШЕ,
        // чем стиль карты (базовые растровые тайлы и т.д.) закончил
        // загрузку, addSource из withStyleReady выше мог ещё не выполниться
        // — getSource() вернул бы undefined, и setData тихо потерялся бы.
        // Тот же withStyleReady здесь гарантирует: либо стиль уже готов
        // (source точно есть, т.к. его слушатель зарегистрирован раньше в
        // этом же эффекте), либо оба колбэка выполнятся по одному и тому же
        // событию "load" в порядке регистрации — source успеет появиться.
        if (m) withStyleReady(m, () => m.getSource("geo-tectonics")?.setData(boundaries));
        setFeatureCounts((c) => ({ ...c, tectonics: boundaries.features.length }));
        setSampleFeatures((s) => ({
          ...s,
          tectonics: boundaries.features.slice(0, SAMPLE_LIMIT).map((f, i) => {
            const info = buildPlateBoundaryInfo(f.properties, plateNamesRef.current, labelsRef.current);
            return { key: `tectonics-${i}`, label: info.title, onSelect: () => onFeatureSelectRef.current(info) };
          }),
        }));
        setStatus((s) => ({ ...s, tectonics: "ready" }));
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus((s) => ({ ...s, tectonics: "error" }));
        setErrors((e) => ({ ...e, tectonics: err instanceof Error ? err.message : String(err) }));
      });

    return () => {
      cancelled = true;
    };
  }, [mapReady, enabled.tectonics, getMap]);

  useEffect(() => {
    if (!mapReady || enabled.tectonics) return;
    const map = getMap();
    if (map?.getSource("geo-tectonics")) setLayersVisible(map, ["geo-tectonics-line"], false);
  }, [mapReady, enabled.tectonics, getMap]);

  // Вулканы
  useEffect(() => {
    if (!mapReady || !enabled.volcanoes) return;
    const map = getMap();
    if (!map) return;
    let cancelled = false;
    const alreadyExists = Boolean(map.getSource("geo-volcanoes"));

    withStyleReady(map, () => {
      const volcanoLayerIds = ["geo-volcanoes-cluster-count", "geo-volcanoes-cluster", "geo-volcanoes-point"];
      if (cancelled || map.getSource("geo-volcanoes")) {
        if (map.getSource("geo-volcanoes")) setLayersVisible(map, volcanoLayerIds, true);
        return;
      }

      map.addSource("geo-volcanoes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        // No clustering: every volcano is its own dot from the first view.
        // Grouped into numbered circles, the chains along the plate
        // boundaries — the whole point of showing volcanoes — were
        // invisible, and "click a volcano" had nothing to click until
        // several zoom-ins later. The cluster layers below stay (they are
        // simply empty) so turning clustering back on is this one flag.
        cluster: false,
      });

      map.addLayer({
        id: "geo-volcanoes-cluster",
        type: "circle",
        source: "geo-volcanoes",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": VOLCANO_COLOR,
          "circle-opacity": 0.55,
          "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 50, 24],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.addLayer({
        id: "geo-volcanoes-cluster-count",
        type: "symbol",
        source: "geo-volcanoes",
        filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 },
        paint: { "text-color": "#ffffff" },
      });
      map.addLayer({
        id: "geo-volcanoes-point",
        type: "circle",
        source: "geo-volcanoes",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": VOLCANO_COLOR,
          // small from afar (hundreds of dots drawing the "ring of fire"),
          // comfortably clickable once zoomed in
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 4, 3, 5.5, 6, 8],
          // a dark rim keeps the dot red; a white one washed small dots out to pink
          "circle-stroke-width": 1,
          "circle-stroke-color": "#450a0a",
          "circle-opacity": 1,
        },
      });

      map.on("mouseenter", "geo-volcanoes-point", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "geo-volcanoes-point", () => (map.getCanvas().style.cursor = ""));
      map.on("mouseenter", "geo-volcanoes-cluster", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "geo-volcanoes-cluster", () => (map.getCanvas().style.cursor = ""));

      map.on("click", "geo-volcanoes-cluster", (e: any) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const clusterId = feature.properties.cluster_id;
        const source = map.getSource("geo-volcanoes") as any;
        source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
          if (err) return;
          map.easeTo({ center: feature.geometry.coordinates, zoom, duration: 800 });
        });
      });

      map.on("click", "geo-volcanoes-point", (e: any) => {
        const feature = e.features?.[0];
        if (!feature) return;
        onFeatureSelectRef.current(buildVolcanoInfo(feature.properties ?? {}, labelsRef.current));
      });
    });

    if (alreadyExists) return;

    setStatus((s) => ({ ...s, volcanoes: "loading" }));
    volcanoProviderRef
      .current!.load()
      .then((records) => {
        if (cancelled) return;
        const collection = volcanoesToFeatureCollection(records);
        const m = getMap();
        if (m) withStyleReady(m, () => m.getSource("geo-volcanoes")?.setData(collection));
        setFeatureCounts((c) => ({ ...c, volcanoes: records.length }));
        setSampleFeatures((s) => ({
          ...s,
          volcanoes: [...records]
            .sort((a, b) => a.name.localeCompare(b.name))
            .slice(0, SAMPLE_LIMIT)
            .map((r, i) => {
              const info = buildVolcanoInfo(r, labelsRef.current);
              return { key: `volcano-${i}`, label: info.title, onSelect: () => onFeatureSelectRef.current(info) };
            }),
        }));
        setStatus((s) => ({ ...s, volcanoes: "ready" }));
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus((s) => ({ ...s, volcanoes: "error" }));
        setErrors((e) => ({ ...e, volcanoes: err instanceof Error ? err.message : String(err) }));
      });

    return () => {
      cancelled = true;
    };
  }, [mapReady, enabled.volcanoes, getMap]);

  useEffect(() => {
    if (!mapReady || enabled.volcanoes) return;
    const map = getMap();
    if (map?.getSource("geo-volcanoes")) {
      setLayersVisible(map, ["geo-volcanoes-cluster-count", "geo-volcanoes-cluster", "geo-volcanoes-point"], false);
    }
  }, [mapReady, enabled.volcanoes, getMap]);

  // Землетрясения
  useEffect(() => {
    if (!mapReady || !enabled.earthquakes) return;
    const map = getMap();
    if (!map) return;
    let cancelled = false;

    withStyleReady(map, () => {
      if (cancelled) return;
      if (!map.getSource("geo-earthquakes")) {
        map.addSource("geo-earthquakes", { type: "geojson", data: { type: "FeatureCollection", features: [] }, generateId: true });
        map.addLayer({
          id: "geo-earthquakes-circle",
          type: "circle",
          source: "geo-earthquakes",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["get", "mag"], 4.5, 4, 6.5, 12, 8, 20],
            "circle-color": ["step", ["get", "mag"], "#fde047", 5.5, "#fb923c", 6.5, "#ef4444"],
            "circle-opacity": 0.8,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#00000055",
          },
        });
        map.on("mouseenter", "geo-earthquakes-circle", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "geo-earthquakes-circle", () => (map.getCanvas().style.cursor = ""));
        map.on("click", "geo-earthquakes-circle", (e: any) => {
          const feature = e.features?.[0];
          if (!feature) return;
          const props = feature.properties ?? {};
          const depth = feature.geometry?.coordinates?.[2];
          onFeatureSelectRef.current(buildEarthquakeInfo(props, depth, INTL_LOCALE_TAG[localeRef.current], labelsRef.current));
        });
      } else {
        setLayersVisible(map, ["geo-earthquakes-circle"], true);
      }
    });

    setStatus((s) => ({ ...s, earthquakes: "loading" }));
    earthquakeLoaderRef
      .current!.load(earthquakeWindow)
      .then((collection: any) => {
        if (cancelled) return;
        const m = getMap();
        if (m) withStyleReady(m, () => m.getSource("geo-earthquakes")?.setData(collection));
        setFeatureCounts((c) => ({ ...c, earthquakes: collection.features.length }));
        setSampleFeatures((s) => ({
          ...s,
          earthquakes: [...collection.features]
            .sort((a: any, b: any) => b.properties.mag - a.properties.mag)
            .slice(0, SAMPLE_LIMIT)
            .map((f: any, i: number) => {
              const info = buildEarthquakeInfo(f.properties, f.geometry?.coordinates?.[2], INTL_LOCALE_TAG[localeRef.current], labelsRef.current);
              return { key: `earthquake-${i}`, label: `${info.title} — ${info.subtitle}`, onSelect: () => onFeatureSelectRef.current(info) };
            }),
        }));
        setStatus((s) => ({ ...s, earthquakes: "ready" }));
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus((s) => ({ ...s, earthquakes: "error" }));
        setErrors((e) => ({ ...e, earthquakes: err instanceof Error ? err.message : String(err) }));
      });

    return () => {
      cancelled = true;
    };
    // Смена окна времени (day/week/month) переиспользует ТОТ ЖЕ source/layer
    // (только новый setData) — намеренно перезапрашивает каждый раз при
    // включённом слое, т.к. окно реально другое (не дублирующийся toggle).
  }, [mapReady, enabled.earthquakes, earthquakeWindow, getMap]);

  useEffect(() => {
    if (!mapReady || enabled.earthquakes) return;
    const map = getMap();
    if (map?.getSource("geo-earthquakes")) setLayersVisible(map, ["geo-earthquakes-circle"], false);
  }, [mapReady, enabled.earthquakes, getMap]);

  return { status, featureCounts, errors, sampleFeatures };
}
