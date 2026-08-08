"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Line, Stars, useTexture } from "@react-three/drei";
import { Layers } from "lucide-react";
import CanvasShell from "@/components/scenes/CanvasShell";
import GlobeControls from "@/components/geo/GlobeControls";
import RealEarthTileLayer from "@/components/geo/RealEarthTileLayer";
import TileDebugLayer from "@/components/geo/TileDebugLayer";
import type { SelectedTile } from "@/lib/geo/tile-lod";
import type { TileEngineStats } from "@/lib/geo/tile-engine";
import { GIBS_ATTRIBUTION } from "@/lib/geo/providers/gibs-provider";
import { TERRARIUM_ATTRIBUTION } from "@/lib/geo/providers/terrarium-provider";
import { EXAGGERATION_PRESETS, DEFAULT_EXAGGERATION, type ExaggerationPreset } from "@/lib/geo/elevation-sampling";
import AIAssistantChat from "@/components/ai/AIAssistantChat";
import { apiFetch, ApiError } from "@/lib/api";
import type { Simulation } from "@/lib/types";
import { latLngToVector3, vector3ToLatLng } from "@/lib/geo/coordinates";

type LayerKey = "crust" | "mantle" | "outer_core" | "inner_core";

interface LayerInfo {
  layer: string;
  name: string;
  depth_km: string;
  temperature_c: string;
  state: string;
  composition: string;
}

interface ContinentInfo {
  continent: string;
  name: string;
  area_million_km2: number;
  population_millions: number;
  fact: string;
}

// не в масштабе: реальная кора Земли — тонкая пленка (~0.5% радиуса),
// на 3D-разрезе ее пришлось бы искать под микроскопом. Пропорции слоев
// намеренно утрированы для наглядности разреза, порядок слоев — верный.
const INNER_CORE_R = 0.32;
const OUTER_CORE_R = 0.58;
const MANTLE_R = 0.9;
const CRUST_R = 1.0;

// порог аномалии потепления, при котором на бэкенде срабатывает сценарий
// схода селя — держим в синхроне с CLIMATE_THRESHOLD_C в geography_engine.py,
// чтобы визуальное таяние снега совпадало по темпу со срабатыванием сценария
const CLIMATE_THRESHOLD_C = 3.0;
const PAMIR_LAT = 38.5;
const PAMIR_LNG = 72.0;

// реальные спутниковые текстуры (NASA Blue Marble, обработка three.js
// examples, public domain) — сохранены локально в public/textures,
// поэтому сцена не зависит от интернета в момент показа урока
function useEarthTextures() {
  const [colorMap, normalMap, cloudsMap] = useTexture([
    "/textures/earth_diffuse.jpg",
    "/textures/earth_normal.jpg",
    "/textures/earth_clouds.png",
  ]);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  return { colorMap, normalMap, cloudsMap };
}

// стилизованные границы тектонических плит — светящиеся дуги поверх коры.
// Используем drei <Line>, а не сырой JSX-тег <line>: тот конфликтует
// с SVG-элементом "line" из типов React и не проходит проверку типов.
function PlateBoundaries({ radius }: { radius: number }) {
  const boundaries = useMemo(() => {
    const tilts: Array<[number, number]> = [
      [0.3, 0],
      [1.1, 0.6],
      [2.0, -0.4],
      [0.9, 2.3],
    ];
    return tilts.map(([tiltX, tiltZ]) => {
      const points: Array<[number, number, number]> = [];
      const segments = 96;
      for (let i = 0; i <= segments; i++) {
        const t = (i / segments) * Math.PI * 2;
        const p = new THREE.Vector3(Math.cos(t) * radius, 0, Math.sin(t) * radius);
        p.applyEuler(new THREE.Euler(tiltX, 0, tiltZ));
        points.push([p.x, p.y, p.z]);
      }
      return points;
    });
  }, [radius]);

  return (
    <>
      {boundaries.map((points, i) => (
        <Line key={i} points={points} color="#fbbf24" transparent opacity={0.5} lineWidth={1} />
      ))}
    </>
  );
}

// полярная шапка льда — плавно уменьшается по мере роста аномалии
// температуры (0 = нынешний климат, 1 = порог схода селя)
function PolarIceCap({ position, meltProgress }: { position: THREE.Vector3; meltProgress: number }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const targetScale = THREE.MathUtils.lerp(1, 0.35, meltProgress);
    const lerpFactor = Math.min(1, delta * 2);
    mesh.scale.setScalar(THREE.MathUtils.lerp(mesh.scale.x, targetScale, lerpFactor));
  });

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[0.16, 24, 24]} />
      <meshStandardMaterial color="#f0f9ff" roughness={0.5} transparent opacity={0.9} />
    </mesh>
  );
}

interface MountainMarkerProps {
  meltProgress: number;
  isSelTriggered: boolean;
}

const MUD_PARTICLE_COUNT = 14;

// маркер горного массива (Памир) со снежной шапкой и частицами селя —
// снег тает по мере роста meltProgress, сель течет вниз по локальной оси
// маркера (group ориентирован по нормали к поверхности сферы, поэтому
// "вниз по склону" — это просто локальное направление, а не гео-точный
// маршрут потока)
function MountainMarker({ meltProgress, isSelTriggered }: MountainMarkerProps) {
  const position = useMemo(() => latLngToVector3(PAMIR_LAT, PAMIR_LNG, CRUST_R * 1.01), []);
  const quaternion = useMemo(() => {
    const up = position.clone().normalize();
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
  }, [position]);

  const snowMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const mudRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const mudParticles = useMemo(
    () =>
      Array.from({ length: MUD_PARTICLE_COUNT }, () => ({
        t: Math.random(),
        speed: 0.4 + Math.random() * 0.3,
        side: (Math.random() - 0.5) * 0.06,
      })),
    []
  );

  useFrame((_, delta) => {
    if (snowMaterialRef.current) {
      const targetOpacity = 1 - meltProgress;
      snowMaterialRef.current.opacity = THREE.MathUtils.lerp(
        snowMaterialRef.current.opacity,
        targetOpacity,
        Math.min(1, delta * 2)
      );
    }

    const mesh = mudRef.current;
    if (!mesh) return;
    mudParticles.forEach((particle, i) => {
      if (isSelTriggered) {
        particle.t += delta * particle.speed;
        if (particle.t > 1) particle.t = 0;
      }
      const localY = 0.08 - particle.t * 0.5;
      const localZ = particle.t * 0.35;
      const scale = isSelTriggered ? 0.03 * (1 - particle.t * 0.4) : 0.0001;
      dummy.position.set(particle.side, localY, localZ);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group position={position} quaternion={quaternion}>
      <mesh position={[0, 0.05, 0]}>
        <coneGeometry args={[0.05, 0.1, 8]} />
        <meshStandardMaterial color="#78716c" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.09, 0]}>
        <coneGeometry args={[0.025, 0.035, 8]} />
        <meshStandardMaterial ref={snowMaterialRef} color="#f8fafc" roughness={0.3} transparent opacity={1} />
      </mesh>
      <instancedMesh ref={mudRef} args={[undefined, undefined, MUD_PARTICLE_COUNT]}>
        <sphereGeometry args={[1, 6, 6]} />
        <meshStandardMaterial color="#78350f" roughness={0.8} />
      </instancedMesh>
    </group>
  );
}

interface EarthLayersProps {
  isCutaway: boolean;
  onSelectLayer: (layer: LayerKey) => void;
  onSelectContinent: (lat: number, lng: number) => void;
  meltProgress: number;
  isSelTriggered: boolean;
}

type PendingAction = { kind: "layer"; layer: LayerKey } | { kind: "continent"; lat: number; lng: number };

// Разрез сделан через прозрачность (тот же проверенный прием, что и
// X-Ray в анатомии): внешние слои "призрачно" просвечивают, обнажая
// более глубокие. Честная геометрическая "крышка" среза (clipping planes
// + stencil-caps) требует отдельного рендер-прохода — за рамки MVP.
const NORTH_POLE = latLngToVector3(90, 0, CRUST_R * 0.95);
const SOUTH_POLE = latLngToVector3(-90, 0, CRUST_R * 0.95);

function EarthLayers({ isCutaway, onSelectLayer, onSelectContinent, meltProgress, isSelTriggered }: EarthLayersProps) {
  const groupRef = useRef<THREE.Group>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);
  const crustMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const cloudsMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const mantleMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const outerCoreMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const { colorMap, normalMap, cloudsMap } = useEarthTextures();

  useFrame((_, delta) => {
    // Globe group auto-rotation disabled — GlobeControls gives the user
    // direct camera orbit, and spinning the group under the camera makes
    // the surface drift mid-interaction. Clouds still spin independently.
    if (cloudsRef.current) cloudsRef.current.rotation.y += delta * (isCutaway ? 0 : 0.16);

    const lerpFactor = Math.min(1, delta * 2.5);
    const targets = {
      crust: isCutaway ? 0.2 : 1,
      clouds: isCutaway ? 0 : 0.5,
      mantle: isCutaway ? 0.4 : 1,
      outerCore: isCutaway ? 0.65 : 1,
    };
    if (crustMaterialRef.current) {
      crustMaterialRef.current.opacity = THREE.MathUtils.lerp(crustMaterialRef.current.opacity, targets.crust, lerpFactor);
    }
    if (cloudsMaterialRef.current) {
      cloudsMaterialRef.current.opacity = THREE.MathUtils.lerp(cloudsMaterialRef.current.opacity, targets.clouds, lerpFactor);
    }
    if (mantleMaterialRef.current) {
      mantleMaterialRef.current.opacity = THREE.MathUtils.lerp(mantleMaterialRef.current.opacity, targets.mantle, lerpFactor);
    }
    if (outerCoreMaterialRef.current) {
      outerCoreMaterialRef.current.opacity = THREE.MathUtils.lerp(
        outerCoreMaterialRef.current.opacity,
        targets.outerCore,
        lerpFactor
      );
    }
  });

  // Клик по прозрачным вложенным сферам: R3F вызывает onClick всех
  // пересеченных мешей вдоль луча от ближнего к дальнему (кора → мантия →
  // ...→ внутреннее ядро), а stopPropagation в первом же обработчике (коре)
  // блокировал бы клики по всему, что глубже — даже когда кора почти
  // прозрачна. Вместо остановки propagation копим "последнее" (самое
  // глубокое) действие в ref и обрабатываем его один раз в microtask —
  // так один физический клик дает ровно один запрос к API.
  const pendingActionRef = useRef<PendingAction | null>(null);
  const pendingScheduledRef = useRef(false);

  function schedulePending(action: PendingAction) {
    pendingActionRef.current = action;
    if (!pendingScheduledRef.current) {
      pendingScheduledRef.current = true;
      queueMicrotask(() => {
        pendingScheduledRef.current = false;
        const pending = pendingActionRef.current;
        if (!pending) return;
        if (pending.kind === "layer") onSelectLayer(pending.layer);
        else onSelectContinent(pending.lat, pending.lng);
      });
    }
  }

  function handleClick(e: ThreeEvent<MouseEvent>, layer: LayerKey) {
    if (layer !== "crust" && !isCutaway) return; // внутренние слои доступны только в разрезе

    if (layer === "crust" && !isCutaway) {
      // вне разреза клик по поверхности — это исследование континента
      // (не самой коры): переводим точку клика из мировых координат в
      // локальные координаты вращающейся группы, чтобы widget не зависел
      // от текущего угла вращения глобуса
      const local = groupRef.current ? groupRef.current.worldToLocal(e.point.clone()) : e.point.clone();
      const { lat, lng } = vector3ToLatLng(local);
      schedulePending({ kind: "continent", lat, lng });
      return;
    }

    schedulePending({ kind: "layer", layer });
  }

  return (
    <group ref={groupRef}>
      <mesh scale={1.06}>
        <sphereGeometry args={[CRUST_R, 48, 48]} />
        <meshBasicMaterial
          color="#60a5fa"
          transparent
          opacity={0.15}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <mesh castShadow receiveShadow onClick={(e) => handleClick(e, "crust")}>
        <sphereGeometry args={[CRUST_R, 64, 64]} />
        <meshStandardMaterial
          ref={crustMaterialRef}
          map={colorMap}
          normalMap={normalMap}
          normalScale={new THREE.Vector2(0.7, 0.7)}
          roughness={0.8}
          metalness={0}
          transparent
          depthWrite={!isCutaway}
        />
      </mesh>

      <mesh ref={cloudsRef} scale={1.015}>
        <sphereGeometry args={[CRUST_R, 48, 48]} />
        <meshStandardMaterial ref={cloudsMaterialRef} map={cloudsMap} transparent depthWrite={false} />
      </mesh>

      {/* границы плит — поверхностная деталь; в разрезе прячем, чтобы не
          путались с обнажившимися более глубокими слоями */}
      {!isCutaway && <PlateBoundaries radius={CRUST_R * 1.003} />}

      <mesh onClick={(e) => handleClick(e, "mantle")}>
        <sphereGeometry args={[MANTLE_R, 48, 48]} />
        <meshStandardMaterial
          ref={mantleMaterialRef}
          color="#b45309"
          roughness={0.9}
          metalness={0}
          transparent
          depthWrite={!isCutaway}
        />
      </mesh>

      <mesh onClick={(e) => handleClick(e, "outer_core")}>
        <sphereGeometry args={[OUTER_CORE_R, 40, 40]} />
        <meshStandardMaterial
          ref={outerCoreMaterialRef}
          color="#f97316"
          emissive="#f97316"
          emissiveIntensity={0.45}
          roughness={0.4}
          metalness={0}
          transparent
          depthWrite={!isCutaway}
        />
      </mesh>

      <mesh onClick={(e) => handleClick(e, "inner_core")}>
        <sphereGeometry args={[INNER_CORE_R, 32, 32]} />
        <meshStandardMaterial
          color="#fef3c7"
          emissive="#fde68a"
          emissiveIntensity={1.7}
          roughness={0.2}
          metalness={0}
        />
      </mesh>

      <PolarIceCap position={NORTH_POLE} meltProgress={meltProgress} />
      <PolarIceCap position={SOUTH_POLE} meltProgress={meltProgress} />
      <MountainMarker meltProgress={meltProgress} isSelTriggered={isSelTriggered} />
    </group>
  );
}

interface ClimateResult {
  triggered: boolean;
  location: string | null;
  phenomenon: string | null;
  description: string;
}

interface GeoWorldSceneProps {
  simulation: Simulation;
}

export default function GeoWorldScene({ simulation }: GeoWorldSceneProps) {
  const [isCutaway, setIsCutaway] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState<LayerInfo | null>(null);
  const [selectedContinent, setSelectedContinent] = useState<ContinentInfo | null>(null);
  const [isLoadingLayer, setIsLoadingLayer] = useState(false);
  const [actionsLog, setActionsLog] = useState<Record<string, unknown>[]>([]);
  const [completionScore, setCompletionScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [temperatureAnomaly, setTemperatureAnomaly] = useState(0);
  const [climateResult, setClimateResult] = useState<ClimateResult | null>(null);
  const mountedAtRef = useRef(Date.now());
  const wasAboveThresholdRef = useRef(false);

  // G3 — RealEarthTileLayer всегда включён (реальные снимки NASA GIBS — это
  // теперь базовый опыт, не debug-фича). TileDebugLayer (контур+подписи
  // внутренней сетки LOD-движка) остаётся отдельным, выключенным по
  // умолчанию оверлеем — см. GEOWORLD_ROADMAP.md. Оба используют ОДИН и тот
  // же тик движка (frame.rendered/stats приходят из RealEarthTileLayer через
  // onFrame), а не два параллельных движка с двойным сетевым трафиком. Не
  // показываем поверх разреза слоёв — там и так занята прозрачность коры.
  const [showTileDebug, setShowTileDebug] = useState(false);
  const [tileFrame, setTileFrame] = useState<{ rendered: SelectedTile[]; stats: TileEngineStats } | null>(null);
  const handleTileFrame = useCallback((rendered: SelectedTile[], stats: TileEngineStats) => {
    setTileFrame({ rendered, stats });
  }, []);

  // G4 — рельеф. У него СВОЙ движок/кэш/статистика (см. RealEarthTileLayer,
  // ElevationEngineAdapter) — сознательно не смешан с движком снимков.
  // exaggeration=0 полностью отключает рельеф (плоские заплатки, как в G3) —
  // это одновременно и "выключить визуально", и debug-toggle из ТЗ.
  const [exaggeration, setExaggeration] = useState<number>(DEFAULT_EXAGGERATION);
  const [terrainStats, setTerrainStats] = useState<TileEngineStats | null>(null);
  const handleTerrainFrame = useCallback((stats: TileEngineStats) => {
    setTerrainStats(stats);
  }, []);

  async function handleSelectLayer(layer: LayerKey) {
    setError(null);
    setIsLoadingLayer(true);
    try {
      const response = await apiFetch<{ result: LayerInfo }>(`/api/simulations/${simulation.id}/action`, {
        method: "POST",
        body: JSON.stringify({ action_type: "explore_layer", payload: { layer } }),
      });
      setSelectedLayer(response.result);
      setSelectedContinent(null);
      setActionsLog((prev) => [...prev, { action_type: "explore_layer", layer }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось получить информацию о слое");
    } finally {
      setIsLoadingLayer(false);
    }
  }

  async function handleSelectContinent(lat: number, lng: number) {
    setError(null);
    setIsLoadingLayer(true);
    try {
      const response = await apiFetch<{ result: ContinentInfo }>(`/api/simulations/${simulation.id}/action`, {
        method: "POST",
        body: JSON.stringify({ action_type: "explore_continent", payload: { lat, lng } }),
      });
      setSelectedContinent(response.result);
      setSelectedLayer(null);
      setActionsLog((prev) => [...prev, { action_type: "explore_continent", lat, lng }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Здесь океан — попробуй кликнуть по суше");
    } finally {
      setIsLoadingLayer(false);
    }
  }

  async function handleTemperatureChange(value: number) {
    setTemperatureAnomaly(value);
    const isAboveThreshold = value >= CLIMATE_THRESHOLD_C;

    if (!isAboveThreshold) {
      wasAboveThresholdRef.current = false;
      setClimateResult(null); // "перевзводим" сценарий, если температура снова упала
      return;
    }

    if (wasAboveThresholdRef.current) return; // сценарий уже отыгран для текущего превышения порога
    wasAboveThresholdRef.current = true;

    try {
      const response = await apiFetch<{ result: ClimateResult }>(`/api/simulations/${simulation.id}/action`, {
        method: "POST",
        body: JSON.stringify({ action_type: "trigger_climate_scenario", payload: { temperature_anomaly: value } }),
      });
      setClimateResult(response.result);
      setActionsLog((prev) => [...prev, { action_type: "trigger_climate_scenario", temperature_anomaly: value }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось рассчитать климатический сценарий");
    }
  }

  async function handleComplete() {
    setError(null);
    try {
      const result = await apiFetch<{ score: number | null }>(`/api/simulations/${simulation.id}/complete`, {
        method: "POST",
        body: JSON.stringify({
          actions_log: actionsLog,
          duration_seconds: Math.round((Date.now() - mountedAtRef.current) / 1000),
        }),
      });
      setCompletionScore(result.score);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось завершить попытку");
    }
  }

  const sceneStateDescription = `Ученик изучает внутреннее строение Земли. Разрез слоев: ${
    isCutaway ? "включен" : "выключен"
  }. ${selectedLayer ? `Выбранный слой: ${selectedLayer.name}.` : ""}${
    selectedContinent ? `Выбранный континент: ${selectedContinent.name}.` : ""
  }${!selectedLayer && !selectedContinent ? "Ничего пока не выбрано." : ""} Аномалия глобальной температуры: +${temperatureAnomaly}°C.${
    climateResult?.triggered ? ` Произошло природное явление: ${climateResult.phenomenon} в регионе ${climateResult.location}.` : ""
  }`;

  return (
    <div className="rounded-2xl bg-gradient-to-b from-slate-900 via-slate-950 to-black p-3 sm:p-5">
      <div className="relative">
        <CanvasShell
          cameraPosition={[0, 0.6, 3.6]}
          target={[0, 0, 0]}
          showFloor={false}
          backgroundTop="#1b1140"
          backgroundBottom="#020208"
          bloomIntensity={0.7}
          orbitEnabled={false}
        >
          <Stars radius={50} depth={30} count={1200} factor={2.5} fade speed={0.4} />
          <GlobeControls />
          <EarthLayers
            isCutaway={isCutaway}
            onSelectLayer={handleSelectLayer}
            onSelectContinent={handleSelectContinent}
            meltProgress={Math.min(1, temperatureAnomaly / CLIMATE_THRESHOLD_C)}
            isSelTriggered={Boolean(climateResult?.triggered)}
          />
          {/* G3/G4: реальные снимки NASA GIBS + рельеф (AWS Terrain Tiles) на
              ТОМ ЖЕ меше, поверх базовой NASA-текстуры выше (EarthLayers) —
              та остаётся низкодетальным fallback, видимым всегда, поэтому
              пока тайл не готов, дыры быть не может. Не показываем во время
              разреза слоёв — крust и так прозрачна. */}
          {!isCutaway && (
            <RealEarthTileLayer onFrame={handleTileFrame} onTerrainFrame={handleTerrainFrame} exaggeration={exaggeration} />
          )}
          {showTileDebug && !isCutaway && tileFrame && <TileDebugLayer tiles={tileFrame.rendered} />}
        </CanvasShell>

        <AIAssistantChat simulationId={simulation.id} sceneStateDescription={sceneStateDescription} />

        {/* Атрибуция NASA GIBS + AWS Terrain Tiles — постоянно видима, не
            прячется за debug-тоггл (см. GEOWORLD_ROADMAP.md, раздел G3/G4
            "Атрибуция"). */}
        <div
          data-testid="gibs-attribution"
          title={`${GIBS_ATTRIBUTION}\n\n${TERRARIUM_ATTRIBUTION}`}
          className="pointer-events-none absolute bottom-2 right-2 max-w-[70%] truncate rounded bg-surface-deep/70 px-2 py-1 text-[10px] text-slate-400 backdrop-blur"
        >
          Imagery: NASA GIBS / BlueMarble (EOSDIS) · Terrain: AWS Open Data
        </div>

        {showTileDebug && tileFrame && (
          <div
            data-testid="tile-debug-stats"
            className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-glass-border bg-surface-deep/80 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-slate-300 backdrop-blur"
          >
            <div>G3 imagery — provider: NASA GIBS</div>
            <div>Visible: {tileFrame.stats.visibleCount}</div>
            <div>Cached: {tileFrame.stats.loadedCount}</div>
            <div>Active requests: {tileFrame.stats.activeRequestCount}</div>
            <div>Failed: {tileFrame.stats.failedCount}</div>
            <div>Max LOD: {tileFrame.stats.maxActiveLod}</div>
            {terrainStats && (
              <>
                <div className="mt-1 border-t border-glass-border pt-1">G4 terrain — provider: AWS Terrarium</div>
                <div>Terrain visible: {terrainStats.visibleCount}</div>
                <div>Terrain cached: {terrainStats.loadedCount}</div>
                <div>Terrain active: {terrainStats.activeRequestCount}</div>
                <div>Terrain failed: {terrainStats.failedCount}</div>
                <div>Exaggeration: {exaggeration}×</div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="glass-panel mt-4 grid grid-cols-1 gap-4 rounded-2xl p-4 sm:grid-cols-2">
        <div className="sm:col-span-2 flex flex-wrap gap-2">
          <button
            onClick={() => setIsCutaway((prev) => !prev)}
            className="neon-glow-cyan flex items-center gap-2 rounded-full bg-neon-cyan px-4 py-2 text-sm font-medium text-surface-deep transition hover:brightness-110"
          >
            <Layers size={18} />
            {isCutaway ? "Скрыть разрез слоев" : "Показать разрез слоев"}
          </button>

          <button
            onClick={() => setShowTileDebug((prev) => !prev)}
            data-testid="tile-debug-toggle"
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
              showTileDebug
                ? "border-neon-violet/60 bg-neon-violet/20 text-neon-violet"
                : "border-glass-border text-slate-400 hover:text-slate-200"
            }`}
            title="G3: debug-визуализация тайлового/LOD-движка"
          >
            <Layers size={18} />
            {showTileDebug ? "Скрыть Tile/LOD debug" : "Показать Tile/LOD debug"}
          </button>

          <div
            className="flex items-center gap-1 rounded-full border border-glass-border p-1"
            title="G4: визуальная экзагерация рельефа — множитель ПОВЕРХ реальных данных высот, не подменяет их"
            data-testid="terrain-exaggeration-control"
          >
            {(Object.entries(EXAGGERATION_PRESETS) as Array<[ExaggerationPreset, number]>).map(([presetName, value]) => (
              <button
                key={presetName}
                onClick={() => setExaggeration(value)}
                data-testid={`exaggeration-${presetName}`}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  exaggeration === value ? "bg-neon-violet/30 text-neon-violet" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {value}×
              </button>
            ))}
            <button
              onClick={() => setExaggeration(0)}
              data-testid="exaggeration-off"
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                exaggeration === 0 ? "bg-neon-violet/30 text-neon-violet" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Рельеф выкл.
            </button>
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block font-mono text-xs uppercase tracking-widest text-slate-400">
            Глобальное потепление: +{temperatureAnomaly.toFixed(1)}°C
          </label>
          <input
            type="range"
            min={0}
            max={5}
            step={0.5}
            value={temperatureAnomaly}
            onChange={(e) => handleTemperatureChange(Number(e.target.value))}
            className="w-full accent-neon-cyan"
          />
        </div>

        {climateResult && (
          <div
            className={`rim-light rounded-xl border p-3 text-sm sm:col-span-2 ${
              climateResult.triggered
                ? "border-amber-500/40 bg-amber-950/30 text-amber-200"
                : "border-glass-border bg-surface-container-lowest/60 text-slate-300"
            }`}
          >
            {climateResult.triggered && (
              <p className="font-headline font-semibold">
                ⚠ {climateResult.phenomenon} — {climateResult.location}
              </p>
            )}
            <p className={climateResult.triggered ? "text-amber-300/90" : "text-slate-400"}>
              {climateResult.description}
            </p>
          </div>
        )}

        <div className="rim-light rounded-xl border border-glass-border bg-surface-container-lowest/60 p-3 text-sm text-slate-300 sm:col-span-2">
          {isLoadingLayer && <p className="text-slate-400">Загружаем данные...</p>}
          {!isLoadingLayer && selectedContinent && (
            <>
              <p className="font-headline font-semibold text-slate-100">{selectedContinent.name}</p>
              <p className="text-slate-400">
                Площадь: {selectedContinent.area_million_km2} млн км² · Население:{" "}
                {selectedContinent.population_millions} млн чел.
              </p>
              <p className="text-slate-400">{selectedContinent.fact}</p>
            </>
          )}
          {!isLoadingLayer && !selectedContinent && selectedLayer && (
            <>
              <p className="font-headline font-semibold text-slate-100">{selectedLayer.name}</p>
              <p className="text-slate-400">
                Глубина: {selectedLayer.depth_km} км · Температура: {selectedLayer.temperature_c}°C
              </p>
              <p className="text-slate-400">
                Состояние: {selectedLayer.state} · Состав: {selectedLayer.composition}
              </p>
            </>
          )}
          {!isLoadingLayer && !selectedContinent && !selectedLayer && (
            <p className="text-slate-400">
              Кликни по поверхности Земли, чтобы узнать о континенте, а затем включи разрез слоев — так откроется
              доступ к мантии и ядру.
            </p>
          )}
        </div>

        {error && <p className="text-sm text-red-400 sm:col-span-2">{error}</p>}

        <div className="flex items-center gap-3 sm:col-span-2">
          <button
            onClick={handleComplete}
            disabled={actionsLog.length === 0}
            className="rounded-full border border-glass-border px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/5 disabled:opacity-50"
          >
            Завершить попытку
          </button>
          {completionScore !== null && (
            <span className="font-mono text-sm font-medium text-slate-100">Оценка: {completionScore}/100</span>
          )}
        </div>
      </div>
    </div>
  );
}
