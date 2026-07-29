"use client";

import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Line, Stars, useTexture } from "@react-three/drei";
import { Layers } from "lucide-react";
import CanvasShell from "@/components/scenes/CanvasShell";
import AIAssistantChat from "@/components/ai/AIAssistantChat";
import { apiFetch, ApiError } from "@/lib/api";
import type { Simulation } from "@/lib/types";

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

interface EarthLayersProps {
  isCutaway: boolean;
  onSelectLayer: (layer: LayerKey) => void;
  onSelectContinent: (lat: number, lng: number) => void;
}

type PendingAction = { kind: "layer"; layer: LayerKey } | { kind: "continent"; lat: number; lng: number };

// Разрез сделан через прозрачность (тот же проверенный прием, что и
// X-Ray в анатомии): внешние слои "призрачно" просвечивают, обнажая
// более глубокие. Честная геометрическая "крышка" среза (clipping planes
// + stencil-caps) требует отдельного рендер-прохода — за рамки MVP.
function EarthLayers({ isCutaway, onSelectLayer, onSelectContinent }: EarthLayersProps) {
  const groupRef = useRef<THREE.Group>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);
  const crustMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const cloudsMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const mantleMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const outerCoreMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const { colorMap, normalMap, cloudsMap } = useEarthTextures();

  useFrame((_, delta) => {
    if (!isCutaway && groupRef.current) groupRef.current.rotation.y += delta * 0.1;
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
      const v = local.normalize();
      const lat = Math.asin(v.y) * (180 / Math.PI);
      let phi = Math.atan2(v.z, -v.x);
      if (phi < 0) phi += Math.PI * 2;
      const lng = (phi / (Math.PI * 2)) * 360 - 180;
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
    </group>
  );
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
  const mountedAtRef = useRef(Date.now());

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
  }${!selectedLayer && !selectedContinent ? "Ничего пока не выбрано." : ""}`;

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
        >
          <Stars radius={50} depth={30} count={1200} factor={2.5} fade speed={0.4} />
          <EarthLayers isCutaway={isCutaway} onSelectLayer={handleSelectLayer} onSelectContinent={handleSelectContinent} />
        </CanvasShell>

        <AIAssistantChat simulationId={simulation.id} sceneStateDescription={sceneStateDescription} />
      </div>

      <div className="glass-panel mt-4 grid grid-cols-1 gap-4 rounded-2xl p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <button
            onClick={() => setIsCutaway((prev) => !prev)}
            className="neon-glow-cyan flex items-center gap-2 rounded-full bg-neon-cyan px-4 py-2 text-sm font-medium text-surface-deep transition hover:brightness-110"
          >
            <Layers size={18} />
            {isCutaway ? "Скрыть разрез слоев" : "Показать разрез слоев"}
          </button>
        </div>

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
