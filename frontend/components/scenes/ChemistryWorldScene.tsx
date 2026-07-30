"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { AnimatePresence, motion } from "framer-motion";
import { AlertOctagon, Flame, Lock, RotateCcw, RotateCw, Unlock, Volume2, VolumeX } from "lucide-react";
import CanvasShell from "@/components/scenes/CanvasShell";
import {
  ChemistryWorkspaceProvider,
  useChemistryWorkspace,
  isContainerOnStand,
  type ContainerItem,
  type ToolItem,
  type StockBottle,
} from "@/components/core/ChemistryWorkspaceProvider";
import { ChemistryDragProvider, useChemistryDrag } from "@/components/core/ChemistryDragProvider";
import { ChemistryTutorialProvider } from "@/components/tutorial/ChemistryTutorialProvider";
import ChemistryTutorialPanel from "@/components/tutorial/ChemistryTutorialPanel";
import { ExperimentProgressProvider, useExperimentProgress } from "@/components/experiments/ExperimentProgressProvider";
import ExperimentPanel from "@/components/experiments/ExperimentPanel";
import ChemistryTeacherChat from "@/components/ai/ChemistryTeacherChat";
import { SUBSTANCES, aggregateStateOf, computeColorHex, totalMassG, totalVolumeMl } from "@/lib/chemistry-engine";
import { getRegisteredReactions } from "@/lib/reaction-engine";
import { checkSafety, type SafetyWarning } from "@/lib/chemistry-safety";
import {
  playBurnerIgnite,
  playCrackSnap,
  playFlashWhoosh,
  playGasHiss,
  playGlassClink,
  playGlassStress,
  playPour,
  playReactionSuccess,
  playRuptureBang,
  playSafetyWarning,
  playShockThud,
  resumeAudioOnGesture,
  setSoundMuted,
  startBoilingLoop,
  startEmergencyAlarm,
  startFireCrackle,
  startPressureHum,
} from "@/lib/chemistry-sound";
import { buildChemistryAIContext } from "@/lib/chemistry-context-builder";
import { useQuality, type QualityLevel } from "@/lib/quality-context";
import type { Simulation } from "@/lib/types";
import type { LabStepContext } from "@/lib/chemistry-lab-catalog";
import { ChemistryLabExperienceProvider, useChemistryLabExperience } from "@/components/core/ChemistryLabExperienceProvider";
import LabModeSelector from "@/components/lab/LabModeSelector";
import ExperimentCatalogBrowser from "@/components/lab/ExperimentCatalogBrowser";
import GuidedLabPanel from "@/components/lab/GuidedLabPanel";
import CompletionScreen from "@/components/lab/CompletionScreen";
import LabNotebookPanel from "@/components/lab/LabNotebookPanel";

// Stage 5.5 v2 — Hazard Simulation: доступность, без учета prefers-reduced-motion
// нельзя показывать тряску камеры/агрессивные эффекты
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const listener = (e: MediaQueryListEvent) => setReduced(e.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);
  return reduced;
}

const HEAT_RATE_C_PER_SEC = 12;
const DROP_PROXIMITY_RADIUS = 0.5;
const GRAB_LIFT_HEIGHT = 0.14;
const GRAB_LIFT_SPEED = 10; // 1/сек, скорость lerp подъема при захвате/отпускании

// TOOL_LABEL — общие подписи для hover-подсказок над инструментами (не
// дублируется с MODULE_LABEL из LessonCard — это не модули, а предметы стола)
const TOOL_LABEL: Record<string, string> = {
  burner: "Горелка",
  stand: "Штатив",
  pipette: "Пипетка",
  thermometer: "Термометр",
  scale: "Весы",
};

const CONTAINER_LABEL: Record<string, string> = {
  test_tube: "Пробирка",
  flask: "Колба",
  beaker: "Стакан",
};

// процедурная текстура столешницы — своя отдельная реализация (тот же
// прием CanvasTexture, что и в Electricity Lab, но не переиспользует его код)
// плавно "догоняет" число до целевого значения кадр за кадром (lerp), а не
// перескакивает мгновенно — используется и для уровня жидкости, и для пара/
// пузырьков; сам целевой уровень по-прежнему считает исключительно Chemistry
// Engine (totalVolumeMl), это чисто визуальная интерполяция поверх него
function useSmoothedNumber(target: number, speed = 6): number {
  const ref = useRef(target);
  const [, force] = useState(0);
  useFrame((_, delta) => {
    const prev = ref.current;
    const next = prev + (target - prev) * Math.min(1, delta * speed);
    if (Math.abs(next - prev) > 0.0005) {
      ref.current = next;
      force((v) => v + 1);
    }
  });
  return ref.current;
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return [r, g, b];
}

function rgbTupleToHex([r, g, b]: [number, number, number]): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`;
}

// цвет раствора никогда не должен "щелкать" мгновенно при реакции/переливании —
// интерполируем по RGB-каналам к цвету, посчитанному Chemistry Engine
function useAnimatedColor(targetHex: string, speed = 4): string {
  const current = useRef<[number, number, number]>(hexToRgbTuple(targetHex));
  const [displayHex, setDisplayHex] = useState(targetHex);

  useFrame((_, delta) => {
    const target = hexToRgbTuple(targetHex);
    const [r, g, b] = current.current;
    const t = Math.min(1, delta * speed);
    const next: [number, number, number] = [r + (target[0] - r) * t, g + (target[1] - g) * t, b + (target[2] - b) * t];
    current.current = next;
    const dist = Math.abs(next[0] - target[0]) + Math.abs(next[1] - target[1]) + Math.abs(next[2] - target[2]);
    const nextHex = rgbTupleToHex(next);
    if (nextHex !== displayHex || dist > 0.5) {
      setDisplayHex(nextHex);
    }
  });

  return displayHex;
}

function useLabBenchTexture() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#e8e4da";
      ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 2500; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const shade = 190 + Math.random() * 40;
        ctx.fillStyle = `rgba(${shade},${shade - 6},${shade - 20},0.3)`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2.5, 1.2);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function Workbench() {
  const texture = useLabBenchTexture();
  return (
    <mesh position={[0, -0.05, 0]} receiveShadow>
      <boxGeometry args={[9, 0.1, 4]} />
      <meshStandardMaterial map={texture} roughness={0.65} metalness={0.05} />
    </mesh>
  );
}

// невидимая плоскость стола — ловит перемещение/отпускание перетаскиваемого
// предмета и переводит экранный жест в мировые XZ-координаты (та же идея,
// что WireDragSurface в Electricity Lab, отдельная реализация под
// свободное 2D-перемещение, а не подключение проводов)
function DragSurface({ onDrop }: { onDrop: (id: string, x: number, z: number) => void }) {
  const { draggingId, stopDrag } = useChemistryDrag();
  const { moveItem } = useChemistryWorkspace();

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.01, 0]}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        if (!draggingId) return;
        e.stopPropagation();
        moveItem(draggingId, [e.point.x, e.point.z]);
      }}
      onPointerUp={(e: ThreeEvent<PointerEvent>) => {
        if (!draggingId) return;
        e.stopPropagation();
        onDrop(draggingId, e.point.x, e.point.z);
        stopDrag();
      }}
    >
      <planeGeometry args={[10, 5]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

function useDragHandlers(id: string) {
  const { startDrag, draggingId } = useChemistryDrag();
  const { select } = useChemistryWorkspace();
  return {
    isDragging: draggingId === id,
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      // R3F и OrbitControls слушают pointerdown на одном и том же DOM-элементе
      // канваса — обычный stopPropagation() гасит только всплытие между
      // Three.js объектами, а не соседние нативные листенеры на том же узле.
      // stopImmediatePropagation() не дает OrbitControls стартовать вращение
      // по этому же событию, пока orbitEnabled={!draggingId} еще не применился
      // на следующем рендере — устраняет гонку камеры и захвата целиком.
      e.nativeEvent.stopImmediatePropagation();
      // звук должен разблокироваться по первому же пользовательскому
      // жесту в сцене — захват предмета для этого не хуже клика
      resumeAudioOnGesture();
      playGlassClink();
      select(id);
      startDrag(id);
    },
  };
}

// поднимает предмет над столом во время захвата и плавно опускает обратно
// после отпускания (lerp, а не мгновенный прыжок) + мягкая контактная тень,
// которая появляется/исчезает синхронно с высотой подъема
function GrabLift({ isDragging, children }: { isDragging: boolean; children: React.ReactNode }) {
  const innerRef = useRef<THREE.Group>(null);
  const shadowRef = useRef<THREE.Mesh>(null);
  const shadowMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const progress = useRef(0);

  useFrame((_, delta) => {
    const target = isDragging ? 1 : 0;
    progress.current += (target - progress.current) * Math.min(1, delta * GRAB_LIFT_SPEED);
    if (innerRef.current) innerRef.current.position.y = progress.current * GRAB_LIFT_HEIGHT;
    if (shadowMatRef.current) shadowMatRef.current.opacity = progress.current * 0.32;
    if (shadowRef.current) {
      const scale = 1 + progress.current * 0.2;
      shadowRef.current.scale.set(scale, scale, scale);
    }
  });

  return (
    <>
      <mesh ref={shadowRef} position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.22, 20]} />
        <meshBasicMaterial ref={shadowMatRef} color="#000000" transparent opacity={0} depthWrite={false} />
      </mesh>
      <group ref={innerRef}>{children}</group>
    </>
  );
}

// плавный наклон сосуда во время переливания — контейнер сам не двигается,
// наклоняется только его визуальная группа, и возвращается в исходное
// положение (rotation.z -> 0), как только isPouring снова false
function PourTilt({ active, children }: { active: boolean; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const progress = useRef(0);
  useFrame((_, delta) => {
    const target = active ? 1 : 0;
    progress.current += (target - progress.current) * Math.min(1, delta * 5);
    if (ref.current) ref.current.rotation.z = -progress.current * (Math.PI / 3.2);
  });
  return <group ref={ref}>{children}</group>;
}

// видимая "струя" жидкости между переливаемым и принимающим сосудом —
// чисто декоративная траектория частиц, реальный результат (масса/объем/цвет)
// по-прежнему считает исключительно Chemistry Engine после завершения анимации
function PourStream({ from, to, colorHex }: { from: [number, number]; to: [number, number]; colorHex: string }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    refs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const phase = (clock.elapsedTime * 3 + i * 0.25) % 1;
      const x = from[0] + (to[0] - from[0]) * phase;
      const z = from[1] + (to[1] - from[1]) * phase;
      const y = 0.55 - phase * 0.4;
      mesh.position.set(x, y, z);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.8 * (1 - Math.abs(phase - 0.5) * 0.7);
    });
  });
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
        >
          <sphereGeometry args={[0.018, 8, 8]} />
          <meshBasicMaterial color={colorHex} transparent opacity={0.8} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}

// Interaction Debug Mode (только для разработки) — показывает реальные
// хитбоксы, snap-зоны и текущее состояние драга поверх сцены
const ChemistryDebugContext = createContext(false);
function useChemistryDebug(): boolean {
  return useContext(ChemistryDebugContext);
}

// невидимый увеличенный "хитбокс" вокруг мелких предметов — реальные
// геометрии (пипетка, термометр, бутылки) слишком тонкие для комфортного
// захвата мышью; событие все равно всплывает наверх к onPointerDown группы.
// В Interaction Debug Mode рисуется как видимый wireframe вместо невидимого
// материала — тот же самый геометрический объем, который реально ловит клик
function Hitbox({ radius, height = 0.5 }: { radius: number; height?: number }) {
  const debug = useChemistryDebug();
  return (
    <mesh>
      <cylinderGeometry args={[radius, radius, height, 12]} />
      <meshBasicMaterial
        wireframe={debug}
        color={debug ? "#22d3ee" : "#000000"}
        transparent
        opacity={debug ? 0.4 : 0}
        depthWrite={false}
      />
    </mesh>
  );
}

function RotateHandle({ id }: { id: string }) {
  const { rotateItem } = useChemistryWorkspace();
  return (
    <Html position={[0, 0.6, 0]} center distanceFactor={8} style={{ pointerEvents: "auto" }}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          rotateItem(id);
        }}
        data-testid={`rotate-${id}`}
        title="Повернуть"
        className="flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-slate-900/85 text-white hover:bg-slate-800"
      >
        <RotateCw size={12} />
      </button>
    </Html>
  );
}

// Stage 5.5 v2 — переключатель "герметично закрыт / открыт". Заблокирован
// во время Emergency Stop (реальная блокировка в reducer'е, кнопка просто
// это отражает — TOGGLE_SEAL с emergencyStop все равно не даст эффекта)
function SealHandle({ id, isSealed, disabled }: { id: string; isSealed: boolean; disabled: boolean }) {
  const { toggleSeal } = useChemistryWorkspace();
  return (
    <Html position={[0.35, 0.6, 0]} center distanceFactor={8} style={{ pointerEvents: "auto" }}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) toggleSeal(id);
        }}
        disabled={disabled}
        data-testid={`seal-toggle-${id}`}
        title={isSealed ? "Открыть сосуд" : "Герметично закрыть сосуд"}
        className={`flex h-6 w-6 items-center justify-center rounded-full border text-white transition disabled:opacity-40 ${
          isSealed ? "border-amber-400/60 bg-amber-900/70" : "border-white/20 bg-slate-900/85 hover:bg-slate-800"
        }`}
      >
        {isSealed ? <Lock size={12} /> : <Unlock size={12} />}
      </button>
    </Html>
  );
}

const REACTION_EFFECT_DURATION_MS = 2600;
const STEAM_PREVIEW_START_C = 70;
const STEAM_PREVIEW_FULL_C = 100;

// общая функция для "паровых" частиц — переиспользуется и нагревом, и
// экзотермической реакцией, чтобы не заводить два разных визуальных языка
// для одного и того же явления (испарение)
function driveSteamMeshes(meshes: (THREE.Mesh | null)[], elapsedTime: number, intensity: number, baseY: number) {
  meshes.forEach((mesh, i) => {
    if (!mesh) return;
    if (intensity <= 0.01) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    const phase = (elapsedTime * 0.5 + i * 0.33) % 1;
    mesh.position.set(Math.sin(i * 1.7) * 0.05, baseY + phase * 0.5, Math.cos(i * 1.7) * 0.05);
    mesh.scale.setScalar(0.5 + phase * 1.2);
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = intensity * (1 - phase) * 0.35;
  });
}

function SteamMeshes({ refs }: { refs: React.MutableRefObject<(THREE.Mesh | null)[]> }) {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          visible={false}
        >
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshBasicMaterial color="#f8fafc" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}

// визуальные эффекты реакции — включаются только реальными записями из
// state.reactionLog (сам Reaction Engine их туда пишет), никакого случайного
// или выдуманного триггера. Пузырьки — всегда при срабатывании реакции,
// свечение и легкий пар — только если реакция экзотермическая (isExothermic
// из самой зарегистрированной реакции, а не решение этого компонента)
function ReactionEffects({ item, halfHeight }: { item: ContainerItem; halfHeight: number }) {
  const { state } = useChemistryWorkspace();
  const bubbleRefs = useRef<(THREE.Mesh | null)[]>([]);
  const steamRefs = useRef<(THREE.Mesh | null)[]>([]);
  const glowRef = useRef<THREE.PointLight>(null);

  const lastEntry = useMemo(() => {
    const entries = state.reactionLog.filter((e) => e.containerId === item.id);
    return entries.length > 0 ? entries[entries.length - 1] : null;
  }, [state.reactionLog, item.id]);

  const isExothermic = useMemo(
    () => (lastEntry ? getRegisteredReactions().find((r) => r.id === lastEntry.reactionId)?.isExothermic ?? false : false),
    [lastEntry]
  );

  useFrame(({ clock }) => {
    const elapsed = lastEntry ? Date.now() - lastEntry.at : Infinity;
    const active = elapsed < REACTION_EFFECT_DURATION_MS;
    const fade = active ? 1 - elapsed / REACTION_EFFECT_DURATION_MS : 0;

    bubbleRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      if (!active) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      const phase = (clock.elapsedTime * 1.6 + i * 0.6) % 1;
      mesh.position.set(Math.sin(i * 2.1) * 0.08, -halfHeight + phase * (halfHeight * 1.6), Math.cos(i * 2.1) * 0.08);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = fade * (1 - phase) * 0.6;
    });

    if (glowRef.current) glowRef.current.intensity = active && isExothermic ? fade * 1.6 : 0;

    driveSteamMeshes(steamRefs.current, clock.elapsedTime, active && isExothermic ? fade * 0.6 : 0, halfHeight);
  });

  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh
          key={i}
          ref={(el) => {
            bubbleRefs.current[i] = el;
          }}
          visible={false}
        >
          <sphereGeometry args={[0.015 + (i % 2) * 0.008, 8, 8]} />
          <meshBasicMaterial color="#e0f2fe" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
      <pointLight ref={glowRef} position={[0, 0, 0]} color="#f97316" intensity={0} distance={0.6} decay={2} />
      <SteamMeshes refs={steamRefs} />
    </>
  );
}

// пар во время нагрева — интенсивность растет с реальной температурой
// сосуда (Chemistry Engine); порог 70-100°C — эвристика для "приближается
// к кипению", т.к. точная температура кипения смеси не экспортируется
// движком наружу. Полная интенсивность — когда aggregateStateOf уже вернул
// "gas", это уже не эвристика, а реальный расчет движка.
function HeatingEffects({ item, halfHeight }: { item: ContainerItem; halfHeight: number }) {
  const steamRefs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    const state = aggregateStateOf(item.data);
    const temp = item.data.temperatureC;
    const intensity =
      state === "gas" ? 1 : Math.max(0, Math.min(1, (temp - STEAM_PREVIEW_START_C) / (STEAM_PREVIEW_FULL_C - STEAM_PREVIEW_START_C)));
    driveSteamMeshes(steamRefs.current, clock.elapsedTime, intensity, halfHeight);
  });
  return <SteamMeshes refs={steamRefs} />;
}

function hazardEventIntensity(item: ContainerItem, type: string): number {
  return item.hazard.visualEvents.find((e) => e.type === type)?.intensity ?? 0;
}

// Stage 5.5 v2 — визуальные эффекты Hazard Engine: газовое облако/дым,
// напряжение стекла (трещины), осколки при разрушении, вспышка, ударная
// волна. Все интенсивности читаются из уже посчитанного item.hazard —
// компонент сам ничего не решает и не использует Math.random для самого
// события или его силы (только для распределения частиц по кругу, что не
// влияет на физический результат). Полностью отдельно от ReactionEffects/
// HeatingEffects (Stage 5.5) — ничего там не меняет.
function HazardEffects({ item, halfHeight }: { item: ContainerItem; halfHeight: number }) {
  const gasCloudRefs = useRef<(THREE.Mesh | null)[]>([]);
  const smokeRefs = useRef<(THREE.Mesh | null)[]>([]);
  const crackRefs = useRef<(THREE.Mesh | null)[]>([]);
  const shardRefs = useRef<(THREE.Mesh | null)[]>([]);
  const flashRef = useRef<THREE.Mesh>(null);
  const flashLightRef = useRef<THREE.PointLight>(null);
  const shockwaveRef = useRef<THREE.Mesh>(null);

  const shatterProgress = useRef(0);
  const wasShatter = useRef(false);
  const flashProgress = useRef(0);
  const wasFlash = useRef(false);
  const shockProgress = useRef(0);
  const wasShockwave = useRef(false);

  useFrame(({ clock }, delta) => {
    driveSteamMeshes(gasCloudRefs.current, clock.elapsedTime * 0.7, hazardEventIntensity(item, "gas_cloud"), halfHeight);
    driveSteamMeshes(smokeRefs.current, clock.elapsedTime * 0.5, hazardEventIntensity(item, "smoke"), halfHeight + 0.15);

    const crackIntensity = hazardEventIntensity(item, "crack");
    crackRefs.current.forEach((mesh) => {
      if (!mesh) return;
      mesh.visible = crackIntensity > 0.01;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = crackIntensity * 0.8;
    });

    // осколки — одноразовый всплеск по переднему фронту события "shatter"
    const shatterNow = hazardEventIntensity(item, "shatter") > 0;
    if (shatterNow && !wasShatter.current) shatterProgress.current = 1;
    wasShatter.current = shatterNow;
    if (shatterProgress.current > 0) {
      shatterProgress.current = Math.max(0, shatterProgress.current - delta * 0.7);
      const t = 1 - shatterProgress.current;
      shardRefs.current.forEach((mesh, i) => {
        if (!mesh) return;
        const angle = (i / shardRefs.current.length) * Math.PI * 2 + i;
        mesh.visible = true;
        mesh.position.set(Math.cos(angle) * t * 0.6, halfHeight * t * 1.4, Math.sin(angle) * t * 0.6);
        mesh.rotation.set(t * 4, t * 3, t * 2);
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = shatterProgress.current;
      });
    } else {
      shardRefs.current.forEach((mesh) => {
        if (mesh) mesh.visible = false;
      });
    }

    // вспышка — короткий яркий импульс
    const flashNow = hazardEventIntensity(item, "flash") > 0;
    if (flashNow && !wasFlash.current) flashProgress.current = 1;
    wasFlash.current = flashNow;
    flashProgress.current = Math.max(0, flashProgress.current - delta * 4);
    if (flashRef.current) {
      const mat = flashRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = flashProgress.current * 0.9;
    }
    if (flashLightRef.current) flashLightRef.current.intensity = flashProgress.current * 6;

    // ударная волна — расширяющееся кольцо, один проход на событие
    const shockwaveNow = hazardEventIntensity(item, "shockwave") > 0;
    if (shockwaveNow && !wasShockwave.current) shockProgress.current = 0.001;
    wasShockwave.current = shockwaveNow;
    if (shockProgress.current > 0) {
      shockProgress.current = Math.min(1.001, shockProgress.current + delta * 2.2);
      if (shockwaveRef.current) {
        if (shockProgress.current >= 1) {
          shockwaveRef.current.visible = false;
          shockProgress.current = 0;
        } else {
          const scale = 0.2 + shockProgress.current * 2.6;
          shockwaveRef.current.visible = true;
          shockwaveRef.current.scale.set(scale, scale, scale);
          const mat = shockwaveRef.current.material as THREE.MeshBasicMaterial;
          mat.opacity = (1 - shockProgress.current) * 0.6;
        }
      }
    }
  });

  return (
    <>
      <SteamMeshes refs={gasCloudRefs} />
      {[0, 1, 2].map((i) => (
        <mesh
          key={`smoke-${i}`}
          ref={(el) => {
            smokeRefs.current[i] = el;
          }}
          visible={false}
        >
          <sphereGeometry args={[0.07, 8, 8]} />
          <meshBasicMaterial color="#334155" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={`crack-${i}`}
          ref={(el) => {
            crackRefs.current[i] = el;
          }}
          position={[Math.cos((i * Math.PI) / 2) * 0.18, halfHeight * (0.1 + (i % 2) * 0.3), Math.sin((i * Math.PI) / 2) * 0.18]}
          rotation={[0, (i * Math.PI) / 2, Math.PI / 5]}
          visible={false}
        >
          <boxGeometry args={[0.015, 0.16, 0.005]} />
          <meshBasicMaterial color="#0f172a" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh
          key={`shard-${i}`}
          ref={(el) => {
            shardRefs.current[i] = el;
          }}
          visible={false}
        >
          <tetrahedronGeometry args={[0.035]} />
          <meshBasicMaterial color="#e0f2fe" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
      <mesh ref={flashRef} position={[0, halfHeight * 0.5, 0]}>
        <sphereGeometry args={[0.4, 12, 12]} />
        <meshBasicMaterial color="#fef3c7" transparent opacity={0} depthWrite={false} />
      </mesh>
      <pointLight ref={flashLightRef} position={[0, halfHeight, 0]} color="#fef3c7" intensity={0} distance={3} decay={2} />
      <mesh ref={shockwaveRef} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.3, 0.42, 32]} />
        <meshBasicMaterial color="#fde68a" transparent opacity={0} depthWrite={false} />
      </mesh>
    </>
  );
}

// Stage 5.5 v2 — звук Hazard Engine. Одноразовые события проигрываются
// ровно тогда, когда меняется ссылка на item.hazard (то есть ровно один раз
// на реальный тик Hazard Engine, а не на каждый React-рендер — HAZARD_TICK
// в провайдере создает новый объект hazard только при фактическом
// пересчете). Длящиеся эффекты (гул давления, треск огня) — управляемые
// циклы, останавливаются сами, когда реальное условие исчезает.
function HazardSoundEffects({ item }: { item: ContainerItem }) {
  const hazardRef = useRef(item.hazard);
  hazardRef.current = item.hazard;

  useEffect(() => {
    item.hazard.soundEvents.forEach((event) => {
      switch (event.type) {
        case "gas_hiss":
          playGasHiss();
          break;
        case "glass_stress":
          playGlassStress();
          break;
        case "crack_snap":
          playCrackSnap();
          break;
        case "rupture_bang":
          playRuptureBang();
          break;
        case "flash_whoosh":
          playFlashWhoosh();
          break;
        case "shock_thud":
          playShockThud();
          break;
        default:
          break;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.hazard]);

  const pressureHumActive = item.hazard.soundEvents.some((e) => e.type === "pressure_hum");
  useEffect(() => {
    if (!pressureHumActive) return;
    const stop = startPressureHum(() => hazardRef.current.pressureRatio);
    return stop;
  }, [pressureHumActive]);

  const fireCrackleActive = item.hazard.soundEvents.some((e) => e.type === "fire_crackle");
  useEffect(() => {
    if (!fireCrackleActive) return;
    const stop = startFireCrackle();
    return stop;
  }, [fireCrackleActive]);

  return null;
}

function ContainerMesh({
  item,
  isSnapTarget,
  isUnsafe,
  isPouring,
}: {
  item: ContainerItem;
  isSnapTarget: boolean;
  isUnsafe: boolean;
  isPouring: boolean;
}) {
  const { state } = useChemistryWorkspace();
  const { onPointerDown, isDragging } = useDragHandlers(item.id);
  const [hovered, setHovered] = useState(false);
  const isSelected = state.selectedItemId === item.id;
  const isActive = state.activeContainerId === item.id;

  const snapRingRef = useRef<THREE.Mesh>(null);
  const unsafeRingRef = useRef<THREE.Mesh>(null);

  const displayColorHex = useAnimatedColor(computeColorHex(item.data));
  const volumeMl = totalVolumeMl(item.data);
  const targetFillHeight = Math.min(0.32, (volumeMl / 400) * 0.32);
  const fillHeight = useSmoothedNumber(targetFillHeight, 6);
  const hasPrecipitate = item.data.precipitate.length > 0;
  const aggregateState = aggregateStateOf(item.data);

  useFrame(({ clock }) => {
    const pulse = 0.5 + Math.sin(clock.elapsedTime * 6) * 0.5;
    if (snapRingRef.current) {
      const mat = snapRingRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = isSnapTarget ? 0.4 + pulse * 0.5 : 0;
    }
    if (unsafeRingRef.current) {
      const mat = unsafeRingRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = isUnsafe ? 0.35 + pulse * 0.45 : 0;
    }
  });

  const outerGeometry =
    item.kind === "test_tube" ? (
      <cylinderGeometry args={[0.09, 0.09, 0.5, 16]} />
    ) : item.kind === "flask" ? (
      <coneGeometry args={[0.26, 0.42, 20]} />
    ) : (
      <cylinderGeometry args={[0.26, 0.22, 0.4, 20]} />
    );

  const halfHeight = item.kind === "test_tube" ? 0.25 : item.kind === "flask" ? 0.21 : 0.2;

  return (
    <group
      position={[item.position[0], 0.05, item.position[1]]}
      rotation={[0, item.rotationY, 0]}
      onPointerDown={onPointerDown}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <Hitbox radius={0.32} height={halfHeight * 2 + 0.1} />

      <GrabLift isDragging={isDragging}>
        <PourTilt active={isPouring}>
          {/* прозрачное "стекло" — при наведении чуть светлее, чтобы предмет
              читался как интерактивный еще до того, как его возьмут */}
          <mesh castShadow>
            {outerGeometry}
            <meshPhysicalMaterial
              color={hovered ? "#eff6ff" : "#dbeafe"}
              transparent
              opacity={hovered ? 0.4 : 0.28}
              roughness={0.1}
              transmission={0.6}
              thickness={0.05}
            />
          </mesh>

          {/* жидкость внутри — цвет и уровень посчитаны Chemistry Engine,
              но и цвет, и высота столба плавно интерполируются на экране */}
          {volumeMl > 0 && (
            <mesh position={[0, -halfHeight + fillHeight / 2, 0]}>
              <cylinderGeometry args={[0.2, 0.2, Math.max(0.02, fillHeight), 20]} />
              <meshStandardMaterial color={displayColorHex} transparent opacity={aggregateState === "gas" ? 0.35 : 0.85} />
            </mesh>
          )}

          {/* осадок на дне — реальный, только если Chemistry Engine его посчитал */}
          {hasPrecipitate && (
            <mesh position={[0, -halfHeight + 0.015, 0]}>
              <cylinderGeometry args={[0.18, 0.18, 0.03, 20]} />
              <meshStandardMaterial color={SUBSTANCES[item.data.precipitate[0].substanceId]?.colorHex ?? "#f5f5f4"} roughness={0.8} />
            </mesh>
          )}

          <ReactionEffects item={item} halfHeight={halfHeight} />
          <HeatingEffects item={item} halfHeight={halfHeight} />
          <HazardEffects item={item} halfHeight={halfHeight} />
        </PourTilt>
      </GrabLift>
      <HazardSoundEffects item={item} />

      {(isSelected || isActive) && (
        <mesh position={[0, -halfHeight - 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.28, 0.32, 24]} />
          <meshBasicMaterial color={isActive ? "#a78bfa" : "#38bdf8"} transparent opacity={0.7} />
        </mesh>
      )}

      {/* зона приема — подсвечивается заранее, пока перетаскиваемый предмет
          еще над столом и не отпущен, чтобы было понятно куда можно бросить */}
      <mesh ref={snapRingRef} position={[0, -halfHeight - 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.34, 0.42, 32]} />
        <meshBasicMaterial color="#34d399" transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* предупреждение Safety System — подсветка только по реальному
          результату checkSafety(), никаких выдуманных состояний */}
      <mesh ref={unsafeRingRef} position={[0, -halfHeight - 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.45, 32]} />
        <meshBasicMaterial color="#f87171" transparent opacity={0} depthWrite={false} />
      </mesh>

      {isSelected && <RotateHandle id={item.id} />}
      {isSelected && (
        <SealHandle id={item.id} isSealed={item.isSealed} disabled={state.emergencyStop !== null} />
      )}

      <Html position={[0, halfHeight + 0.25, 0]} center distanceFactor={9} style={{ pointerEvents: "none" }}>
        <div className="pointer-events-none whitespace-nowrap rounded-md border border-white/10 bg-slate-900/85 px-2 py-0.5 text-[10px] text-slate-100">
          {item.data.temperatureC.toFixed(0)}°C
        </div>
      </Html>

      {hovered && !isDragging && (
        <Html position={[0, halfHeight + 0.45, 0]} center distanceFactor={9} style={{ pointerEvents: "none" }}>
          <div className="pointer-events-none whitespace-nowrap rounded-md border border-white/10 bg-slate-900/90 px-2 py-1 text-xs text-slate-100">
            {CONTAINER_LABEL[item.kind]}
          </div>
        </Html>
      )}
    </group>
  );
}

function StockBottleMesh({ bottle, isPouring }: { bottle: StockBottle; isPouring: boolean }) {
  const [hovered, setHovered] = useState(false);
  const { onPointerDown, isDragging } = useDragHandlers(bottle.id);
  const substance = SUBSTANCES[bottle.substanceId];

  return (
    <group
      position={[bottle.position[0], 0.16, bottle.position[1]]}
      onPointerDown={onPointerDown}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <Hitbox radius={0.17} height={0.5} />

      <GrabLift isDragging={isDragging}>
        <PourTilt active={isPouring}>
          <mesh castShadow>
            <cylinderGeometry args={[0.09, 0.09, 0.32, 16]} />
            <meshStandardMaterial
              color={hovered ? "#f8fafc" : "#e2e8f0"}
              roughness={0.3}
              metalness={0.1}
              transparent
              opacity={0.85}
            />
          </mesh>
          <mesh position={[0, 0.19, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.06, 12]} />
            <meshStandardMaterial
              color={substance?.colorHex ?? "#94a3b8"}
              emissive={substance?.colorHex ?? "#94a3b8"}
              emissiveIntensity={hovered ? 0.35 : 0}
              metalness={0.4}
              roughness={0.4}
            />
          </mesh>
        </PourTilt>
      </GrabLift>

      {hovered && !isDragging && (
        <Html position={[0, 0.35, 0]} center distanceFactor={9} style={{ pointerEvents: "none" }}>
          <div className="pointer-events-none whitespace-nowrap rounded-md border border-white/10 bg-slate-900/90 px-2 py-1 text-xs text-slate-100">
            {substance?.name} ({substance?.formula})
          </div>
        </Html>
      )}
    </group>
  );
}

// общая hover-подсказка с названием инструмента — единый визуальный язык
// для burner/stand/pipette/thermometer/scale
function ToolHoverLabel({ tool, y }: { tool: ToolItem; y: number }) {
  return (
    <Html position={[0, y, 0]} center distanceFactor={9} style={{ pointerEvents: "none" }}>
      <div className="pointer-events-none whitespace-nowrap rounded-md border border-white/10 bg-slate-900/90 px-2 py-1 text-xs text-slate-100">
        {TOOL_LABEL[tool.kind] ?? tool.kind}
      </div>
    </Html>
  );
}

function BurnerMesh({ tool }: { tool: ToolItem }) {
  const { toggleBurner } = useChemistryWorkspace();
  const { onPointerDown, isDragging } = useDragHandlers(tool.id);
  const [hovered, setHovered] = useState(false);
  const flameRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!flameRef.current) return;
    const pulse = tool.isOn ? 1 + Math.sin(clock.elapsedTime * 10) * 0.15 : 0.001;
    flameRef.current.scale.setScalar(pulse);
  });

  return (
    <group
      position={[tool.position[0], 0, tool.position[1]]}
      rotation={[0, tool.rotationY, 0]}
      onPointerDown={onPointerDown}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <Hitbox radius={0.3} height={0.5} />
      <GrabLift isDragging={isDragging}>
        <mesh castShadow>
          <cylinderGeometry args={[0.22, 0.26, 0.18, 20]} />
          <meshStandardMaterial color={hovered ? "#475569" : "#334155"} metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh
          position={[0, 0.12, 0]}
          onClick={(e) => {
            e.stopPropagation();
            if (!tool.isOn) playBurnerIgnite();
            toggleBurner(tool.id);
          }}
        >
          <cylinderGeometry args={[0.18, 0.18, 0.04, 20]} />
          <meshStandardMaterial color={tool.isOn ? "#f97316" : "#1e293b"} emissive={tool.isOn ? "#f97316" : "#000000"} emissiveIntensity={tool.isOn ? 0.8 : 0} />
        </mesh>
        {/* data-testid нельзя ставить прямо на <mesh> — R3F интерпретирует
            дефис в имени пропса как вложенный путь (data.testid) и падает на
            mesh.data === undefined; реальный testid — через невидимый Html-маркер */}
        <Html position={[0, 0.12, 0]} center distanceFactor={9} style={{ pointerEvents: "none" }}>
          <div data-testid={`burner-toggle-${tool.id}`} style={{ width: 1, height: 1 }} />
        </Html>
        <mesh ref={flameRef} position={[0, 0.32, 0]} scale={0.001}>
          <coneGeometry args={[0.08, 0.24, 12]} />
          <meshStandardMaterial color="#fb923c" emissive="#f97316" emissiveIntensity={2} transparent opacity={0.85} />
        </mesh>
        {tool.isOn && <pointLight position={[0, 0.3, 0]} color="#f97316" intensity={1.2} distance={2} decay={2} />}
      </GrabLift>
      {hovered && !isDragging && <ToolHoverLabel tool={tool} y={0.5} />}
    </group>
  );
}

function StandMesh({ tool }: { tool: ToolItem }) {
  const { onPointerDown, isDragging } = useDragHandlers(tool.id);
  const [hovered, setHovered] = useState(false);
  return (
    <group
      position={[tool.position[0], 0, tool.position[1]]}
      rotation={[0, tool.rotationY, 0]}
      onPointerDown={onPointerDown}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <Hitbox radius={0.28} height={1.1} />
      <GrabLift isDragging={isDragging}>
        <mesh position={[0.22, 0.5, 0]} castShadow>
          <cylinderGeometry args={[0.02, 0.02, 1.0, 8]} />
          <meshStandardMaterial color="#71717a" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0.1, 0.85, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.015, 0.015, 0.28, 8]} />
          <meshStandardMaterial color="#71717a" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.85, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.22, 0.012, 8, 24]} />
          <meshStandardMaterial color="#a1a1aa" metalness={0.8} roughness={0.25} />
        </mesh>
      </GrabLift>
      {hovered && !isDragging && <ToolHoverLabel tool={tool} y={1.05} />}
    </group>
  );
}

function PipetteMesh({ tool }: { tool: ToolItem }) {
  const { onPointerDown, isDragging } = useDragHandlers(tool.id);
  const [hovered, setHovered] = useState(false);
  return (
    <group
      position={[tool.position[0], 0.05, tool.position[1]]}
      rotation={[0, tool.rotationY, 0]}
      onPointerDown={onPointerDown}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <Hitbox radius={0.12} height={0.55} />
      <GrabLift isDragging={isDragging}>
        <mesh castShadow>
          <cylinderGeometry args={[0.02, 0.03, 0.5, 12]} />
          <meshStandardMaterial color={hovered ? "#f1f5f9" : "#cbd5e1"} transparent opacity={0.5} roughness={0.2} />
        </mesh>
        <mesh position={[0, 0.28, 0]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshStandardMaterial color="#f87171" roughness={0.6} />
        </mesh>
      </GrabLift>
      {hovered && !isDragging && <ToolHoverLabel tool={tool} y={0.45} />}
    </group>
  );
}

function ThermometerMesh({ tool }: { tool: ToolItem }) {
  const { state } = useChemistryWorkspace();
  const { onPointerDown, isDragging } = useDragHandlers(tool.id);
  const [hovered, setHovered] = useState(false);
  const active = state.containers.find((c) => c.id === state.activeContainerId);

  return (
    <group
      position={[tool.position[0], 0.05, tool.position[1]]}
      rotation={[0, tool.rotationY, 0]}
      onPointerDown={onPointerDown}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <Hitbox radius={0.1} height={0.5} />
      <GrabLift isDragging={isDragging}>
        <mesh castShadow>
          <cylinderGeometry args={[0.015, 0.015, 0.45, 10]} />
          <meshStandardMaterial color={hovered ? "#f8fafc" : "#e2e8f0"} transparent opacity={0.7} />
        </mesh>
        <mesh position={[0, -0.24, 0]}>
          <sphereGeometry args={[0.03, 10, 10]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.3} />
        </mesh>
        <Html position={[0, 0.3, 0]} center distanceFactor={9} style={{ pointerEvents: "none" }}>
          <div
            data-testid="thermometer-reading"
            data-value={active?.data.temperatureC ?? 0}
            className="pointer-events-none rounded bg-black/80 px-2 py-1 font-mono text-[10px] text-emerald-400"
          >
            {(active?.data.temperatureC ?? 0).toFixed(1)}°C
          </div>
        </Html>
      </GrabLift>
      {hovered && !isDragging && <ToolHoverLabel tool={tool} y={0.5} />}
    </group>
  );
}

function ScaleMesh({ tool }: { tool: ToolItem }) {
  const { state } = useChemistryWorkspace();
  const { onPointerDown, isDragging } = useDragHandlers(tool.id);
  const [hovered, setHovered] = useState(false);
  const active = state.containers.find((c) => c.id === state.activeContainerId);
  const massG = active ? totalMassG(active.data) : 0;

  return (
    <group
      position={[tool.position[0], 0, tool.position[1]]}
      rotation={[0, tool.rotationY, 0]}
      onPointerDown={onPointerDown}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <Hitbox radius={0.35} height={0.3} />
      <GrabLift isDragging={isDragging}>
        <mesh castShadow>
          <boxGeometry args={[0.5, 0.08, 0.4]} />
          <meshStandardMaterial color={hovered ? "#334155" : "#1e293b"} metalness={0.5} roughness={0.4} />
        </mesh>
        <Html position={[0, 0.2, 0]} center distanceFactor={9} style={{ pointerEvents: "none" }}>
          <div
            data-testid="scale-reading"
            data-value={massG}
            className="pointer-events-none rounded bg-black/80 px-2 py-1 font-mono text-[10px] text-emerald-400"
          >
            {massG.toFixed(1)} г
          </div>
        </Html>
      </GrabLift>
      {hovered && !isDragging && <ToolHoverLabel tool={tool} y={0.35} />}
    </group>
  );
}

interface PourAnimationState {
  sourceId: string;
  targetId: string;
}

interface AddAnimationState {
  bottleId: string;
  targetId: string;
  substanceId: string;
}

function distance(a: [number, number], b: [number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
}

interface ChemistrySceneProps {
  onDrop: (id: string, x: number, z: number) => void;
  pourAnimation: PourAnimationState | null;
  addAnimation: AddAnimationState | null;
  safetyByContainer: Record<string, SafetyWarning[]>;
  debugMode: boolean;
}

// Interaction Debug Mode + Hazard Debug Mode (расширение того же
// dev-only оверлея, не отдельная параллельная система) — компактная
// сводка текущего состояния взаимодействия и реальных значений Hazard
// Engine поверх сцены. Ничего здесь не влияет на расчеты — оверлей
// только читает уже посчитанные данные.
function DebugOverlay({
  draggingId,
  snapTargetId,
  activeContainer,
  emergencyStopActive,
}: {
  draggingId: string | null;
  snapTargetId: string | null;
  activeContainer: ContainerItem;
  emergencyStopActive: boolean;
}) {
  const h = activeContainer.hazard;
  return (
    <Html fullscreen style={{ pointerEvents: "none" }}>
      <div className="absolute left-2 top-2 flex flex-col gap-0.5 rounded-md border border-cyan-400/40 bg-black/85 px-2 py-1 font-mono text-[10px] text-cyan-300">
        <div>
          drag: {draggingId ?? "—"} · snap: {snapTargetId ?? "—"} · active: {activeContainer.id}
        </div>
        <div className="text-amber-300">
          hazard: {h.level} · T={h.temperatureC.toFixed(1)}°C ({(h.temperatureRatio * 100).toFixed(0)}%) · P=
          {h.pressureKPa.toFixed(1)}kPa ({(h.pressureRatio * 100).toFixed(0)}%) · gas={h.gasAmountG.toFixed(2)}г · свободный
          объем={h.freeVolumeMl.toFixed(0)}мл · целостность={h.containerIntegrity.level} · sealed=
          {activeContainer.isSealed ? "да" : "нет"} · e-stop={emergencyStopActive ? "АКТИВЕН" : "нет"}
        </div>
        {h.causes.length > 0 && <div className="text-red-300">причины: {h.causes.map((c) => c.code).join(", ")}</div>}
      </div>
    </Html>
  );
}

const HAZARD_TICK_INTERVAL_S = 0.4;

function ChemistryScene({ onDrop, pourAnimation, addAnimation, safetyByContainer, debugMode }: ChemistrySceneProps) {
  const { state, heatTick, hazardTick } = useChemistryWorkspace();
  const { draggingId } = useChemistryDrag();
  const hazardAccumRef = useRef(0);

  useFrame((_, delta) => {
    const burnerOn = state.tools.some((t) => t.kind === "burner" && t.isOn);
    if (burnerOn) heatTick(delta * HEAT_RATE_C_PER_SEC);

    // Hazard Engine — контролируемый шаг симуляции, НЕ каждый кадр рендера:
    // копим прошедшее время и запускаем реальный расчет раз в ~0.4с
    hazardAccumRef.current += delta;
    if (hazardAccumRef.current >= HAZARD_TICK_INTERVAL_S) {
      hazardTick(hazardAccumRef.current);
      hazardAccumRef.current = 0;
    }
  });

  // зона приема подсвечивается заранее, пока перетаскиваемый предмет еще
  // над столом и не отпущен — тот же радиус, что и реальная логика сброса
  // в handleDrop, чтобы подсветка никогда не расходилась с фактическим
  // поведением
  const snapTargetId = useMemo(() => {
    if (!draggingId) return null;
    const draggedContainer = state.containers.find((c) => c.id === draggingId);
    const draggedBottle = state.stockBottles.find((b) => b.id === draggingId);
    const draggedPos = draggedContainer?.position ?? draggedBottle?.position;
    if (!draggedPos) return null;
    let nearestId: string | null = null;
    let nearestDist = DROP_PROXIMITY_RADIUS;
    for (const c of state.containers) {
      if (c.id === draggingId) continue;
      const d = distance(c.position, draggedPos);
      if (d < nearestDist) {
        nearestDist = d;
        nearestId = c.id;
      }
    }
    return nearestId;
  }, [draggingId, state.containers, state.stockBottles]);

  const pourStream = useMemo(() => {
    if (pourAnimation) {
      const source = state.containers.find((c) => c.id === pourAnimation.sourceId);
      const target = state.containers.find((c) => c.id === pourAnimation.targetId);
      if (source && target) return { from: source.position, to: target.position, colorHex: computeColorHex(source.data) };
    }
    if (addAnimation) {
      const bottle = state.stockBottles.find((b) => b.id === addAnimation.bottleId);
      const target = state.containers.find((c) => c.id === addAnimation.targetId);
      if (bottle && target) return { from: bottle.position, to: target.position, colorHex: SUBSTANCES[bottle.substanceId]?.colorHex ?? "#94a3b8" };
    }
    return null;
  }, [pourAnimation, addAnimation, state.containers, state.stockBottles]);

  return (
    <ChemistryDebugContext.Provider value={debugMode}>
      <group>
        <directionalLight position={[2, 4, 3]} intensity={0.4} color="#fff7ed" />
        <pointLight position={[-2, 2.5, 2]} intensity={0.2} color="#e0f2fe" distance={8} decay={2} />

        <Workbench />

        {state.containers.map((c) => (
          <ContainerMesh
            key={c.id}
            item={c}
            isSnapTarget={c.id === snapTargetId}
            isUnsafe={(safetyByContainer[c.id]?.length ?? 0) > 0}
            isPouring={pourAnimation?.sourceId === c.id}
          />
        ))}
        {state.stockBottles.map((b) => (
          <StockBottleMesh key={b.id} bottle={b} isPouring={addAnimation?.bottleId === b.id} />
        ))}
        {state.tools.map((t) => {
          if (t.kind === "burner") return <BurnerMesh key={t.id} tool={t} />;
          if (t.kind === "stand") return <StandMesh key={t.id} tool={t} />;
          if (t.kind === "pipette") return <PipetteMesh key={t.id} tool={t} />;
          if (t.kind === "thermometer") return <ThermometerMesh key={t.id} tool={t} />;
          if (t.kind === "scale") return <ScaleMesh key={t.id} tool={t} />;
          return null;
        })}

        {pourStream && <PourStream from={pourStream.from} to={pourStream.to} colorHex={pourStream.colorHex} />}

        {debugMode &&
          (() => {
            const activeContainer = state.containers.find((c) => c.id === state.activeContainerId);
            return activeContainer ? (
              <DebugOverlay
                draggingId={draggingId}
                snapTargetId={snapTargetId}
                activeContainer={activeContainer}
                emergencyStopActive={state.emergencyStop !== null}
              />
            ) : null;
          })()}

        <DragSurface onDrop={onDrop} />
      </group>
    </ChemistryDebugContext.Provider>
  );
}

// пока ученик тащит оборудование, OrbitControls должен быть выключен —
// иначе тот же pointer-жест еще и крутит камеру (тот же прием, что
// ElectricityCanvas/orbitEnabled={!draggingFrom} в Electricity Lab)
function ChemistryCanvas({
  quality,
  onDrop,
  pourAnimation,
  addAnimation,
  safetyByContainer,
  debugMode,
  shakeCounter,
  reducedMotion,
}: {
  quality: QualityLevel;
  shakeCounter: number;
  reducedMotion: boolean;
} & ChemistrySceneProps) {
  const { draggingId } = useChemistryDrag();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const prevShakeCounter = useRef(shakeCounter);

  // контролируемая тряска камеры при взрыве/разрыве — чистый CSS-transform
  // на DOM-обертке канваса, НЕ трогает камеру Three.js/OrbitControls
  // напрямую (никакого конфликта с орбитальным управлением), короткая
  // (400мс) и полностью отключается при prefers-reduced-motion
  useEffect(() => {
    if (shakeCounter === prevShakeCounter.current) return;
    prevShakeCounter.current = shakeCounter;
    if (reducedMotion) return;
    const el = wrapperRef.current;
    if (!el) return;
    const start = performance.now();
    const duration = 400;
    let frameId: number;
    function tick(now: number) {
      const t = (now - start) / duration;
      if (t >= 1) {
        if (el) el.style.transform = "";
        return;
      }
      const mag = (1 - t) * 8;
      if (el) el.style.transform = `translate(${(Math.random() - 0.5) * mag}px, ${(Math.random() - 0.5) * mag}px)`;
      frameId = requestAnimationFrame(tick);
    }
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [shakeCounter, reducedMotion]);

  return (
    <div ref={wrapperRef}>
      <CanvasShell
        cameraPosition={[0, 4.2, 5.6]}
        target={[0, 0, 0]}
        floorY={-0.1}
        bloomIntensity={0.3}
        quality={quality}
        orbitEnabled={!draggingId}
        minPolarAngle={Math.PI / 8}
        maxPolarAngle={Math.PI / 2.3}
      >
        <ChemistryScene
          onDrop={onDrop}
          pourAnimation={pourAnimation}
          addAnimation={addAnimation}
          safetyByContainer={safetyByContainer}
          debugMode={debugMode}
        />
      </CanvasShell>
    </div>
  );
}

const QUALITY_OPTIONS: QualityLevel[] = ["low", "medium", "high"];
const QUALITY_LABEL: Record<QualityLevel, string> = { low: "Низкое", medium: "Среднее", high: "Высокое" };

// AI Teacher (Chemistry World): собирает ChemistryAIContext из уже
// посчитанного Chemistry/Reaction Engine + Experiment Validator + Safety
// System — рендерится внутри ExperimentProgressProvider
function ChemistryTeacherChatPanel({ simulationId, safetyWarnings }: { simulationId: string; safetyWarnings: SafetyWarning[] }) {
  const { state } = useChemistryWorkspace();
  const { experiment, status: experimentStatus, result } = useExperimentProgress();
  const { mode, selectedExperiment, currentStep, isCurrentStepUnlocked, completedExperimentIds, recordHintUsed } = useChemistryLabExperience();
  const activeContainer = state.containers.find((c) => c.id === state.activeContainerId);
  const occurredReactionIds = useMemo(
    () => state.reactionLog.filter((e) => e.containerId === state.activeContainerId).map((e) => e.reactionId),
    [state.reactionLog, state.activeContainerId]
  );

  const context = useMemo(
    () =>
      activeContainer
        ? buildChemistryAIContext({
            experiment,
            experimentStatus,
            container: activeContainer.data,
            occurredReactionIds,
            validation: result,
            safetyWarnings,
            hazard: activeContainer.hazard,
            accidentLog: state.accidentLog,
            labMode: mode,
            labExperiment: selectedExperiment,
            labStep: currentStep,
            labStepUnlocked: isCurrentStepUnlocked,
            labCompletedExperimentIds: completedExperimentIds,
          })
        : null,
    [
      experiment,
      experimentStatus,
      activeContainer,
      occurredReactionIds,
      result,
      safetyWarnings,
      state.accidentLog,
      mode,
      selectedExperiment,
      currentStep,
      isCurrentStepUnlocked,
      completedExperimentIds,
    ]
  );

  if (!context) return null;
  return <ChemistryTeacherChat simulationId={simulationId} context={context} onMessageSent={recordHintUsed} />;
}

interface ChemistryWorldSceneProps {
  simulation: Simulation;
}

export default function ChemistryWorldScene({ simulation }: ChemistryWorldSceneProps) {
  return (
    <ChemistryWorkspaceProvider>
      <ChemistryWorldInner simulation={simulation} />
    </ChemistryWorkspaceProvider>
  );
}

const POUR_ANIMATION_MS = 750;

function ChemistryWorldInner({ simulation }: ChemistryWorldSceneProps) {
  const { state, addSubstanceToContainer, pourInto, moveItem, setActiveContainer, resetExperiment } = useChemistryWorkspace();
  const { quality, setQuality } = useQuality();
  const [pourAnimation, setPourAnimation] = useState<PourAnimationState | null>(null);
  const [addAnimation, setAddAnimation] = useState<AddAnimationState | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [muted, setMuted] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const activeContainer = state.containers.find((c) => c.id === state.activeContainerId) ?? state.containers[0];
  const occurredReactionIds = useMemo(
    () => state.reactionLog.filter((e) => e.containerId === activeContainer.id).map((e) => e.reactionId),
    [state.reactionLog, activeContainer.id]
  );

  // считаем Safety System на каждый сосуд отдельно (не только активный) —
  // подсветка в 3D должна показывать опасность там, где она реально есть,
  // а не только в том сосуде, который сейчас проверяет Experiment Validator
  const safetyByContainer = useMemo(() => {
    const map: Record<string, SafetyWarning[]> = {};
    state.containers.forEach((c) => {
      map[c.id] = checkSafety({ container: c.data, firstAddedOrder: state.firstAddedOrder[c.id] });
    });
    return map;
  }, [state.containers, state.firstAddedOrder]);
  const safetyWarnings = useMemo(() => safetyByContainer[activeContainer.id] ?? [], [safetyByContainer, activeContainer.id]);

  // Stage 5.6 — Guided Laboratory System: единый контекст для проверки
  // шагов/завершения эксперимента, собранный целиком из уже посчитанных
  // данных (никаких новых вычислений физики/химии здесь)
  const allOccurredReactionIds = useMemo(() => state.reactionLog.map((e) => e.reactionId), [state.reactionLog]);
  const labStepContext: LabStepContext = useMemo(
    () => ({
      activeContainerId: activeContainer.id,
      activeContainer: activeContainer.data,
      isSealed: activeContainer.isSealed,
      isOnStand: isContainerOnStand(activeContainer, state.tools),
      burnerOn: state.tools.some((t) => t.kind === "burner" && t.isOn),
      hazard: activeContainer.hazard,
      occurredReactionIds,
      allOccurredReactionIds,
      safetyWarnings,
      allContainers: state.containers.map((c) => ({ id: c.id, data: c.data })),
      pourLog: state.pourLog,
      maxTemperatureCObserved: activeContainer.data.temperatureC,
      maxPressureRatioObserved: activeContainer.hazard.pressureRatio,
    }),
    [activeContainer, state.tools, occurredReactionIds, allOccurredReactionIds, safetyWarnings, state.containers, state.pourLog]
  );

  // само переливание/добавление вещества откладывается на время визуальной
  // анимации (наклон + струя) — реальный расчет Chemistry/Reaction Engine
  // происходит один раз, ровно как и раньше, просто не в момент отпускания
  // мыши, а по завершении анимации
  useEffect(() => {
    if (!pourAnimation) return;
    const timer = setTimeout(() => {
      pourInto(pourAnimation.sourceId, pourAnimation.targetId);
      setPourAnimation(null);
    }, POUR_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [pourAnimation, pourInto]);

  useEffect(() => {
    if (!addAnimation) return;
    const timer = setTimeout(() => {
      addSubstanceToContainer(addAnimation.targetId, addAnimation.substanceId, 20);
      setAddAnimation(null);
    }, POUR_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [addAnimation, addSubstanceToContainer]);

  // звук успешной реакции — ровно по новым записям в state.reactionLog
  // (их туда пишет исключительно Reaction Engine), не по таймеру и не
  // по предположению
  const prevReactionCount = useRef(state.reactionLog.length);
  useEffect(() => {
    if (state.reactionLog.length > prevReactionCount.current) playReactionSuccess();
    prevReactionCount.current = state.reactionLog.length;
  }, [state.reactionLog.length]);

  // звук предупреждения — только когда появляется НОВЫЙ код опасности,
  // которого не было на предыдущем рендере (данные всегда из checkSafety())
  const prevWarningKeys = useRef<Set<string>>(new Set());
  useEffect(() => {
    const currentKeys = new Set<string>();
    Object.entries(safetyByContainer).forEach(([containerId, warnings]) => {
      warnings.forEach((w) => currentKeys.add(`${containerId}:${w.code}`));
    });
    let hasNew = false;
    currentKeys.forEach((key) => {
      if (!prevWarningKeys.current.has(key)) hasNew = true;
    });
    if (hasNew) playSafetyWarning();
    prevWarningKeys.current = currentKeys;
  }, [safetyByContainer]);

  // цикл "кипения" — идет, пока хотя бы один сосуд реально находится в
  // газовой фазе (aggregateStateOf), останавливается сам, как только это
  // перестает быть так
  const anyBoiling = state.containers.some((c) => aggregateStateOf(c.data) === "gas");
  useEffect(() => {
    if (!anyBoiling) return;
    const stop = startBoilingLoop();
    return stop;
  }, [anyBoiling]);

  // Emergency Stop — часть состояния симуляции (не только оверлей): как
  // только он сработал, немедленно корректно завершаем текущую визуальную
  // анимацию переливания/добавления (реальный дозвон в reducer уже
  // заблокирован там же, но визуально наклон должен вернуться в исходное
  // положение сразу, а не доиграть до конца)
  useEffect(() => {
    if (state.emergencyStop) {
      setPourAnimation(null);
      setAddAnimation(null);
    }
  }, [state.emergencyStop]);

  // аварийная сирена — управляемый цикл, идет пока Emergency Stop активен
  const emergencyActive = state.emergencyStop !== null;
  useEffect(() => {
    if (!emergencyActive) return;
    const stop = startEmergencyAlarm();
    return stop;
  }, [emergencyActive]);

  // тряска камеры — только по факту реального события "shockwave" из
  // HazardResult (не по любому рендеру), см. ChemistryCanvas
  const anyShockwaveNow = state.containers.some((c) => c.hazard.visualEvents.some((e) => e.type === "shockwave"));
  const [shakeCounter, setShakeCounter] = useState(0);
  useEffect(() => {
    if (anyShockwaveNow) setShakeCounter((v) => v + 1);
  }, [anyShockwaveNow]);

  useEffect(() => {
    setSoundMuted(muted);
  }, [muted]);

  function handleDrop(id: string, x: number, z: number) {
    if (state.emergencyStop) return; // новые лабораторные действия заблокированы во время аварии
    const point: [number, number] = [x, z];

    const draggedContainer = state.containers.find((c) => c.id === id);
    if (draggedContainer) {
      const target = state.containers.find((c) => c.id !== id && distance(c.position, point) < DROP_PROXIMITY_RADIUS);
      if (target) {
        playPour();
        setPourAnimation({ sourceId: id, targetId: target.id });
        return;
      }
      moveItem(id, point);
      return;
    }

    const draggedBottle = state.stockBottles.find((b) => b.id === id);
    if (draggedBottle) {
      const target = state.containers.find((c) => distance(c.position, point) < DROP_PROXIMITY_RADIUS);
      if (target) {
        playPour();
        setAddAnimation({ bottleId: id, targetId: target.id, substanceId: draggedBottle.substanceId });
        return;
      }
      // бутылка возвращается на полку, если брошена не рядом с сосудом
      return;
    }

    moveItem(id, point);
  }

  return (
    <ChemistryLabExperienceProvider simulationId={simulation.id} stepContext={labStepContext}>
    <ChemistryTutorialProvider container={activeContainer.data}>
      <ExperimentProgressProvider labState={{ container: activeContainer.data, occurredReactionIds }}>
        <ChemistryDragProvider>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <div className="flex-1 rounded-2xl bg-gradient-to-b from-slate-900 via-slate-950 to-black p-3 sm:p-5">
              <ChemistryCanvas
                quality={quality}
                onDrop={handleDrop}
                pourAnimation={pourAnimation}
                addAnimation={addAnimation}
                safetyByContainer={safetyByContainer}
                debugMode={debugMode}
                shakeCounter={shakeCounter}
                reducedMotion={reducedMotion}
              />

              <AnimatePresence>
                {state.emergencyStop && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mt-4 rounded-2xl border border-red-500/60 bg-red-950/40 p-4"
                    data-testid="emergency-stop-panel"
                  >
                    <div className="mb-2 flex items-center gap-2 text-red-300">
                      <AlertOctagon size={20} />
                      <span className="font-mono text-sm font-semibold uppercase tracking-widest">
                        Аварийная остановка — {state.emergencyStop.level}
                      </span>
                    </div>
                    <ul className="mb-3 space-y-0.5 text-sm text-red-200" data-testid="emergency-stop-causes">
                      {state.emergencyStop.causes.map((cause) => (
                        <li key={cause.code}>⚠ {cause.message}</li>
                      ))}
                    </ul>
                    <p className="mb-3 text-xs text-red-300/80">
                      Эксперимент остановлен. Новые действия (добавление веществ, переливание, нагрев) заблокированы.
                    </p>
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={resetExperiment}
                      data-testid="emergency-stop-reset"
                      className="flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500"
                    >
                      <RotateCcw size={16} />
                      Сбросить эксперимент
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="glass-panel mt-4 grid grid-cols-1 gap-4 rounded-2xl p-4 sm:grid-cols-2">
                <div className="flex items-center gap-2 text-xs text-slate-500 sm:col-span-2">
                  Перетаскивай бутылки с реактивами на сосуды, сосуды — друг на друга (чтобы перелить), нажми на горелку,
                  чтобы включить нагрев. Выбранный сосуд отмечен фиолетовым кольцом — именно его проверяет текущий
                  эксперимент. Выбери сосуд, чтобы запечатать его (иконка замка) — герметичный сосуд накапливает
                  давление при кипении.
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500 sm:col-span-2">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setMuted((v) => !v)}
                    data-testid="sound-mute-toggle"
                    title={muted ? "Включить звук" : "Отключить звук"}
                    className={`flex items-center gap-1 rounded-full border px-3 py-1 transition ${
                      muted ? "border-glass-border text-slate-500" : "border-neon-violet/50 text-neon-violet"
                    }`}
                  >
                    {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    {muted ? "Звук выключен" : "Звук включен"}
                  </motion.button>

                  {process.env.NODE_ENV !== "production" && (
                    <button
                      onClick={() => setDebugMode((v) => !v)}
                      data-testid="debug-mode-toggle"
                      className={`rounded-full border px-3 py-1 font-mono uppercase transition ${
                        debugMode ? "border-cyan-400 text-cyan-300" : "border-glass-border text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      Interaction Debug Mode: {debugMode ? "on" : "off"}
                    </button>
                  )}
                </div>

                <ChemistryTutorialPanel />

                <div className="sm:col-span-2">
                  <label className="mb-1 block font-mono text-xs uppercase tracking-widest text-slate-400">
                    Активный сосуд (проверяется экспериментом)
                  </label>
                  <div className="flex gap-2">
                    {state.containers.map((c) => (
                      <motion.button
                        key={c.id}
                        whileHover={{ scale: 1.06 }}
                        whileTap={{ scale: 0.94 }}
                        onClick={() => setActiveContainer(c.id)}
                        data-testid={`select-active-${c.id}`}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                          state.activeContainerId === c.id
                            ? "border-neon-violet text-neon-violet"
                            : "border-glass-border text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {c.kind === "test_tube" ? "Пробирка" : c.kind === "flask" ? "Колба" : "Стакан"}
                      </motion.button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1 font-mono text-xs text-slate-500 sm:col-span-2">
                  {QUALITY_OPTIONS.map((level) => (
                    <motion.button
                      key={level}
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.92 }}
                      onClick={() => setQuality(level)}
                      data-testid={`quality-${level}`}
                      title={QUALITY_LABEL[level]}
                      className={`rounded-full border px-2 py-1 uppercase transition ${
                        quality === level
                          ? "border-neon-violet text-neon-violet"
                          : "border-glass-border text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {level[0]}
                    </motion.button>
                  ))}
                </div>

                <AnimatePresence>
                  {safetyWarnings.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.18 }}
                      className="flex flex-col gap-2 sm:col-span-2"
                      data-testid="safety-warnings"
                    >
                      {safetyWarnings.map((w) => (
                        <motion.div
                          key={w.code}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${
                            w.severity === "danger"
                              ? "border-red-400/40 bg-red-500/10 text-red-300"
                              : "border-amber-400/40 bg-amber-500/10 text-amber-200"
                          }`}
                          data-testid={`safety-warning-${w.code}`}
                        >
                          <Flame size={14} className="shrink-0" />
                          {w.message}
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="sm:col-span-2">
                  <ExperimentPanel />
                </div>

                {/* Stage 5.6 — Guided Laboratory System: отдельная, более
                    богатая учебная надстройка поверх существующей лаборатории.
                    Не заменяет ExperimentPanel выше (тот продолжает работать
                    как раньше) — это дополнительный слой: каталог из 12
                    экспериментов, режимы обучения, пошаговое руководство,
                    оценка и Лабораторный журнал. */}
                <div className="space-y-4 sm:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-headline text-lg font-semibold text-slate-100">Учебная лаборатория</h3>
                    <LabModeSelector />
                  </div>
                  <GuidedLabExperienceSection />
                  <LabNotebookPanel />
                </div>
              </div>
            </div>

            <ChemistryTeacherChatPanel simulationId={simulation.id} safetyWarnings={safetyWarnings} />
          </div>
        </ChemistryDragProvider>
      </ExperimentProgressProvider>
    </ChemistryTutorialProvider>
    </ChemistryLabExperienceProvider>
  );
}

// переключает каталог/пошаговую панель в зависимости от того, выбран ли
// сейчас эксперимент — и всегда показывает CompletionScreen поверх, если
// только что был завершен эксперимент
function GuidedLabExperienceSection() {
  const { selectedExperiment, lastAssessment } = useChemistryLabExperience();
  return (
    <>
      {lastAssessment && <CompletionScreen />}
      {selectedExperiment ? <GuidedLabPanel /> : <ExperimentCatalogBrowser />}
    </>
  );
}
