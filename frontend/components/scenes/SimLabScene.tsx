"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { MeshTransmissionMaterial } from "@react-three/drei";
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

const GAS_PARTICLE_COUNT = 28;
const PRECIPITATE_PARTICLE_COUNT = 20;
const LIQUID_SURFACE_Y = 0.62;
const FLOOR_Y = -1.1;

// профиль колбы Эрленмейера для LatheGeometry: (радиус, высота) снизу вверх —
// широкое дно, плавное сужение к плечу и узкое прямое горлышко
const FLASK_PROFILE: [number, number][] = [
  [0, 0],
  [0.72, 0],
  [0.74, 0.06],
  [0.68, 0.42],
  [0.52, 0.82],
  [0.32, 1.14],
  [0.17, 1.34],
  [0.17, 1.86],
  [0.21, 1.92],
];

function useFlaskGeometry() {
  return useMemo(() => {
    const points = FLASK_PROFILE.map(([r, y]) => new THREE.Vector2(r, y));
    return new THREE.LatheGeometry(points, 48);
  }, []);
}

// пузырьки поднимаются близко к центральной оси, чтобы не протыкать
// узкое горлышко колбы при подъеме к устью
function randomBubbleOffset() {
  const angle = Math.random() * Math.PI * 2;
  const r = Math.random() * 0.11;
  return { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
}

function randomSedimentOffset() {
  const angle = Math.random() * Math.PI * 2;
  const r = Math.random() * 0.5;
  return { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
}

// частицы газа: яркие светящиеся пузырьки поднимаются от поверхности жидкости,
// растут и лопаются у горлышка — emissive-материал ловится Bloom-эффектом
function GasParticles({ active, timeScale }: { active: boolean; timeScale: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const particles = useMemo<GasParticleState[]>(
    () =>
      Array.from({ length: GAS_PARTICLE_COUNT }, () => {
        const { x, z } = randomBubbleOffset();
        return { t: Math.random(), x, z, speed: 0.35 + Math.random() * 0.45 };
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
          const { x, z } = randomBubbleOffset();
          particle.t = 0;
          particle.x = x;
          particle.z = z;
        }
      }

      const y = LIQUID_SURFACE_Y + particle.t * 1.25;
      const scale = active ? Math.sin(particle.t * Math.PI) * 0.055 + 0.008 : 0.0001;

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
      <meshStandardMaterial
        color="#e0f2fe"
        emissive="#7dd3fc"
        emissiveIntensity={1.4}
        transparent
        opacity={0.85}
      />
    </instancedMesh>
  );
}

// частицы осадка: насыщенные зернистые частицы оседают на дно колбы
function PrecipitateParticles({ active, color, timeScale }: { active: boolean; color: string; timeScale: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const particles = useMemo<PrecipitateParticleState[]>(
    () =>
      Array.from({ length: PRECIPITATE_PARTICLE_COUNT }, () => {
        const { x, z } = randomSedimentOffset();
        return { t: 0, x, z, restY: 0.03 + Math.random() * 0.05 };
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
      const startY = LIQUID_SURFACE_Y * 0.6;
      const y = active ? startY + (particle.restY - startY) * particle.t : startY;
      const scale = active ? 0.06 : 0.0001;

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
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial vertexColors roughness={0.6} />
    </instancedMesh>
  );
}

// жидкость плавно перетекает в новый цвет реакции; при экзотермической
// реакции чуть светится изнутри (emissive) — этот отблеск и подхватывает Bloom
function Liquid({ targetColor, glowing }: { targetColor: string; glowing: boolean }) {
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const target = useMemo(() => new THREE.Color(targetColor), [targetColor]);

  useFrame((_, delta) => {
    const material = materialRef.current;
    if (!material) return;
    material.color.lerp(target, Math.min(1, delta * 2));
    const targetEmissive = glowing ? 0.55 : 0;
    material.emissiveIntensity = THREE.MathUtils.lerp(material.emissiveIntensity, targetEmissive, Math.min(1, delta * 2));
  });

  return (
    <mesh position={[0, LIQUID_SURFACE_Y * 0.5, 0]}>
      <cylinderGeometry args={[0.58, 0.68, LIQUID_SURFACE_Y + 0.04, 32]} />
      <meshPhysicalMaterial
        ref={materialRef}
        color={targetColor}
        emissive={targetColor}
        emissiveIntensity={0}
        roughness={0.15}
        clearcoat={0.6}
        transmission={0.35}
        thickness={0.6}
      />
    </mesh>
  );
}

function Flask() {
  const geometry = useFlaskGeometry();
  return (
    <mesh geometry={geometry}>
      <MeshTransmissionMaterial
        thickness={0.35}
        roughness={0.04}
        transmission={1}
        ior={1.5}
        chromaticAberration={0.025}
        anisotropy={0.2}
        distortion={0.08}
        distortionScale={0.25}
        temporalDistortion={0.08}
        color="#eef6ff"
        resolution={128}
        samples={2}
      />
    </mesh>
  );
}

// глянцевый лабораторный подиум под колбой — ловит отражения от Lightformer-света
function LabBench() {
  return (
    <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[2.4, 64]} />
      <meshStandardMaterial color="#0b1226" roughness={0.2} metalness={0.5} />
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
    <div className="rounded-2xl bg-gradient-to-b from-slate-900 via-slate-950 to-black p-3 sm:p-5">
      {/* canvas и чат должны делить один relative-контейнер отдельно от
          панели управления ниже — иначе "absolute" чата всплывает к низу
          всей секции, а не к низу самого 3D-канваса */}
      <div className="relative">
        <CanvasShell
          cameraPosition={[3.2, 1.6, 4]}
          target={[0, 0.5, 0]}
          floorY={FLOOR_Y}
          bloomIntensity={reaction?.is_exothermic ? 1.1 : 0.5}
        >
          <group position={[0, FLOOR_Y, 0]}>
            <LabBench />
            <Flask />
            <Liquid targetColor={liquidColor} glowing={Boolean(reaction?.is_exothermic)} />
            <GasParticles active={Boolean(reaction?.gas_released)} timeScale={timeScale} />
            <PrecipitateParticles
              active={Boolean(reaction?.precipitate_formed)}
              color={reaction?.precipitate_color ?? "#ffffff"}
              timeScale={timeScale}
            />
          </group>
        </CanvasShell>

        <AIAssistantChat simulationId={simulation.id} sceneStateDescription={sceneStateDescription} />
      </div>

      <div className="glass-panel mt-4 grid grid-cols-1 gap-4 rounded-2xl p-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block font-mono text-xs uppercase tracking-widest text-slate-400">Реагент A</label>
          <select
            value={reagentA}
            onChange={(e) => setReagentA(e.target.value)}
            className="w-full rounded-md border border-glass-border bg-surface-container-lowest/60 px-3 py-2 text-sm text-slate-100 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          >
            {REAGENTS.map((r) => (
              <option key={r.value} value={r.value} className="bg-surface-slate">
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block font-mono text-xs uppercase tracking-widest text-slate-400">Реагент B</label>
          <select
            value={reagentB}
            onChange={(e) => setReagentB(e.target.value)}
            className="w-full rounded-md border border-glass-border bg-surface-container-lowest/60 px-3 py-2 text-sm text-slate-100 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          >
            {REAGENTS.map((r) => (
              <option key={r.value} value={r.value} className="bg-surface-slate">
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <button
            onClick={handleMix}
            disabled={isMixing}
            className="neon-glow-indigo w-full rounded-full bg-brand py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
          >
            {isMixing ? "Смешиваем..." : "Смешать реагенты"}
          </button>
        </div>

        {reaction && (
          <div className="rim-light rounded-xl border border-glass-border bg-surface-container-lowest/60 p-3 text-sm text-slate-300 sm:col-span-2">
            <p className="font-headline font-semibold text-slate-100">{reaction.product_name}</p>
            <p className="text-slate-400">
              {reaction.is_exothermic ? "Экзотермическая реакция" : "Без выделения тепла"}
              {reaction.gas_released && " · выделяется газ"}
              {reaction.precipitate_formed && " · выпадает осадок"}
            </p>
          </div>
        )}

        <div>
          <label className="mb-1 block font-mono text-xs uppercase tracking-widest text-slate-400">
            Температура: {ambientTempC}°C
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={ambientTempC}
            onChange={(e) => setAmbientTempC(Number(e.target.value))}
            className="w-full accent-brand"
          />
        </div>

        <div>
          <label className="mb-1 block font-mono text-xs uppercase tracking-widest text-slate-400">
            Объем сосуда: {volumeL} л
          </label>
          <input
            type="range"
            min={1}
            max={50}
            value={volumeL}
            onChange={(e) => setVolumeL(Number(e.target.value))}
            className="w-full accent-brand"
          />
        </div>

        <div className="rounded-xl border border-glass-border bg-surface-container-lowest/60 p-3 text-sm text-slate-400 sm:col-span-2">
          Сосуд: <span className="font-semibold text-slate-100">{displayedTempC.toFixed(1)}°C</span> · Давление
          (P·V=nRT, n=1 моль): <span className="font-semibold text-slate-100">{pressureAtm.toFixed(2)} атм</span>
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block font-mono text-xs uppercase tracking-widest text-slate-400">
            Slow-Mo: {timeScale.toFixed(2)}x
          </label>
          <input
            type="range"
            min={0.1}
            max={2}
            step={0.05}
            value={timeScale}
            onChange={(e) => setTimeScale(Number(e.target.value))}
            className="w-full accent-brand"
          />
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
