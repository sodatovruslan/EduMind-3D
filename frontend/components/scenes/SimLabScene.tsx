"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import CanvasShell from "@/components/scenes/CanvasShell";
import AIAssistantChat from "@/components/ai/AIAssistantChat";
import { apiFetch, ApiError } from "@/lib/api";
import { celsiusToKelvin, idealGasPressure, newtonCoolingTemperature } from "@/lib/simlab-formulas";
import type { Simulation } from "@/lib/types";

const REAGENTS = [
  { value: "vinegar", label: "Уксус (CH₃COOH)" },
  { value: "baking_soda", label: "Сода (NaHCO₃)" },
  { value: "hcl", label: "Соляная кислота (HCl)" },
  { value: "naoh", label: "Гидроксид натрия (NaOH)" },
  { value: "copper_sulfate", label: "Сульфат меди (CuSO₄)" },
  { value: "iron", label: "Железо (Fe)" },
  { value: "phenolphthalein", label: "Фенолфталеин" },
  { value: "silver_nitrate", label: "Нитрат серебра (AgNO₃)" },
  { value: "sodium_chloride", label: "Хлорид натрия (NaCl)" },
] as const;

interface ReactionResult {
  product_name: string;
  result_color: string;
  gas_released: boolean;
  is_exothermic: boolean;
  delta_temperature_c: number;
  precipitate_formed: boolean;
  precipitate_color: string | null;
}

interface GasParticleState {
  t: number;
  x: number;
  z: number;
  speed: number;
}

interface PrecipitateParticleState {
  t: number;
  x: number;
  z: number;
  restY: number;
}

const GAS_PARTICLE_COUNT = 24;
const PRECIPITATE_PARTICLE_COUNT = 18;
const FLASK_RADIUS = 0.9;
const LIQUID_SURFACE_Y = 0.3;

function randomInFlask(radius: number) {
  const angle = Math.random() * Math.PI * 2;
  const r = Math.random() * radius * 0.7;
  return { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
}

// частицы газа: пузырьки поднимаются от поверхности жидкости, растут и лопаются
function GasParticles({ active, timeScale }: { active: boolean; timeScale: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const particles = useMemo<GasParticleState[]>(
    () =>
      Array.from({ length: GAS_PARTICLE_COUNT }, () => {
        const { x, z } = randomInFlask(FLASK_RADIUS);
        return { t: Math.random(), x, z, speed: 0.4 + Math.random() * 0.5 };
      }),
    []
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    particles.forEach((particle, i) => {
      if (active) {
        particle.t += delta * particle.speed * timeScale;
        if (particle.t > 1) {
          const { x, z } = randomInFlask(FLASK_RADIUS);
          particle.t = 0;
          particle.x = x;
          particle.z = z;
        }
      }

      const y = LIQUID_SURFACE_Y + particle.t * 1.6;
      const scale = active ? Math.sin(particle.t * Math.PI) * 0.06 + 0.01 : 0.0001;

      dummy.position.set(particle.x, y, particle.z);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, GAS_PARTICLE_COUNT]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshStandardMaterial color="#dbeafe" transparent opacity={0.7} />
    </instancedMesh>
  );
}

// частицы осадка: оседают на дно колбы и остаются там
function PrecipitateParticles({ active, color, timeScale }: { active: boolean; color: string; timeScale: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const particles = useMemo<PrecipitateParticleState[]>(
    () =>
      Array.from({ length: PRECIPITATE_PARTICLE_COUNT }, () => {
        const { x, z } = randomInFlask(FLASK_RADIUS);
        return { t: 0, x, z, restY: -0.35 + Math.random() * 0.06 };
      }),
    []
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colorObj = useMemo(() => new THREE.Color(color), [color]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    particles.forEach((particle, i) => {
      if (active && particle.t < 1) {
        particle.t = Math.min(1, particle.t + delta * 0.6 * timeScale);
      }
      const startY = LIQUID_SURFACE_Y * 0.5;
      const y = active ? startY + (particle.restY - startY) * particle.t : startY;
      const scale = active ? 0.05 : 0.0001;

      dummy.position.set(particle.x, y, particle.z);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, colorObj);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, PRECIPITATE_PARTICLE_COUNT]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshStandardMaterial vertexColors />
    </instancedMesh>
  );
}

// жидкость плавно перетекает в новый цвет реакции, а не переключается мгновенно
function Liquid({ targetColor }: { targetColor: string }) {
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const target = useMemo(() => new THREE.Color(targetColor), [targetColor]);

  useFrame((_, delta) => {
    const material = materialRef.current;
    if (!material) return;
    material.color.lerp(target, Math.min(1, delta * 2));
  });

  return (
    <mesh position={[0, LIQUID_SURFACE_Y * 0.5, 0]}>
      <cylinderGeometry args={[FLASK_RADIUS * 0.85, FLASK_RADIUS * 0.6, LIQUID_SURFACE_Y + 0.35, 32]} />
      <meshStandardMaterial ref={materialRef} color={targetColor} />
    </mesh>
  );
}

function Flask() {
  return (
    <mesh position={[0, 0.4, 0]}>
      <cylinderGeometry args={[FLASK_RADIUS * 0.55, FLASK_RADIUS, 2, 32, 1, true]} />
      <meshPhysicalMaterial
        color="#ffffff"
        transparent
        opacity={0.18}
        roughness={0.05}
        transmission={0.9}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

interface SimLabSceneProps {
  simulation: Simulation;
}

export default function SimLabScene({ simulation }: SimLabSceneProps) {
  const [reagentA, setReagentA] = useState<string>(REAGENTS[0].value);
  const [reagentB, setReagentB] = useState<string>(REAGENTS[1].value);
  const [reaction, setReaction] = useState<ReactionResult | null>(null);
  const [isMixing, setIsMixing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionsLog, setActionsLog] = useState<Record<string, unknown>[]>([]);
  const [completionScore, setCompletionScore] = useState<number | null>(null);

  const [ambientTempC, setAmbientTempC] = useState(25);
  const [volumeL, setVolumeL] = useState(10);
  const [timeScale, setTimeScale] = useState(1);
  const [displayedTempC, setDisplayedTempC] = useState(25);
  const [reactionStartedAt, setReactionStartedAt] = useState<number | null>(null);

  const mountedAtRef = useRef(Date.now());

  // пока не было реакции — показанная температура просто следует за слайдером
  useEffect(() => {
    if (reactionStartedAt === null) setDisplayedTempC(ambientTempC);
  }, [ambientTempC, reactionStartedAt]);

  // после реакции температура остывает/нагревается к ambientTempC по закону Ньютона
  useEffect(() => {
    if (reactionStartedAt === null || !reaction) return;
    let rafId: number;
    const initialTempC = ambientTempC + reaction.delta_temperature_c;

    const tick = () => {
      const elapsedSeconds = ((performance.now() - reactionStartedAt) / 1000) * timeScale;
      setDisplayedTempC(newtonCoolingTemperature(initialTempC, ambientTempC, elapsedSeconds));
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [reactionStartedAt, reaction, ambientTempC, timeScale]);

  const pressureAtm = idealGasPressure(1, volumeL, celsiusToKelvin(displayedTempC));

  async function handleMix() {
    setError(null);
    setIsMixing(true);
    try {
      const response = await apiFetch<{ action_type: string; result: ReactionResult }>(
        `/api/simulations/${simulation.id}/action`,
        {
          method: "POST",
          body: JSON.stringify({
            action_type: "mix_reagents",
            payload: { reagent_a: reagentA, reagent_b: reagentB },
          }),
        }
      );
      setReaction(response.result);
      setReactionStartedAt(performance.now());
      setActionsLog((prev) => [...prev, { action_type: "mix_reagents", reagent_a: reagentA, reagent_b: reagentB }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось выполнить реакцию");
    } finally {
      setIsMixing(false);
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

  const liquidColor = reaction?.result_color ?? "#BFE3F2";
  const sceneStateDescription = reaction
    ? `Ученик смешал ${reagentA} и ${reagentB}. Результат: ${reaction.product_name}, газ: ${
        reaction.gas_released ? "да" : "нет"
      }, осадок: ${reaction.precipitate_formed ? "да" : "нет"}. Температура сосуда: ${displayedTempC.toFixed(
        1
      )}°C, объем: ${volumeL} л, давление: ${pressureAtm.toFixed(2)} атм.`
    : `Ученик еще не смешивал реагенты. Температура: ${ambientTempC}°C, объем: ${volumeL} л.`;

  return (
    <div className="relative">
      <CanvasShell cameraPosition={[3.5, 2.5, 4.5]}>
        <Flask />
        <Liquid targetColor={liquidColor} />
        <GasParticles active={Boolean(reaction?.gas_released)} timeScale={timeScale} />
        <PrecipitateParticles
          active={Boolean(reaction?.precipitate_formed)}
          color={reaction?.precipitate_color ?? "#ffffff"}
          timeScale={timeScale}
        />
      </CanvasShell>

      <AIAssistantChat simulationId={simulation.id} sceneStateDescription={sceneStateDescription} />

      <div className="mt-4 grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Реагент A</label>
          <select
            value={reagentA}
            onChange={(e) => setReagentA(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {REAGENTS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Реагент B</label>
          <select
            value={reagentB}
            onChange={(e) => setReagentB(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {REAGENTS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <button
            onClick={handleMix}
            disabled={isMixing}
            className="w-full rounded-md bg-brand py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {isMixing ? "Смешиваем..." : "Смешать реагенты"}
          </button>
        </div>

        {reaction && (
          <div className="rounded-md bg-gray-50 p-3 text-sm text-gray-700 sm:col-span-2">
            <p className="font-medium">{reaction.product_name}</p>
            <p className="text-gray-500">
              {reaction.is_exothermic ? "Экзотермическая реакция" : "Без выделения тепла"}
              {reaction.gas_released && " · выделяется газ"}
              {reaction.precipitate_formed && " · выпадает осадок"}
            </p>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Температура: {ambientTempC}°C</label>
          <input
            type="range"
            min={0}
            max={100}
            value={ambientTempC}
            onChange={(e) => setAmbientTempC(Number(e.target.value))}
            className="w-full"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Объем сосуда: {volumeL} л</label>
          <input
            type="range"
            min={1}
            max={50}
            value={volumeL}
            onChange={(e) => setVolumeL(Number(e.target.value))}
            className="w-full"
          />
        </div>

        <div className="rounded-md bg-gray-50 p-3 text-sm text-gray-600 sm:col-span-2">
          Сосуд: <span className="font-semibold text-gray-900">{displayedTempC.toFixed(1)}°C</span> · Давление
          (P·V=nRT, n=1 моль): <span className="font-semibold text-gray-900">{pressureAtm.toFixed(2)} атм</span>
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">Slow-Mo: {timeScale.toFixed(2)}x</label>
          <input
            type="range"
            min={0.1}
            max={2}
            step={0.05}
            value={timeScale}
            onChange={(e) => setTimeScale(Number(e.target.value))}
            className="w-full"
          />
        </div>

        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}

        <div className="flex items-center gap-3 sm:col-span-2">
          <button
            onClick={handleComplete}
            disabled={actionsLog.length === 0}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Завершить попытку
          </button>
          {completionScore !== null && (
            <span className="text-sm font-medium text-gray-900">Оценка: {completionScore}/100</span>
          )}
        </div>
      </div>
    </div>
  );
}
