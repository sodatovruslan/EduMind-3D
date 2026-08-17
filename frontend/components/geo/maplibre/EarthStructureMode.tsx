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
// Радиусы слоёв (CRUST_R/MANTLE_R/OUTER_CORE_R/INNER_CORE_R) — ТЕ ЖЕ самые
// числа, что уже использует старый R3F-рендерер (GeoWorldScene.tsx) —
// не придуманы заново (§1 — переиспользуем, не изобретаем домен-логику).
// Пропорции визуально утрированы для читаемости (реальная кора Земли —
// доли процента радиуса планеты, здесь она видна) — честно раскрыто
// текстом в UI (§6 — "no false precision", scale honesty).
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { type ThreeEvent } from "@react-three/fiber";
import CanvasShell from "@/components/scenes/CanvasShell";
import GlobeControls from "@/components/geo/GlobeControls";
import { useLocale } from "@/lib/locale-context";
import type { EarthLayerKey, LayerResult } from "@/lib/geo/education/useGeoLessonState";

const CRUST_R = 1.0;
const MANTLE_R = 0.9;
const OUTER_CORE_R = 0.58;
const INNER_CORE_R = 0.32;

const LAYER_COLORS: Record<EarthLayerKey, { color: string; emissive?: string; emissiveIntensity?: number }> = {
  crust: { color: "#60a5fa" },
  mantle: { color: "#b45309" },
  outer_core: { color: "#f97316", emissive: "#f97316", emissiveIntensity: 0.45 },
  inner_core: { color: "#fef3c7", emissive: "#fde68a", emissiveIntensity: 1.7 },
};

const LAYER_RADII: Record<EarthLayerKey, number> = {
  crust: CRUST_R,
  mantle: MANTLE_R,
  outer_core: OUTER_CORE_R,
  inner_core: INNER_CORE_R,
};

const LAYER_ORDER: EarthLayerKey[] = ["crust", "mantle", "outer_core", "inner_core"];

interface LayerSphereProps {
  layer: EarthLayerKey;
  selected: boolean;
  anySelected: boolean;
  onSelect: (layer: EarthLayerKey) => void;
}

function LayerSphere({ layer, selected, anySelected, onSelect }: LayerSphereProps) {
  const { color, emissive, emissiveIntensity } = LAYER_COLORS[layer];
  const opacity = !anySelected ? 0.85 : selected ? 0.95 : 0.18;

  function handleClick(e: ThreeEvent<MouseEvent>) {
    e.stopPropagation();
    onSelect(layer);
  }

  return (
    <mesh onClick={handleClick}>
      <sphereGeometry args={[LAYER_RADII[layer], layer === "inner_core" ? 32 : 48, layer === "inner_core" ? 32 : 48]} />
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        roughness={0.7}
        metalness={0}
        transparent
        opacity={opacity}
        depthWrite={layer === "crust" ? opacity > 0.5 : false}
      />
    </mesh>
  );
}

interface EarthStructureSceneProps {
  selectedLayer: EarthLayerKey | null;
  onSelect: (layer: EarthLayerKey) => void;
}

function EarthStructureScene({ selectedLayer, onSelect }: EarthStructureSceneProps) {
  const groupRef = useRef<THREE.Group>(null);
  const layers = useMemo(() => LAYER_ORDER, []);

  return (
    <group ref={groupRef}>
      {layers.map((layer) => (
        <LayerSphere key={layer} layer={layer} selected={selectedLayer === layer} anySelected={selectedLayer !== null} onSelect={onSelect} />
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

  return (
    <div data-testid="geo-earth-structure-mode">
      <CanvasShell cameraPosition={[0, 0.5, 2.6]} orbitEnabled={false} showFloor={false} bloomIntensity={0.4}>
        <GlobeControls minDistance={1.3} maxDistance={6} />
        <EarthStructureScene selectedLayer={selectedLayerKey} onSelect={onExploreLayer} />
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
