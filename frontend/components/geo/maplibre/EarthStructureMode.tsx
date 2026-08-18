"use client";

// G6.12 §2-8 — "Строение Земли" как отдельный, полностью интерактивный
// режим (не 4 текстовые карточки, §2). Технически — отдельный R3F Canvas
// (Three.js), НЕ попытка заставить MapLibre физически "разрезать" глобус
// (§3 — по прямому указанию задания). MapLibreGlobeCanvas в это время
// ПОЛНОСТЬЮ размонтирован родителем (см. GeoWorldSceneMapLibre.tsx) — два
// тяжёлых WebGL-контекста никогда не существуют одновременно (§45:
// "properly suspend/unmount... GPU cleanup mandatory"), очистка GPU-
// ресурсов MapLibre происходит через `map.remove()` в cleanup
// useMapLibreGlobe при размонтировании.
//
// G6.12 QA FIX round 1 (владелец продукта проверил в браузере — REJECTED,
// "Earth Structure visualization is not actually visible"): первая версия
// рисовала 4 ПОЛНЫЕ вложенные сферы, различая слои ТОЛЬКО через opacity —
// crust (opacity 0.85, почти непрозрачная, ПОЛНАЯ сфера без единого
// выреза) визуально полностью скрывала все внутренние слои независимо от
// выбора (root cause). Настоящий cutaway ("часть внешней сферы визуально
// вырезана") здесь построен через Three.js clipping planes — рендерер уже
// собирает `renderer.localClippingEnabled = true` в CanvasShell.tsx (ради
// Electricity Lab), это переиспользовано, не изобретено заново. Плоскость
// среза вырезает половину каждой сферы (crust/mantle/outer_core) со
// стороны камеры — материал `THREE.DoubleSide`, поэтому видна ВНУТРЕННЯЯ
// стенка среза каждого оставшегося полушария. inner_core остаётся целой
// сферой (внутри неё уже нечего скрывать).
//
// G6.12 QA FIX round 2 (те же скриншоты показали ДВЕ новые проблемы):
// (а) камера смотрела строго вдоль оси среза — результат читался как
// плоская мишень из концентрических кругов, а не как 3D-сфера с вырезом
// (нет видимой кривизны внешнего края); (б) все 4 подписи лежали на одном
// луче — у соседних слоёв (crust R=1.0, mantle R=0.9) радиусы отличались
// меньше, чем добавочный отступ подписи, они налезали друг на друга на
// экране. Оба исправления вынесены в lib/geo/education/earthStructureGeometry.ts
// (CAMERA_POSITION — 3/4-ракурс с явным изгибом внешнего края; LABEL_DIRECTIONS —
// свой веерный луч на каждый слой, гарантированно разносит подписи по
// экрану независимо от близости радиусов).
//
// Радиусы слоёв (CRUST_R/MANTLE_R/OUTER_CORE_R/INNER_CORE_R) — ТЕ ЖЕ самые
// числа, что уже использует старый R3F-рендерер (GeoWorldScene.tsx) —
// не придуманы заново (§1 — переиспользуем, не изобретаем домен-логику).
// Пропорции визуально утрированы для читаемости (реальная кора Земли —
// доли процента радиуса планеты, здесь она видна) — честно раскрыто
// текстом в UI (§6 — "no false precision", scale honesty).
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Html, Line } from "@react-three/drei";
import { type ThreeEvent } from "@react-three/fiber";
import CanvasShell from "@/components/scenes/CanvasShell";
import GlobeControls from "@/components/geo/GlobeControls";
import { useLocale } from "@/lib/locale-context";
import type { EarthLayerKey, LayerResult } from "@/lib/geo/education/useGeoLessonState";
import {
  LAYER_ORDER,
  LAYER_RADII,
  CUT_LAYERS,
  CUT_PLANE,
  LABEL_DIRECTIONS,
  LABEL_EXTRA_OFFSET,
  computeLayerOpacity,
  computeCameraPosition,
  isClickOnVisibleSurface,
} from "@/lib/geo/education/earthStructureGeometry";

// G6.12 QA FIX round 3 — камера, откалиброванная под широкий desktop-канвас
// (§CAMERA_DIRECTION в earthStructureGeometry.ts), обрезала крест на узком
// портретном мобильном канвасе (390×844: подтверждено скриншотом —
// внешняя оболочка/подписи уходили за край). Реальный aspect ratio канваса
// известен только в браузере (CanvasShell использует `w-full h-[75vh]`
// относительно viewport) — измеряется через `useLayoutEffect` (синхронно
// ДО первой отрисовки, без видимого мигания неверного кадра), тем же
// приёмом, что уже используют другие geo-хуки для browser-only API
// (см. useMapLibreGlobe.ts — window/document только внутри эффектов, не
// в теле рендера, иначе SSR-краш). Смена `cameraKey` форсирует чистый
// remount Canvas с ПРАВИЛЬНОЙ начальной позицией камеры — GlobeControls
// читает `camera.position` только один раз при своём монтировании, менять
// проп `cameraPosition` постфактум не переместило бы уже созданную камеру.

const LAYER_COLORS: Record<EarthLayerKey, { color: string; emissive?: string; emissiveIntensity?: number }> = {
  crust: { color: "#60a5fa" },
  mantle: { color: "#b45309" },
  outer_core: { color: "#f97316", emissive: "#f97316", emissiveIntensity: 0.35 },
  inner_core: { color: "#fef3c7", emissive: "#fde68a", emissiveIntensity: 1.3 },
};

interface LayerSphereProps {
  layer: EarthLayerKey;
  selected: boolean;
  anySelected: boolean;
  onSelect: (layer: EarthLayerKey) => void;
}

function LayerSphere({ layer, selected, anySelected, onSelect }: LayerSphereProps) {
  const { color, emissive, emissiveIntensity } = LAYER_COLORS[layer];
  const isCut = CUT_LAYERS.has(layer);
  const opacity = computeLayerOpacity(anySelected, selected);

  function handleClick(e: ThreeEvent<MouseEvent>) {
    // Three.js raycasting НЕ учитывает clippingPlanes — луч физически
    // попадает и в отрезанную (невидимую) половину геометрии. Без этой
    // проверки клик по видимой пустоте перед моделью (там, где отрезанная
    // половина ближней стороны геометрически есть, но не рендерится) тихо
    // выбирал бы неверный слой. Проверяем, что точка попадания реально
    // лежит на ВИДИМОЙ стороне плоскости среза — если нет, пропускаем
    // (НЕ stopPropagation), давая клику дойти до следующего, более
    // глубокого меша вдоль луча, который может оказаться настоящей
    // видимой поверхностью.
    if (!isClickOnVisibleSurface(layer, e.point)) return;
    e.stopPropagation();
    onSelect(layer);
  }

  return (
    <mesh onClick={handleClick}>
      <sphereGeometry args={[LAYER_RADII[layer], layer === "inner_core" ? 32 : 56, layer === "inner_core" ? 32 : 56]} />
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        roughness={0.65}
        metalness={0.05}
        side={THREE.DoubleSide}
        clippingPlanes={isCut ? [CUT_PLANE] : undefined}
        transparent={opacity < 1}
        opacity={opacity}
        depthWrite={opacity >= 1}
      />
    </mesh>
  );
}

interface LayerLabelProps {
  layer: EarthLayerKey;
  label: string;
  exploredBadge: string | null;
  selected: boolean;
  onSelect: (layer: EarthLayerKey) => void;
}

// Компактная подпись с leader line — у КАЖДОГО слоя свой веерный луч
// (LABEL_DIRECTIONS), не общий для всех — реальный баг, найденный по
// скриншоту: один общий луч давал подписям соседних слоёв (радиусы 1.0 и
// 0.9 отличаются меньше добавочного отступа) визуально слипаться на
// экране. Свой луч на каждый слой гарантированно разносит подписи (§"не
// размещать текст поверх друг друга").
function LayerLabel({ layer, label, exploredBadge, selected, onSelect }: LayerLabelProps) {
  const dir = LABEL_DIRECTIONS[layer];
  const anchor = useMemo(() => dir.clone().multiplyScalar(LAYER_RADII[layer]), [dir, layer]);
  const outer = useMemo(() => dir.clone().multiplyScalar(LAYER_RADII[layer] + LABEL_EXTRA_OFFSET), [dir, layer]);

  return (
    <group>
      <Line points={[anchor.toArray(), outer.toArray()]} color={selected ? "#f9a8d4" : "#94a3b8"} lineWidth={1} transparent opacity={0.8} />
      <Html position={outer.toArray()} center distanceFactor={4} pointerEvents="auto" occlude={false}>
        <button
          type="button"
          onClick={() => onSelect(layer)}
          className={`ds-focus-ring whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium backdrop-blur transition-colors ${
            selected ? "border-accent-geo/70 bg-accent-geo/30 text-white" : "border-white/20 bg-black/50 text-white/85 hover:bg-black/70"
          }`}
        >
          {label}
          {exploredBadge && <span className="ml-1 opacity-70">({exploredBadge})</span>}
        </button>
      </Html>
    </group>
  );
}

interface EarthStructureSceneProps {
  selectedLayer: EarthLayerKey | null;
  onSelect: (layer: EarthLayerKey) => void;
  layerLabels: Record<EarthLayerKey, string>;
  exploredLayers: Set<EarthLayerKey>;
  exploredBadgeText: string;
}

function EarthStructureScene({ selectedLayer, onSelect, layerLabels, exploredLayers, exploredBadgeText }: EarthStructureSceneProps) {
  const groupRef = useRef<THREE.Group>(null);

  return (
    <group ref={groupRef}>
      {LAYER_ORDER.map((layer) => (
        <LayerSphere key={layer} layer={layer} selected={selectedLayer === layer} anySelected={selectedLayer !== null} onSelect={onSelect} />
      ))}
      {LAYER_ORDER.map((layer) => (
        <LayerLabel
          key={layer}
          layer={layer}
          label={layerLabels[layer]}
          exploredBadge={exploredLayers.has(layer) ? exploredBadgeText : null}
          selected={selectedLayer === layer}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}

export interface EarthStructureModeProps {
  exploredLayers: Set<EarthLayerKey>;
  selectedLayerKey: EarthLayerKey | null;
  selectedLayer: LayerResult | null;
  isSubmitting: boolean;
  onExploreLayer: (layer: EarthLayerKey) => void;
  onReturnToSurface: () => void;
}

export default function EarthStructureMode({
  exploredLayers,
  selectedLayerKey,
  selectedLayer,
  isSubmitting,
  onExploreLayer,
  onReturnToSurface,
}: EarthStructureModeProps) {
  const { t } = useLocale();
  const es = t.geo.maplibre.earthScience.earthStructure;
  const layerLabels: Record<EarthLayerKey, string> = {
    crust: t.geo.maplibre.lesson.layerCrust,
    mantle: t.geo.maplibre.lesson.layerMantle,
    outer_core: t.geo.maplibre.lesson.layerOuterCore,
    inner_core: t.geo.maplibre.lesson.layerInnerCore,
  };

  const containerRef = useRef<HTMLDivElement>(null);
  // Десктопный aspect (1.6) — безопасный SSR-совместимый дефолт для самого
  // первого кадра (window ещё недоступен на сервере); реальный aspect
  // измеряется ниже и, если отличается, форсирует remount с верной камерой.
  const [cameraPosition, setCameraPosition] = useState<[number, number, number]>(() => computeCameraPosition(1.6));
  const [cameraKey, setCameraKey] = useState("initial");

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const width = el.clientWidth || window.innerWidth;
    // CanvasShell: h-[75vh], min-h-[28rem] (448px), max-h-[48rem] (768px).
    const height = Math.min(768, Math.max(448, window.innerHeight * 0.75));
    const aspect = width / height;
    setCameraPosition(computeCameraPosition(aspect));
    setCameraKey(`${Math.round(width)}x${Math.round(height)}`);
  }, []);

  return (
    <div data-testid="geo-earth-structure-mode" ref={containerRef}>
      <CanvasShell key={cameraKey} cameraPosition={cameraPosition} orbitEnabled={false} showFloor={false} bloomIntensity={0.4}>
        {/* maxDistance с запасом над computeCameraDistance() для очень узких портретных aspect ratio (см. earthStructureGeometry.test.ts) — иначе GlobeControls обрезал бы вычисленную дистанцию и модель снова не помещалась бы в кадр на самых узких экранах. */}
        <GlobeControls minDistance={1.3} maxDistance={8} />
        <EarthStructureScene
          selectedLayer={selectedLayerKey}
          onSelect={onExploreLayer}
          layerLabels={layerLabels}
          exploredLayers={exploredLayers}
          exploredBadgeText={t.geo.maplibre.lesson.exploredBadge}
        />
      </CanvasShell>

      <div className="ds-glass mt-4 rounded-ds-panel p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-ds-body text-text-secondary">{es.objective}</p>
          <button
            type="button"
            onClick={onReturnToSurface}
            className="ds-focus-ring shrink-0 rounded-full border border-border/[0.12] px-3 py-1.5 text-ds-caption font-medium text-text-primary transition-colors hover:bg-text-primary/5"
            data-testid="geo-earth-structure-return"
          >
            {es.returnToSurface}
          </button>
        </div>

        <p className="mt-2 text-ds-caption text-warning/90">{es.scaleDisclosure}</p>

        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={es.objective}>
          {LAYER_ORDER.map((layer) => {
            const explored = exploredLayers.has(layer);
            return (
              <button
                key={layer}
                type="button"
                onClick={() => onExploreLayer(layer)}
                disabled={isSubmitting}
                aria-pressed={selectedLayerKey === layer}
                className={`ds-focus-ring rounded-full border px-4 py-2 text-ds-body font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  selectedLayerKey === layer
                    ? "border-accent-geo/60 bg-accent-geo/20 text-accent-geo"
                    : "border-border/[0.12] text-text-secondary hover:text-text-primary"
                }`}
              >
                {layerLabels[layer]}
                {explored && <span className="ml-1.5 text-ds-caption">({t.geo.maplibre.lesson.exploredBadge})</span>}
              </button>
            );
          })}
        </div>

        <div className="mt-3 rounded-ds-panel border border-border/[0.1] bg-surface-elevated p-3 text-ds-body text-text-secondary">
          {!selectedLayer && <p className="text-text-muted">{es.selectPrompt}</p>}
          {selectedLayer && (
            <>
              <p className="font-semibold text-text-primary">{selectedLayer.name}</p>
              <p className="text-text-muted">
                {t.geo.hud.depthTemperatureLabel.replace("{depth}", selectedLayer.depth_km).replace("{temp}", selectedLayer.temperature_c)}
              </p>
              <p className="text-text-muted">
                {t.geo.hud.stateCompositionLabel
                  .replace("{state}", selectedLayer.state)
                  .replace("{composition}", selectedLayer.composition)}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
