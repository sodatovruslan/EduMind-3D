"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, Html, useGLTF } from "@react-three/drei";
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
import {
  ChemistryInteractionProvider,
  useCabinetInteractable,
  useChemistryInteraction,
  useInteractable,
} from "@/components/core/ChemistryInteractionProvider";
import { getInteractable } from "@/lib/interactables";
import { CABINET_REGISTRY, getCabinet, type CabinetConfig } from "@/lib/cabinets";
import { findSlotsForCabinet, getSlot } from "@/lib/storage-slots";
import { suppressRaycastTree } from "@/lib/interaction-raycast";
import {
  TABLE_SURFACE,
  isPlacementValid,
  getFootprintRadius,
  STOCK_BOTTLE_FOOTPRINT_RADIUS,
  type PlacementOccupant,
} from "@/lib/placement-surfaces";
import { ChemistryTutorialProvider } from "@/components/tutorial/ChemistryTutorialProvider";
import ChemistryTutorialPanel from "@/components/tutorial/ChemistryTutorialPanel";
import { ExperimentProgressProvider, useExperimentProgress } from "@/components/experiments/ExperimentProgressProvider";
import ExperimentPanel from "@/components/experiments/ExperimentPanel";
import ChemistryTeacherChat from "@/components/ai/ChemistryTeacherChat";
import { SUBSTANCES, aggregateStateOf, computeColorHex, totalMassG, totalVolumeMl, type AggregateState } from "@/lib/chemistry-engine";
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
const STOCK_POUR_GRAMS_BY_SUBSTANCE: Record<string, number> = { water: 100 };
const DEFAULT_STOCK_POUR_GRAMS = 20;
const GRAB_LIFT_HEIGHT = 0.14;
const GRAB_LIFT_SPEED = 10; // 1/сек, скорость lerp подъема при захвате/отпускании

// TOOL_LABEL — общие подписи для hover-подсказок над инструментами (не
// дублируется с MODULE_LABEL из LessonCard — это не модули, а предметы стола)
const TOOL_LABEL: Record<string, string> = {
  burner: "Горелка",
  stand: "Штатив",
  pipette: "Пипетка",
  thermometer: "Термометр",
  glass_rod: "Стеклянная палочка",
  scale: "Весы",
};

const CONTAINER_LABEL: Record<string, string> = {
  test_tube: "Пробирка",
  flask: "Колба",
  beaker: "Стакан",
};

// Stage C-3 (реализм + переиспользуемость): вместо кода "как нарисовать
// стакан" — общая библиотека стеклянных профилей (GLASS_LIBRARY) и один
// рендер-компонент (GlassObject), который умеет показать ЛЮБОЙ профиль из
// библиотеки: настоящую форму стекла через LatheGeometry (точки профиля
// вращаются вокруг оси Y), жидкость, осадок — единообразно. Добавить новый
// вид сосуда в будущем — это только новая запись в GLASS_LIBRARY, без нового
// кода рендера. halfHeight каждого профиля — то же число, что и раньше в
// ContainerMesh (0.25/0.2/0.21 для test_tube/beaker/flask) — оно завязано на
// позиции жидкости/осадка/колец/хитбокса в ContainerMesh и НЕ меняется,
// меняется только форма стекла внутри той же общей высоты.
function latheGeometry(points: Array<[number, number]>, segments = 28): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    points.map(([x, y]) => new THREE.Vector2(x, y)),
    segments
  );
}

export interface GlassProfile {
  geometry: THREE.LatheGeometry;
  halfHeight: number;
  liquidRadius: number;
  precipitateRadius: number;
  label: string;
}

// GLASS_LIBRARY — общая библиотека стеклянной посуды для всего Chemistry
// World. test_tube/beaker/flask сейчас реально используются ContainerMesh
// (это существующие виды сосудов на столе, item.kind в ChemistryWorkspace-
// Provider). graduated_cylinder/round_flask/volumetric_flask — готовые
// профили на будущее: чтобы реально появились на столе как новые
// перетаскиваемые предметы, ContainerVisualKind в ChemistryWorkspaceProvider
// нужно расширить этими значениями (отдельный шаг, не сделан сейчас
// сознательно — это меняет форму данных, а не только визуал).
export const GLASS_LIBRARY: Record<string, GlassProfile> = {
  test_tube: {
    label: "Пробирка",
    halfHeight: 0.25,
    liquidRadius: 0.075,
    precipitateRadius: 0.065,
    geometry: latheGeometry([
      [0, -0.25],
      [0.04, -0.248],
      [0.075, -0.235],
      [0.088, -0.21],
      [0.09, -0.18],
      [0.09, 0.21],
      [0.086, 0.23],
      [0.093, 0.25],
    ]),
  },
  beaker: {
    label: "Стакан",
    halfHeight: 0.2,
    liquidRadius: 0.21,
    precipitateRadius: 0.19,
    geometry: latheGeometry([
      [0.22, -0.2],
      [0.222, -0.19],
      [0.235, -0.05],
      [0.245, 0.08],
      [0.255, 0.15],
      [0.258, 0.18],
      [0.245, 0.195],
      [0.25, 0.2],
    ]),
  },
  flask: {
    label: "Колба",
    halfHeight: 0.21,
    liquidRadius: 0.21,
    precipitateRadius: 0.19,
    geometry: latheGeometry([
      [0.24, -0.21],
      [0.24, -0.14],
      [0.2, -0.05],
      [0.13, 0.06],
      [0.075, 0.13],
      [0.055, 0.16],
      [0.055, 0.19],
      [0.065, 0.21],
    ]),
  },
  // ниже — готовые профили без активного предмета на столе (см. комментарий
  // к GLASS_LIBRARY выше)
  graduated_cylinder: {
    label: "Мерный цилиндр",
    halfHeight: 0.28,
    liquidRadius: 0.095,
    precipitateRadius: 0.085,
    geometry: latheGeometry([
      [0.1, -0.28],
      [0.11, -0.27],
      [0.115, 0.2],
      [0.11, 0.25],
      [0.13, 0.27],
      [0.125, 0.28],
    ]),
  },
  round_flask: {
    label: "Круглодонная колба",
    halfHeight: 0.24,
    liquidRadius: 0.18,
    precipitateRadius: 0.16,
    geometry: latheGeometry([
      [0, -0.22],
      [0.12, -0.2],
      [0.2, -0.1],
      [0.2, 0.02],
      [0.1, 0.1],
      [0.045, 0.15],
      [0.045, 0.22],
      [0.055, 0.24],
    ]),
  },
  volumetric_flask: {
    label: "Мерная колба",
    halfHeight: 0.26,
    liquidRadius: 0.19,
    precipitateRadius: 0.17,
    geometry: latheGeometry([
      [0.03, -0.22],
      [0.15, -0.21],
      [0.2, -0.1],
      [0.2, 0],
      [0.09, 0.09],
      [0.035, 0.14],
      [0.035, 0.24],
      [0.045, 0.26],
    ]),
  },
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

// Stage C-3: большой удобный рабочий стол — приоритет свободное пространство,
// не компактность. Реальные предметы стола (containers/bottles/tools) живут
// в X:[-3.2,2.6], Z:[-1.6,1.4] (см. createInitialState в
// ChemistryWorkspaceProvider) — эти координаты НЕ трогаем (интерактив/физика),
// столешница просто щедро больше их разброса со всех сторон.
function Workbench() {
  const texture = useLabBenchTexture();
  return (
    <mesh position={[0, -0.05, 0]} receiveShadow>
      <boxGeometry args={[9, 0.1, 4.2]} />
      <meshStandardMaterial map={texture} roughness={0.65} metalness={0.05} />
    </mesh>
  );
}

// Stage C-2 (Visual Realism Upgrade): процедурная плитка пола — тот же
// CanvasTexture-прием, что и у столешницы, отдельная реализация под
// шахматный кафель вместо зерна дерева
function useLabFloorTexture() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const tile = 64;
      for (let y = 0; y < 512; y += tile) {
        for (let x = 0; x < 512; x += tile) {
          const even = ((x / tile) | 0) % 2 === ((y / tile) | 0) % 2;
          ctx.fillStyle = even ? "#d8dce2" : "#c3c8d1";
          ctx.fillRect(x, y, tile, tile);
        }
      }
      ctx.strokeStyle = "rgba(148,163,184,0.35)";
      ctx.lineWidth = 2;
      for (let i = 0; i <= 512; i += tile) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 512);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(512, i);
        ctx.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(5, 4);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

// процедурная покраска стен — светлая штукатурка с легким шумом, без
// внешних текстур/сетевых запросов (тот же прием, что и у пола/стола)
function useLabWallTexture() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#eef1f5";
      ctx.fillRect(0, 0, 512, 256);
      for (let i = 0; i < 4000; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 256;
        const shade = 200 + Math.random() * 30;
        ctx.fillStyle = `rgba(${shade},${shade + 2},${shade + 6},0.15)`;
        ctx.fillRect(x, y, 1, 1);
      }
      // нижний бордюр — кафельная "юбка" вдоль стены, как в реальной лаборатории
      ctx.fillStyle = "#c7ccd6";
      ctx.fillRect(0, 200, 512, 56);
      ctx.strokeStyle = "rgba(100,110,130,0.3)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= 512; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 200);
        ctx.lineTo(x, 256);
        ctx.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 1);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

// процедурное дерево для шкафов/полок — теплый ламинат под дуб
function useCabinetWoodTexture() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#8a5a34";
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 40; i++) {
        const y = Math.random() * 256;
        ctx.strokeStyle = `rgba(60,35,18,${0.15 + Math.random() * 0.2})`;
        ctx.lineWidth = 1 + Math.random() * 2;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(64, y + (Math.random() - 0.5) * 20, 192, y + (Math.random() - 0.5) * 20, 256, y);
        ctx.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 1);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

// Stage C-3 (эргономика): комната уменьшена и подогнана вплотную к столу
// Stage C-3 (пересмотр после отзыва — приоритет простора, не тесноты):
// комната достаточно большая, чтобы камера свободно вращалась и приближалась/
// отдалялась в разумных пределах (см. minDistance/maxDistance/azimuth в
// ChemistryCanvas ниже) и НИКОГДА не пересекала боковые/заднюю стены —
// ROOM_HALF_WIDTH/DEPTH подобраны так, чтобы худший случай (макс. дистанция
// камеры × макс. допустимые polar/azimuth углы) оставался внутри с запасом.
const ROOM_HALF_WIDTH = 7.0;
const ROOM_HALF_DEPTH = 3.2;
const ROOM_HEIGHT = 3.0;
const ROOM_FLOOR_Y = -0.1;
// пол/боковые стены тянутся вперед (к зрителю, +Z) намного дальше половины
// глубины комнаты — с этой стороны нет стены (открытая сторона для камеры),
// но камера все равно должна видеть пол/стены под собой на всей дистанции,
// на которую ей позволено отъехать (см. maxDistance) — иначе там, где раньше
// стояла камера, открывался бы черный "провал" в полу
const ROOM_FRONT_REACH = 8.0;
const ROOM_Z_LENGTH = ROOM_HALF_DEPTH + ROOM_FRONT_REACH;
const ROOM_Z_CENTER = (ROOM_FRONT_REACH - ROOM_HALF_DEPTH) / 2;

// Stage C-2 (Visual Realism Upgrade): помещение вокруг рабочего стола —
// пол/стены/потолок/шкафы/потолочные светильники. Полностью декоративно —
// не участвует ни в DragSurface, ни в снапе, ни в физике; предметы стола
// (containers/bottles/tools) продолжают жить в тех же мировых координатах,
// что и раньше, комната просто обрамляет ту же самую рабочую зону.
// Stage C-3: страховка поверх геометрических допусков OrbitControls (см.
// расчет у ROOM_HALF_WIDTH/DEPTH) — если камера все же окажется ближе
// FADE_START к стене (не должно случаться при штатных minDistance/
// maxDistance/azimuth, но дешево подстраховаться), эта стена плавно
// прозрачнеет, а не "хлопает" перед лицом пользователя. Порог отсчитан
// от плоскости стены, а не от центра комнаты.
const WALL_FADE_START = 1.1;
const WALL_FADE_END = 0.25;

function useWallProximityFade() {
  const backRef = useRef<THREE.MeshStandardMaterial>(null);
  const leftRef = useRef<THREE.MeshStandardMaterial>(null);
  const rightRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(({ camera }) => {
    const fade = (distanceToWall: number) => {
      const t = (distanceToWall - WALL_FADE_END) / (WALL_FADE_START - WALL_FADE_END);
      return Math.max(0.08, Math.min(1, t));
    };
    const backDist = camera.position.z - -ROOM_HALF_DEPTH;
    const leftDist = camera.position.x - -ROOM_HALF_WIDTH;
    const rightDist = ROOM_HALF_WIDTH - camera.position.x;
    if (backRef.current) backRef.current.opacity = fade(backDist);
    if (leftRef.current) leftRef.current.opacity = fade(leftDist);
    if (rightRef.current) rightRef.current.opacity = fade(rightDist);
  });

  return { backRef, leftRef, rightRef };
}

function CabinetMesh({ config, woodTexture }: { config: CabinetConfig; woodTexture: THREE.Texture }) {
  const interaction = useCabinetInteractable(config.id);
  const { state: workspace } = useChemistryWorkspace();
  const doorRef = useRef<THREE.Group>(null);
  const isOpen = interaction.state?.isOpen ?? false;

  useFrame((_, delta) => {
    if (!doorRef.current) return;
    const target = isOpen ? config.doorOpenAngleRad : 0;
    doorRef.current.rotation.y += (target - doorRef.current.rotation.y) * Math.min(1, delta * 7);
  });

  const focus = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    interaction.pointerHandlers?.onPointerOver();
  };
  const blur = () => interaction.pointerHandlers?.onPointerOut();
  const select = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    interaction.pointerHandlers?.onPointerOver();
  };
  const materialColor = interaction.isFocused ? "#b9783f" : "#8a5a34";
  const occupiedSlotIds = new Set(
    [...workspace.containers, ...workspace.stockBottles, ...workspace.tools]
      .map((item) => item.storageSlotId)
      .filter((slotId): slotId is string => slotId !== null)
  );

  return (
    <group position={config.worldPosition}>
      <mesh position={[-0.52, 0, 0.015]} castShadow receiveShadow onPointerOver={focus} onPointerOut={blur} onPointerDown={select}>
        <boxGeometry args={[0.06, config.size[1], 0.52]} />
        <meshStandardMaterial map={woodTexture} color={materialColor} roughness={0.55} metalness={0.1} />
      </mesh>
      <mesh position={[0.52, 0, 0.015]} castShadow receiveShadow onPointerOver={focus} onPointerOut={blur} onPointerDown={select}>
        <boxGeometry args={[0.06, config.size[1], 0.52]} />
        <meshStandardMaterial map={woodTexture} color={materialColor} roughness={0.55} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.32, 0.015]} castShadow receiveShadow onPointerOver={focus} onPointerOut={blur} onPointerDown={select}>
        <boxGeometry args={[0.98, 0.06, 0.52]} />
        <meshStandardMaterial map={woodTexture} color={materialColor} roughness={0.55} metalness={0.1} />
      </mesh>
      <mesh position={[0, -0.32, 0.015]} castShadow receiveShadow onPointerOver={focus} onPointerOut={blur} onPointerDown={select}>
        <boxGeometry args={[0.98, 0.06, 0.52]} />
        <meshStandardMaterial map={woodTexture} color={materialColor} roughness={0.55} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0, -0.245]} castShadow receiveShadow>
        <boxGeometry args={[0.98, 0.58, 0.06]} />
        <meshStandardMaterial map={woodTexture} color="#6f472b" roughness={0.62} metalness={0.05} />
      </mesh>
      <mesh
        position={[0, config.shelfLocalY, 0.015]}
        castShadow
        receiveShadow
        onPointerOver={focus}
        onPointerOut={blur}
        onPointerDown={select}
      >
        <boxGeometry args={[0.98, 0.04, 0.52]} />
        <meshStandardMaterial map={woodTexture} color={materialColor} roughness={0.58} metalness={0.05} />
      </mesh>

      <group ref={doorRef} position={[-0.51, 0, 0.28]}>
        <mesh position={[0.51, 0, 0]} onPointerOver={focus} onPointerOut={blur} onPointerDown={select} castShadow>
          <boxGeometry args={config.doorHitboxSize} />
          <meshStandardMaterial
            color="#5c3a20"
            emissive={interaction.isFocused ? "#f59e0b" : "#000000"}
            emissiveIntensity={interaction.isFocused ? 0.28 : 0}
            roughness={0.4}
            metalness={0.15}
          />
        </mesh>
        <mesh position={[0.91, 0, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.12, 8]} />
          <meshStandardMaterial color="#d4d4d8" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>

      <Html position={[0, 0.42, 0.32]} center style={{ pointerEvents: "none" }}>
        <span
          data-testid={`cabinet-state-${config.id}`}
          data-open={isOpen ? "true" : "false"}
          data-focused={interaction.isFocused ? "true" : "false"}
          className="block h-px w-px opacity-0"
        />
        {config.id === "cabinet-left-inner" && (
          <span
            data-testid="spike-cabinet-state"
            data-open={isOpen ? "true" : "false"}
            data-focused={interaction.isFocused ? "true" : "false"}
            className="block h-px w-px opacity-0"
          />
        )}
      </Html>
      <Html position={[0, 0, 0.32]} center style={{ pointerEvents: "none" }}>
        <span
          data-testid={`cabinet-door-target-${config.id}`}
          className="block h-px w-px opacity-0"
        />
        {config.id === "cabinet-left-inner" && (
          <span
            data-testid="spike-cabinet-door-target"
            className="block h-px w-px opacity-0"
          />
        )}
      </Html>
      {findSlotsForCabinet(config.id).map((slot) => (
        <Html
          key={slot.id}
          position={[
            slot.position[0] - config.worldPosition[0],
            slot.elevation - config.worldPosition[1],
            slot.position[1] - config.worldPosition[2],
          ]}
          center
          style={{ pointerEvents: "none" }}
        >
          <span
            data-testid={`storage-slot-${slot.id}`}
            data-occupied={occupiedSlotIds.has(slot.id) ? "true" : "false"}
            className="block h-px w-px opacity-0"
          />
        </Html>
      ))}
    </group>
  );
}

function Room() {
  const floorTex = useLabFloorTexture();
  const wallTex = useLabWallTexture();
  const woodTex = useCabinetWoodTexture();
  const { backRef, leftRef, rightRef } = useWallProximityFade();

  return (
    <group>
      {/* пол — сплошная кафельная плитка вместо grid-оверлея CanvasShell
          (showFloor={false} передан из ChemistryCanvas специально для этой сцены).
          Пол/стены тянутся вперед (к зрителю) на ROOM_FRONT_REACH, а не только
          на половину глубины комнаты — иначе на максимальной дистанции камеры
          под ней открывался бы черный "провал" (там, где раньше стояла камера,
          пол físически не доходил). DoubleSide — на случай, если камера все
          же окажется у самого края допустимой дистанции/угла и почти коснется
          стены: односторонний материал в этот момент показал бы черную дыру
          вместо самой стены. */}
      <mesh position={[0, ROOM_FLOOR_Y, ROOM_Z_CENTER]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[ROOM_HALF_WIDTH * 2, ROOM_Z_LENGTH]} />
        <meshStandardMaterial map={floorTex} roughness={0.5} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>
      <ContactShadows position={[0, ROOM_FLOOR_Y + 0.001, 0]} opacity={0.55} scale={16} blur={2.4} far={3} resolution={256} />

      {/* задняя стена */}
      <mesh position={[0, ROOM_FLOOR_Y + ROOM_HEIGHT / 2, -ROOM_HALF_DEPTH]} receiveShadow>
        <planeGeometry args={[ROOM_HALF_WIDTH * 2, ROOM_HEIGHT]} />
        <meshStandardMaterial ref={backRef} map={wallTex} roughness={0.85} metalness={0} side={THREE.DoubleSide} transparent />
      </mesh>
      {/* боковые стены — та же Z-протяженность, что и у пола */}
      <mesh position={[-ROOM_HALF_WIDTH, ROOM_FLOOR_Y + ROOM_HEIGHT / 2, ROOM_Z_CENTER]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[ROOM_Z_LENGTH, ROOM_HEIGHT]} />
        <meshStandardMaterial ref={leftRef} map={wallTex} roughness={0.85} metalness={0} side={THREE.DoubleSide} transparent />
      </mesh>
      <mesh position={[ROOM_HALF_WIDTH, ROOM_FLOOR_Y + ROOM_HEIGHT / 2, ROOM_Z_CENTER]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[ROOM_Z_LENGTH, ROOM_HEIGHT]} />
        <meshStandardMaterial ref={rightRef} map={wallTex} roughness={0.85} metalness={0} side={THREE.DoubleSide} transparent />
      </mesh>

      {/* потолочные светильники — без сплошного потолка (сознательно): при
          щедрых maxDistance/minPolarAngle камера может подняться выше
          ROOM_HEIGHT, и сплошной потолок в этот момент пришлось бы либо
          прятать, либо показывать его изнанку. Ни один сценарий использования
          не требует смотреть вверх на потолок — просто не рендерим его,
          светильники остаются как источники света и визуальный ориентир */}
      {[-2.4, 0, 2.4].map((x) => (
        <mesh key={x} position={[x, ROOM_FLOOR_Y + ROOM_HEIGHT - 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.6, 0.4]} />
          <meshStandardMaterial color="#fffef4" emissive="#fffef0" emissiveIntensity={1.4} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}

      {/* настенные шкафы вдоль задней стены — по бокам от рабочей зоны,
          не пересекаются с предметами стола (те не выходят за X:[-3.2,2.6]) */}
      {Object.values(CABINET_REGISTRY).map((cabinet) => (
        <CabinetMesh key={cabinet.id} config={cabinet} woodTexture={woodTex} />
      ))}
    </group>
  );
}

// Stage C-2: реалистичная GLB-модель мойки/тумбы (Sketchfab CC0, оптимизирована
// офлайн через gltf-transform: dedup+join+simplify+meshopt, 3.8MB -> ~192KB) —
// декоративная мебель у боковой стены, вне рабочей зоны предметов
// (containers/bottles/tools живут в X:[-3.2,2.6], Z:[-1.6,1.4]), поэтому не
// пересекается ни с чем интерактивным и не участвует в drag/snap-логике.
function prepareChemistryClone(scene: THREE.Object3D): THREE.Object3D {
  const clone = scene.clone(true);
  clone.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
    }
  });
  return clone;
}

// Stage C-3: общий helper для GLB-моделей стола (не только мойки) —
// вписывает по самой длинной оси в targetSize и ставит НИЗ модели на
// заданную высоту yBase (а не центр bbox), чтобы предмет стоял основанием
// на поверхности, а не проваливался/парил над ней
function useFittedGLTF(path: string, targetSize: number, yBase: number) {
  const { scene } = useGLTF(path);
  return useMemo(() => {
    const clone = prepareChemistryClone(scene);
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z) || 1;
    const scale = targetSize / longest;
    clone.scale.setScalar(scale);
    const scaledBox = new THREE.Box3().setFromObject(clone);
    const center = scaledBox.getCenter(new THREE.Vector3());
    clone.position.x -= center.x;
    clone.position.z -= center.z;
    clone.position.y -= scaledBox.min.y - yBase;
    return clone;
  }, [scene, targetSize, yBase]);
}

function useSinkCounterModel(targetWidth: number) {
  const { scene } = useGLTF("/models/chemistry/lab-table.glb");
  return useMemo(() => {
    const clone = prepareChemistryClone(scene);
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const scale = targetWidth / (size.x || 1);
    clone.scale.setScalar(scale);
    const scaledBox = new THREE.Box3().setFromObject(clone);
    const center = scaledBox.getCenter(new THREE.Vector3());
    // центрируем по X/Z, но по Y ставим на пол (низ модели -> floorY), а не
    // по центру bbox — это цельный шкаф с раковиной, стоящий на полу
    clone.position.x -= center.x;
    clone.position.z -= center.z;
    clone.position.y -= scaledBox.min.y - ROOM_FLOOR_Y;
    return clone;
  }, [scene, targetWidth]);
}
useGLTF.preload("/models/chemistry/lab-table.glb");

function SinkCounter() {
  // Мойка на боковой (правой) стене, за пределами рабочего стола
  // (тот заканчивается на X=4.5) — полный реалистичный масштаб оригинала,
  // комната теперь достаточно просторная, чтобы не пришлось его ужимать
  const model = useSinkCounterModel(2.6);
  return (
    <group position={[ROOM_HALF_WIDTH - 0.45, 0, -0.6]} rotation={[0, Math.PI / 2, 0]}>
      <primitive object={model} />
    </group>
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

// Stage S-1 — Interaction Core (Focus & Pickup): пока предмет держат (active),
// его мировая позиция/ориентация пересчитывается каждый кадр от ТЕКУЩЕЙ камеры
// (handOffset/handRotation берутся из per-предметной конфигурации в
// lib/interactables.ts), а НЕ от item.position в ChemistryWorkspaceProvider —
// домен остается полностью нетронутым все время удержания, см.
// ChemistryInteractionProvider. yawOffset — чисто визуальное ручное вращение
// в руке (стрелки влево/вправо), тоже нигде не сохраняется в домен и
// сбрасывается при отпускании. Работает независимо от того, что двигает
// камеру (сейчас OrbitControls, что угодно другое после Stage S-7) —
// зависимость только от camera.position/camera.quaternion.
//
// Родительский <group>, в который вложен этот компонент, должен сам обнулять
// свои position/rotation, пока active===true (см. ContainerMesh/StockBottleMesh) —
// иначе позиция руки сложится с позицией предмета на столе.
// Stage S-2: скорость лерпа между рукой и превью-точкой на столе (и обратно)
// — тот же порядок величины, что GRAB_LIFT_SPEED, чтобы переход ощущался
// частью того же визуального языка, не резким скачком
const HELD_RIG_LERP_SPEED = 12;

function HeldObjectRig({
  active,
  handOffset,
  handRotation,
  yawOffset,
  placementTarget,
  children,
}: {
  active: boolean;
  handOffset: [number, number, number];
  handRotation: [number, number, number];
  yawOffset: number;
  // Stage S-2: когда задан (валидная точка размещения) — предмет визуально
  // "садится" на стол в эту позицию/поворот вместо руки. Сам домен
  // (ChemistryWorkspaceProvider) при этом НЕ меняется — это чистое превью,
  // запись происходит только по подтверждению (см. ChemistryInteractionProvider.confirmPlacement)
  placementTarget?: { position: [number, number]; rotationY: number } | null;
  children: React.ReactNode;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const localAnchor = useMemo(() => new THREE.Vector3(...handOffset), [handOffset]);
  const baseQuat = useMemo(
    () => new THREE.Quaternion().setFromEuler(new THREE.Euler(...handRotation)),
    [handRotation]
  );

  useFrame(({ camera }, delta) => {
    if (!active || !groupRef.current) return;
    const targetPos = new THREE.Vector3();
    const targetQuat = new THREE.Quaternion();
    if (placementTarget) {
      targetPos.set(placementTarget.position[0], 0.05, placementTarget.position[1]);
      targetQuat.setFromEuler(new THREE.Euler(0, placementTarget.rotationY, 0));
    } else {
      targetPos.copy(camera.localToWorld(localAnchor.clone()));
      const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawOffset);
      targetQuat.copy(camera.quaternion).multiply(baseQuat).multiply(yawQuat);
    }
    const t = Math.min(1, delta * HELD_RIG_LERP_SPEED);
    groupRef.current.position.lerp(targetPos, t);
    groupRef.current.quaternion.slerp(targetQuat, t);
  });

  if (!active) return <>{children}</>;
  return <group ref={groupRef}>{children}</group>;
}

function HeldRaycastGate({ disabled, children }: { disabled: boolean; children: React.ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    if (!disabled || !groupRef.current) return;
    return suppressRaycastTree(groupRef.current);
  }, [disabled]);

  return <group ref={groupRef}>{children}</group>;
}

const TABLE_CAMERA_POSITION: [number, number, number] = [0.4, 3.6, 6.4];
const TABLE_CAMERA_TARGET: [number, number, number] = [0, 0.1, 0];
const CABINET_CAMERA_POSITION: [number, number, number] = [0, 2.5, 3.4];
const CABINET_CAMERA_TARGET: [number, number, number] = [0, 1.75, -2.9];

function PlacementCameraShortcut() {
  const { camera, invalidate } = useThree();
  const { heldId } = useChemistryInteraction();

  useEffect(() => {
    if (!heldId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        (event.key !== "t" && event.key !== "T" && event.key !== "c" && event.key !== "C")
      ) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      const toCabinets = event.key === "c" || event.key === "C";
      camera.position.set(...(toCabinets ? CABINET_CAMERA_POSITION : TABLE_CAMERA_POSITION));
      camera.lookAt(...(toCabinets ? CABINET_CAMERA_TARGET : TABLE_CAMERA_TARGET));
      camera.updateMatrixWorld();
      invalidate();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [camera, heldId, invalidate]);

  return null;
}

// Stage S-2 — невидимая плоскость на уровне стола, активная ТОЛЬКО пока
// heldId задан: raycast курсора против неё дает точку прицеливания для
// размещения. Отдельная от DragSurface (старая система, реагирует только на
// draggingId старого drag) — небольшое отличие по высоте (0.02 против 0.01
// у DragSurface) + stopPropagation исключают гонку двух наложенных плоскостей.
function PlacementSurfacePlane() {
  const { setAimPoint } = useChemistryInteraction();
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.02, 0]}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setAimPoint([e.point.x, e.point.z]);
      }}
      onPointerOut={() => setAimPoint(null)}
    >
      <planeGeometry args={[10, 5]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

// Stage S-2 — живой фидбэк точки прицеливания: зелёное кольцо, если текущая
// точка валидна для размещения (see ChemistryScene's placementCandidate),
// красное — если нет (вне стола или перекрывает другой предмет)
function PlacementGhost() {
  const { aimPoint, heldId, placementCandidate } = useChemistryInteraction();
  if (!heldId || !aimPoint) return null;
  const isValid = placementCandidate !== null;
  return (
    <mesh position={[aimPoint[0], 0.03, aimPoint[1]]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.3, 0.4, 32]} />
      <meshBasicMaterial color={isValid ? "#34d399" : "#f87171"} transparent opacity={0.55} depthWrite={false} />
    </mesh>
  );
}

// Stage S-1 — кольцо фокуса под наведенным предметом (тот же прием, что
// snapRingRef/unsafeRingRef выше, отдельный цвет — не путать с уже
// существующими selection/snap/unsafe кольцами)
function FocusRing({ halfHeight, radius = 0.36 }: { halfHeight: number; radius?: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const mat = ref.current?.material as THREE.MeshBasicMaterial | undefined;
    if (mat) mat.opacity = 0.45 + (0.5 + Math.sin(clock.elapsedTime * 6) * 0.5) * 0.35;
  });
  return (
    <mesh ref={ref} position={[0, -halfHeight - 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[radius, radius + 0.05, 32]} />
      <meshBasicMaterial color="#fbbf24" transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

// Stage S-1 — фиксированная HUD-подсказка действия ("E — Взять: ...").
// <Html fullscreen> рисует оверлей на весь канвас (не привязан к 3D-точке),
// поэтому не требует изменений в общем CanvasShell.tsx. Стиль намеренно
// повторяет уже существующие подсказки (rounded-md/bg-slate-900/85/text-xs) —
// редизайн интерфейса Stage S-1 не делает.
function InteractionPrompt() {
  const {
    focusedId,
    focusedKind,
    heldId,
    placementCandidate,
    getPickupBlockedReason,
    getCabinetState,
    canStoreInCabinet,
  } = useChemistryInteraction();

  // Stage S-2 — текст меняется по валидности текущей точки размещения:
  // "поставить" только когда candidate есть (зелёное кольцо), иначе честно
  // говорит, что тут нельзя — E в этот момент ничего не сделает
  let text: string | null = null;
  if (heldId) {
    const cap = getInteractable(heldId);
    const name = cap ? `: ${cap.displayName}` : "";
    if (focusedId && focusedKind === "cabinet") {
      const cabinet = getCabinet(focusedId);
      const cabinetState = getCabinetState(focusedId);
      if (!cabinetState?.isOpen) {
        text = `Шкаф закрыт · T — к столу · C — к шкафам · Esc — вернуть${name}`;
      } else if (canStoreInCabinet(heldId, focusedId)) {
        text = `E — Убрать в шкаф: ${cabinet?.displayName ?? "Шкаф"} · T — к столу · C — к шкафам · Esc — вернуть${name}`;
      } else {
        text = `Нет совместимого свободного слота · T — к столу · C — к шкафам · Esc — вернуть${name}`;
      }
    } else {
      text = placementCandidate
        ? `E — Поставить${name}  ·  T — к столу  ·  C — к шкафам  ·  ←/→ — повернуть  ·  Esc — отменить`
        : `Здесь нельзя поставить  ·  T — к столу  ·  C — к шкафам  ·  ←/→ — повернуть  ·  Esc — вернуть${name}`;
    }
  } else if (focusedId && focusedKind === "cabinet") {
    const cabinet = getCabinet(focusedId);
    const action = getCabinetState(focusedId)?.isOpen ? "Закрыть" : "Открыть";
    text = `E — ${action}: ${cabinet?.displayName ?? "Шкаф"}`;
  } else if (focusedId && focusedKind === "item") {
    const cap = getInteractable(focusedId);
    if (cap) {
      const blockedReason = getPickupBlockedReason(focusedId);
      text = blockedReason ?? `E — Взять: ${cap.displayName}`;
    }
  }

  if (!text) return null;
  return (
    <Html fullscreen style={{ pointerEvents: "none" }}>
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-slate-900/85 px-3 py-1.5 text-xs text-slate-100">
        {text}
      </div>
    </Html>
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

// GlassObject — единый рендер для ЛЮБОГО профиля из GLASS_LIBRARY: стекло +
// жидкость + осадок. ContainerMesh вокруг него добавляет только то, что не
// зависит от формы сосуда (хитбокс, drag/pour, кольца выбора/safety,
// эффекты реакции/нагрева/hazard, подписи) — сама форма стекла отсюда не
// видна и не важна для остальной сцены, только через объект profile.
function GlassObject({
  profile,
  hovered,
  displayColorHex,
  volumeMl,
  fillHeight,
  aggregateState,
  hasPrecipitate,
  precipitateColorHex,
}: {
  profile: GlassProfile;
  hovered: boolean;
  displayColorHex: string;
  volumeMl: number;
  fillHeight: number;
  aggregateState: AggregateState;
  hasPrecipitate: boolean;
  precipitateColorHex: string;
}) {
  return (
    <>
      {/* прозрачное "стекло" — при наведении чуть светлее, чтобы предмет
          читался как интерактивный еще до того, как его возьмут */}
      <mesh castShadow geometry={profile.geometry}>
        <meshPhysicalMaterial
          color={hovered ? "#eff6ff" : "#dbeafe"}
          transparent
          opacity={hovered ? 0.4 : 0.28}
          roughness={0.1}
          transmission={0.6}
          thickness={0.05}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* жидкость внутри — цвет и уровень посчитаны Chemistry Engine, но и
          цвет, и высота столба плавно интерполируются на экране. Радиус —
          из того же профиля, что и стекло (liquidRadius), поэтому для любого
          нового вида сосуда жидкость автоматически не торчит сквозь стенки */}
      {volumeMl > 0 && (
        <mesh position={[0, -profile.halfHeight + fillHeight / 2, 0]}>
          <cylinderGeometry args={[profile.liquidRadius, profile.liquidRadius, Math.max(0.02, fillHeight), 20]} />
          <meshStandardMaterial color={displayColorHex} transparent opacity={aggregateState === "gas" ? 0.35 : 0.85} />
        </mesh>
      )}

      {/* осадок на дне — реальный, только если Chemistry Engine его посчитал */}
      {hasPrecipitate && (
        <mesh position={[0, -profile.halfHeight + 0.015, 0]}>
          <cylinderGeometry args={[profile.precipitateRadius, profile.precipitateRadius, 0.03, 20]} />
          <meshStandardMaterial color={precipitateColorHex} roughness={0.8} />
        </mesh>
      )}
    </>
  );
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
  const interaction = useInteractable(item.id);
  const { capability, isAccessible, isHeld, pointerHandlers, canUseLegacyDrag } = interaction;
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

  const profile = GLASS_LIBRARY[item.kind] ?? GLASS_LIBRARY.beaker;
  const halfHeight = profile.halfHeight;

  return (
    <group
      position={isHeld ? [0, 0, 0] : [item.position[0], item.elevation, item.position[1]]}
      rotation={isHeld ? [0, 0, 0] : [0, item.rotationY, 0]}
      onPointerDown={!isHeld && canUseLegacyDrag ? onPointerDown : undefined}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (!isAccessible) return;
        setHovered(true);
        pointerHandlers?.onPointerOver();
      }}
      onPointerOut={() => {
        setHovered(false);
        pointerHandlers?.onPointerOut();
      }}
    >
      <InteractableVisualRig
        id={item.id}
        interaction={interaction}
        focusHalfHeight={halfHeight}
        focusRadius={capability?.interactionRadius}
      >
        <Html center style={{ pointerEvents: "none" }}>
          <span
            data-testid={`container-target-${item.id}`}
            data-storage-slot-id={item.storageSlotId ?? "none"}
            data-elevation={item.elevation}
            data-water-grams={item.data.contents.find((entry) => entry.substanceId === "water")?.grams ?? 0}
            data-nacl-dissolved-grams={item.data.contents.find((entry) => entry.substanceId === "nacl")?.grams ?? 0}
            data-nacl-precipitate-grams={item.data.precipitate.find((entry) => entry.substanceId === "nacl")?.grams ?? 0}
            className="block h-px w-px opacity-0"
          />
          {item.id === "flask-1" && (
            <span
              data-testid="spike-flask-target"
              data-storage-slot-id={item.storageSlotId ?? "none"}
              data-elevation={item.elevation}
              data-water-grams={item.data.contents.find((entry) => entry.substanceId === "water")?.grams ?? 0}
              data-nacl-dissolved-grams={item.data.contents.find((entry) => entry.substanceId === "nacl")?.grams ?? 0}
              data-nacl-precipitate-grams={item.data.precipitate.find((entry) => entry.substanceId === "nacl")?.grams ?? 0}
              className="block h-px w-px opacity-0"
            />
          )}
        </Html>
        {process.env.NODE_ENV !== "production" && !isHeld && (
          <Html center style={{ pointerEvents: "none" }}>
            <span
              data-testid={`workspace-transform-${item.id}`}
              data-x={item.position[0]}
              data-z={item.position[1]}
              data-elevation={item.elevation}
              data-rotation-y={item.rotationY}
              data-storage-slot-id={item.storageSlotId ?? "none"}
              className="block h-px w-px opacity-0"
            />
          </Html>
        )}
        <Html position={[0.42, -0.03, 0]} center style={{ pointerEvents: "none" }}>
          <span data-testid={`container-drop-zone-water-${item.id}`} className="block h-px w-px opacity-0" />
        </Html>
        <Html position={[-0.42, -0.03, 0]} center style={{ pointerEvents: "none" }}>
          <span data-testid={`container-drop-zone-reagent-${item.id}`} className="block h-px w-px opacity-0" />
        </Html>
        <Hitbox
          radius={interaction.registeredCapability?.interactionRadius ?? 0.32}
          height={interaction.registeredCapability?.interactionHeight ?? halfHeight * 2 + 0.1}
        />

        <GrabLift isDragging={isDragging}>
          <PourTilt active={isPouring}>
            <GlassObject
              profile={profile}
              hovered={hovered}
              displayColorHex={displayColorHex}
              volumeMl={volumeMl}
              fillHeight={fillHeight}
              aggregateState={aggregateState}
              hasPrecipitate={hasPrecipitate}
              precipitateColorHex={SUBSTANCES[item.data.precipitate[0]?.substanceId]?.colorHex ?? "#f5f5f4"}
            />

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

        {hovered && !isDragging && !isHeld && (
          <Html position={[0, halfHeight + 0.45, 0]} center distanceFactor={9} style={{ pointerEvents: "none" }}>
            <div className="pointer-events-none whitespace-nowrap rounded-md border border-white/10 bg-slate-900/90 px-2 py-1 text-xs text-slate-100">
              {CONTAINER_LABEL[item.kind]}
            </div>
          </Html>
        )}
      </InteractableVisualRig>
    </group>
  );
}

function StockBottleMesh({ bottle, isPouring }: { bottle: StockBottle; isPouring: boolean }) {
  const [hovered, setHovered] = useState(false);
  const { onPointerDown, isDragging } = useDragHandlers(bottle.id);
  const interaction = useInteractable(bottle.id);
  const { capability, isAccessible, isHeld, pointerHandlers, canUseLegacyDrag } = interaction;
  const substance = SUBSTANCES[bottle.substanceId];

  return (
    <group
      position={isHeld ? [0, 0, 0] : [bottle.position[0], bottle.elevation, bottle.position[1]]}
      onPointerDown={!isHeld && canUseLegacyDrag ? onPointerDown : undefined}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (!isAccessible) return;
        setHovered(true);
        pointerHandlers?.onPointerOver();
      }}
      onPointerOut={() => {
        setHovered(false);
        pointerHandlers?.onPointerOut();
      }}
    >
      <InteractableVisualRig
        id={bottle.id}
        interaction={interaction}
        focusHalfHeight={0.16}
        focusRadius={capability?.interactionRadius}
      >
        {!isHeld && (
          <Html center style={{ pointerEvents: "none" }}>
            <span
              data-testid={`stock-bottle-target-${bottle.id}`}
              data-remaining-grams={bottle.remainingGrams}
              className="block h-px w-px opacity-0"
            />
          </Html>
        )}
        <Hitbox
          radius={interaction.registeredCapability?.interactionRadius ?? 0.17}
          height={interaction.registeredCapability?.interactionHeight ?? 0.5}
        />

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

        {hovered && !isDragging && !isHeld && (
          <Html position={[0, 0.35, 0]} center distanceFactor={9} style={{ pointerEvents: "none" }}>
            <div className="pointer-events-none whitespace-nowrap rounded-md border border-white/10 bg-slate-900/90 px-2 py-1 text-xs text-slate-100">
              {substance?.name} ({substance?.formula}) · {bottle.remainingGrams.toFixed(0)} г
            </div>
          </Html>
        )}
      </InteractableVisualRig>
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

useGLTF.preload("/models/chemistry/bunsen-burner.glb");

function BurnerMesh({ tool }: { tool: ToolItem }) {
  const { toggleBurner } = useChemistryWorkspace();
  const { onPointerDown, isDragging } = useDragHandlers(tool.id);
  const interaction = useInteractable(tool.id);
  const { capability, isAccessible, isHeld, pointerHandlers, canUseLegacyDrag } = interaction;
  const [hovered, setHovered] = useState(false);
  const flameRef = useRef<THREE.Mesh>(null);
  // Stage C-3: настоящая GLB-модель горелки (Poly Haven "Bunsen Burner",
  // CC0, PBR-материалы) вместо процедурного цилиндра. targetSize=0.34 —
  // высота, сопоставимая с соседней посудой на столе (стакан/колба ~0.4);
  // модель встает основанием на столешницу (yBase=0), а не по центру bbox
  const model = useFittedGLTF("/models/chemistry/bunsen-burner.glb", 0.34, 0);

  useFrame(({ clock }) => {
    if (!flameRef.current) return;
    const pulse = tool.isOn ? 1 + Math.sin(clock.elapsedTime * 10) * 0.15 : 0.001;
    flameRef.current.scale.setScalar(pulse);
  });

  return (
    <group
      position={isHeld ? [0, 0, 0] : [tool.position[0], tool.elevation, tool.position[1]]}
      rotation={isHeld ? [0, 0, 0] : [0, tool.rotationY, 0]}
      onPointerDown={!isHeld && canUseLegacyDrag ? onPointerDown : undefined}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (!isAccessible) return;
        setHovered(true);
        pointerHandlers?.onPointerOver();
      }}
      onPointerOut={() => {
        setHovered(false);
        pointerHandlers?.onPointerOut();
      }}
    >
      <InteractableVisualRig id={tool.id} interaction={interaction} focusHalfHeight={0} focusRadius={capability?.interactionRadius}>
      <Hitbox radius={capability?.interactionRadius ?? 0.3} height={capability?.interactionHeight ?? 0.5} />
      <GrabLift isDragging={isDragging}>
        <primitive object={model} />
        {/* клик-таргет + всегда видимый индикатор вкл/выкл — та же логика,
            что и раньше (цвет меняется по tool.isOn), просто перенесен
            пониже, к основанию горелки, под реальную модель */}
        <mesh
          position={[0, 0.03, 0]}
          onClick={(e) => {
            e.stopPropagation();
            if (!tool.isOn) playBurnerIgnite();
            toggleBurner(tool.id);
          }}
        >
          <cylinderGeometry args={[0.1, 0.1, 0.03, 20]} />
          <meshStandardMaterial
            color={tool.isOn ? "#f97316" : "#1e293b"}
            emissive={tool.isOn ? "#f97316" : "#000000"}
            emissiveIntensity={tool.isOn ? 0.8 : 0}
          />
        </mesh>
        {/* data-testid нельзя ставить прямо на <mesh> — R3F интерпретирует
            дефис в имени пропса как вложенный путь (data.testid) и падает на
            mesh.data === undefined; реальный testid — через невидимый Html-маркер */}
        <Html position={[0, 0.03, 0]} center distanceFactor={9} style={{ pointerEvents: "none" }}>
          <div
            data-testid={`burner-toggle-${tool.id}`}
            data-is-on={tool.isOn ? "true" : "false"}
            style={{ width: 1, height: 1 }}
          />
        </Html>
        <mesh ref={flameRef} position={[0, 0.36, 0]} scale={0.001}>
          <coneGeometry args={[0.06, 0.2, 12]} />
          <meshStandardMaterial color="#fb923c" emissive="#f97316" emissiveIntensity={2} transparent opacity={0.85} />
        </mesh>
        {tool.isOn && <pointLight position={[0, 0.34, 0]} color="#f97316" intensity={1.2} distance={2} decay={2} />}
      </GrabLift>
      {hovered && !isDragging && !isHeld && <ToolHoverLabel tool={tool} y={0.5} />}
      </InteractableVisualRig>
    </group>
  );
}

function PlacementDiagnosticMarkers() {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <group>
      {([
        [0.5, 0.7],
        [-0.5, -0.7],
        [-3.5, 0.5],
        [3.5, 0.4],
      ] as const).map(([x, z], index) => (
        <Html key={`${x}:${z}`} position={[x, 0.03, z]} center style={{ pointerEvents: "none" }}>
          <span data-testid={`placement-marker-table-free-${index}`} className="block h-px w-px opacity-0" />
        </Html>
      ))}
      <Html position={[0.5, 0.03, 1.9]} center style={{ pointerEvents: "none" }}>
        <span data-testid="placement-marker-table-invalid" className="block h-px w-px opacity-0" />
      </Html>
    </group>
  );
}

function StandMesh({ tool }: { tool: ToolItem }) {
  const { onPointerDown, isDragging } = useDragHandlers(tool.id);
  const interaction = useInteractable(tool.id);
  const { capability, isAccessible, isHeld, pointerHandlers, canUseLegacyDrag } = interaction;
  const [hovered, setHovered] = useState(false);
  return (
    <group
      position={isHeld ? [0, 0, 0] : [tool.position[0], tool.elevation, tool.position[1]]}
      rotation={isHeld ? [0, 0, 0] : [0, tool.rotationY, 0]}
      onPointerDown={!isHeld && canUseLegacyDrag ? onPointerDown : undefined}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (!isAccessible) return;
        setHovered(true);
        pointerHandlers?.onPointerOver();
      }}
      onPointerOut={() => {
        setHovered(false);
        pointerHandlers?.onPointerOut();
      }}
    >
      <InteractableVisualRig id={tool.id} interaction={interaction} focusHalfHeight={0} focusRadius={capability?.interactionRadius}>
      {process.env.NODE_ENV !== "production" && !isHeld && (
        <Html position={[0.22, 0.85, 0]} center style={{ pointerEvents: "none" }}>
          <span data-testid={`stand-visual-target-${tool.id}`} className="block h-px w-px opacity-0" />
        </Html>
      )}
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
      {hovered && !isDragging && !isHeld && <ToolHoverLabel tool={tool} y={1.05} />}
      </InteractableVisualRig>
    </group>
  );
}

// Stage C-3 (реализм): настоящий профиль пипетки через LatheGeometry —
// стеклянная трубка сужается к кончику (не одинаковый конус, как раньше),
// плюс отдельная резиновая груша сверху (сплюснутая сфера + узкая шейка),
// а не идеальный шар "на глаз"
const PIPETTE_TUBE_GEOMETRY = latheGeometry(
  [
    [0.008, 0],
    [0.012, 0.02],
    [0.022, 0.05],
    [0.024, 0.35],
    [0.026, 0.4],
  ],
  16
);

function PipetteMesh({ tool }: { tool: ToolItem }) {
  const { onPointerDown, isDragging } = useDragHandlers(tool.id);
  const interaction = useInteractable(tool.id);
  const { capability, isAccessible, isHeld, pointerHandlers, canUseLegacyDrag } = interaction;
  const [hovered, setHovered] = useState(false);
  return (
    <group
      position={isHeld ? [0, 0, 0] : [tool.position[0], tool.elevation, tool.position[1]]}
      rotation={isHeld ? [0, 0, 0] : [0, tool.rotationY, 0]}
      onPointerDown={!isHeld && canUseLegacyDrag ? onPointerDown : undefined}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (!isAccessible) return;
        setHovered(true);
        pointerHandlers?.onPointerOver();
      }}
      onPointerOut={() => {
        setHovered(false);
        pointerHandlers?.onPointerOut();
      }}
    >
      <InteractableVisualRig id={tool.id} interaction={interaction} focusHalfHeight={0.05} focusRadius={capability?.interactionRadius}>
      <Hitbox radius={capability?.interactionRadius ?? 0.12} height={capability?.interactionHeight ?? 0.55} />
      <GrabLift isDragging={isDragging}>
        <mesh castShadow geometry={PIPETTE_TUBE_GEOMETRY}>
          <meshPhysicalMaterial
            color={hovered ? "#f1f5f9" : "#cbd5e1"}
            transparent
            opacity={0.45}
            roughness={0.15}
            transmission={0.7}
            thickness={0.02}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* резиновая груша — шейка + сплюснутая сфера, а не идеальный шар */}
        <mesh position={[0, 0.41, 0]}>
          <cylinderGeometry args={[0.014, 0.02, 0.03, 12]} />
          <meshStandardMaterial color="#7f1d1d" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.48, 0]} scale={[1, 0.85, 1]}>
          <sphereGeometry args={[0.05, 14, 14]} />
          <meshStandardMaterial color="#dc2626" roughness={0.55} />
        </mesh>
      </GrabLift>
      {hovered && !isDragging && !isHeld && <ToolHoverLabel tool={tool} y={0.6} />}
      </InteractableVisualRig>
    </group>
  );
}

function ThermometerMesh({ tool }: { tool: ToolItem }) {
  const { state } = useChemistryWorkspace();
  const { onPointerDown, isDragging } = useDragHandlers(tool.id);
  const interaction = useInteractable(tool.id);
  const { capability, isAccessible, isHeld, pointerHandlers, canUseLegacyDrag } = interaction;
  const [hovered, setHovered] = useState(false);
  const active = state.containers.find((c) => c.id === state.activeContainerId);

  return (
    <group
      position={isHeld ? [0, 0, 0] : [tool.position[0], tool.elevation, tool.position[1]]}
      rotation={isHeld ? [0, 0, 0] : [0, tool.rotationY, 0]}
      onPointerDown={!isHeld && canUseLegacyDrag ? onPointerDown : undefined}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (!isAccessible) return;
        setHovered(true);
        pointerHandlers?.onPointerOver();
      }}
      onPointerOut={() => {
        setHovered(false);
        pointerHandlers?.onPointerOut();
      }}
    >
      <InteractableVisualRig id={tool.id} interaction={interaction} focusHalfHeight={0.05} focusRadius={capability?.interactionRadius}>
      <Hitbox radius={capability?.interactionRadius ?? 0.1} height={capability?.interactionHeight ?? 0.5} />
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
      {hovered && !isDragging && !isHeld && <ToolHoverLabel tool={tool} y={0.5} />}
      </InteractableVisualRig>
    </group>
  );
}

function GlassRodMesh({ tool }: { tool: ToolItem }) {
  const { onPointerDown, isDragging } = useDragHandlers(tool.id);
  const interaction = useInteractable(tool.id);
  const { capability, isAccessible, isHeld, pointerHandlers, canUseLegacyDrag } = interaction;
  const [hovered, setHovered] = useState(false);

  return (
    <group
      position={isHeld ? [0, 0, 0] : [tool.position[0], tool.elevation, tool.position[1]]}
      rotation={isHeld ? [0, 0, 0] : [0, tool.rotationY, 0]}
      onPointerDown={!isHeld && canUseLegacyDrag ? onPointerDown : undefined}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (!isAccessible) return;
        setHovered(true);
        pointerHandlers?.onPointerOver();
      }}
      onPointerOut={() => {
        setHovered(false);
        pointerHandlers?.onPointerOut();
      }}
    >
      <InteractableVisualRig id={tool.id} interaction={interaction} focusHalfHeight={0.05} focusRadius={capability?.interactionRadius}>
        <Hitbox radius={capability?.interactionRadius ?? 0.14} height={capability?.interactionHeight ?? 0.62} />
        <GrabLift isDragging={isDragging}>
          <mesh castShadow>
            <cylinderGeometry args={[0.012, 0.012, 0.58, 12]} />
            <meshPhysicalMaterial
              color={hovered ? "#f8fafc" : "#dbeafe"}
              transparent
              opacity={0.5}
              roughness={0.1}
              transmission={0.75}
              thickness={0.015}
            />
          </mesh>
        </GrabLift>
        {hovered && !isDragging && !isHeld && <ToolHoverLabel tool={tool} y={0.65} />}
      </InteractableVisualRig>
    </group>
  );
}

function ScaleMesh({ tool }: { tool: ToolItem }) {
  const { state } = useChemistryWorkspace();
  const { onPointerDown, isDragging } = useDragHandlers(tool.id);
  const interaction = useInteractable(tool.id);
  const { capability, isAccessible, isHeld, pointerHandlers, canUseLegacyDrag } = interaction;
  const [hovered, setHovered] = useState(false);
  const active = state.containers.find((c) => c.id === state.activeContainerId);
  const massG = active ? totalMassG(active.data) : 0;

  return (
    <group
      position={isHeld ? [0, 0, 0] : [tool.position[0], tool.elevation, tool.position[1]]}
      rotation={isHeld ? [0, 0, 0] : [0, tool.rotationY, 0]}
      onPointerDown={!isHeld && canUseLegacyDrag ? onPointerDown : undefined}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (!isAccessible) return;
        setHovered(true);
        pointerHandlers?.onPointerOver();
      }}
      onPointerOut={() => {
        setHovered(false);
        pointerHandlers?.onPointerOut();
      }}
    >
      <InteractableVisualRig id={tool.id} interaction={interaction} focusHalfHeight={0} focusRadius={capability?.interactionRadius}>
      <Hitbox radius={capability?.interactionRadius ?? 0.35} height={capability?.interactionHeight ?? 0.3} />
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
      {hovered && !isDragging && !isHeld && <ToolHoverLabel tool={tool} y={0.35} />}
      </InteractableVisualRig>
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

type InteractableBinding = ReturnType<typeof useInteractable>;

// Единственная визуальная обёртка Interaction Core для всех переносимых
// renderer-семейств. HeldObjectRig и FocusRing существуют ровно здесь —
// сосуды, бутылки и инструменты не копируют механику удержания/фокуса.
function InteractableVisualRig({
  id,
  interaction,
  focusHalfHeight,
  focusRadius,
  children,
}: {
  id: string;
  interaction: InteractableBinding;
  focusHalfHeight: number;
  focusRadius?: number;
  children: React.ReactNode;
}) {
  const { capability, isFocused, isHeld, heldYawOffset, placementTarget, blockedReason } = interaction;
  return (
    <HeldObjectRig
      active={isHeld}
      handOffset={capability?.handOffset ?? [0, 0, 0]}
      handRotation={capability?.handRotation ?? [0, 0, 0]}
      yawOffset={heldYawOffset}
      placementTarget={placementTarget}
    >
      <HeldRaycastGate disabled={isHeld}>
      {process.env.NODE_ENV !== "production" && !isHeld && (
        <Html
          position={[0, (capability?.interactionHeight ?? 0.5) * 0.25, 0]}
          center
          style={{ pointerEvents: "none" }}
        >
          <span
            data-testid={`interactable-target-${id}`}
            data-focused={isFocused ? "true" : "false"}
            data-held={isHeld ? "true" : "false"}
            data-blocked-reason={blockedReason ?? "none"}
            className="block h-px w-px opacity-0"
          />
        </Html>
      )}
      {children}
      {isFocused && !isHeld && <FocusRing halfHeight={focusHalfHeight} radius={focusRadius} />}
      </HeldRaycastGate>
    </HeldObjectRig>
  );
}

function ChemistryScene({ onDrop, pourAnimation, addAnimation, safetyByContainer, debugMode }: ChemistrySceneProps) {
  const { state, heatTick, hazardTick } = useChemistryWorkspace();
  const { draggingId } = useChemistryDrag();
  const { focusedId, focusedKind, heldId, aimPoint, heldYawOffset, setPlacementCandidate } = useChemistryInteraction();
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

  // Stage S-2 — Free Placement: считает, валидна ли текущая точка
  // прицеливания (aimPoint) для держимого предмета. Тот же прием, что и
  // snapTargetId выше — производное значение через useMemo от uже
  // существующего state, никакой новой подписки/эффекта помимо передачи
  // результата в ChemistryInteractionProvider ниже. Держимый предмет
  // ИСКЛЮЧАЕТСЯ из occupants — иначе он никогда не смог бы разместиться
  // рядом со своей исходной точкой (ложное самоблокирование).
  const placementCandidate = useMemo(() => {
    if (!heldId || !aimPoint) return null;

    const heldCapability = getInteractable(heldId);
    if (!heldCapability?.canBePlaced || !heldCapability.allowedSurfaces.includes("table")) return null;

    const heldContainer = state.containers.find((c) => c.id === heldId);
    const heldBottle = state.stockBottles.find((b) => b.id === heldId);
    const heldTool = state.tools.find((t) => t.id === heldId);
    if (!heldContainer && !heldBottle && !heldTool) return null;
    const movingRadius = heldCapability.placementFootprint.radius;

    const radiusFor = (id: string, fallback: number) =>
      getInteractable(id)?.placementFootprint.radius ?? fallback;

    const occupants: PlacementOccupant[] = [
      ...state.containers
        .filter((c) => c.id !== heldId && c.storageSlotId === null)
        .map((c) => ({ position: c.position, radius: radiusFor(c.id, getFootprintRadius(c.kind)) })),
      ...state.tools
        .filter((t) => t.id !== heldId && t.storageSlotId === null)
        .map((t) => ({ position: t.position, radius: radiusFor(t.id, getFootprintRadius(t.kind)) })),
      ...state.stockBottles
        .filter((b) => b.id !== heldId && b.storageSlotId === null)
        .map((b) => ({ position: b.position, radius: radiusFor(b.id, STOCK_BOTTLE_FOOTPRINT_RADIUS) })),
    ];

    const valid = isPlacementValid(aimPoint, movingRadius, TABLE_SURFACE, occupants);
    return valid ? { position: aimPoint, rotationY: heldYawOffset, surface: "table" as const } : null;
  }, [heldId, aimPoint, heldYawOffset, state.containers, state.tools, state.stockBottles]);

  useEffect(() => {
    setPlacementCandidate(placementCandidate);
  }, [placementCandidate, setPlacementCandidate]);

  return (
    <ChemistryDebugContext.Provider value={debugMode}>
      <group>
        <PlacementCameraShortcut />
        <Html position={[0, -0.4, 2.3]} center style={{ pointerEvents: "none" }}>
          <span
            data-testid="chemistry-interaction-state"
            data-dragging-id={draggingId ?? "none"}
            data-held-id={heldId ?? "none"}
            data-focused-id={focusedId ?? "none"}
            data-focused-kind={focusedKind ?? "none"}
            data-placement-valid={placementCandidate ? "true" : "false"}
            data-aim-x={aimPoint?.[0] ?? "none"}
            data-aim-z={aimPoint?.[1] ?? "none"}
            className="block h-px w-px opacity-0"
          />
        </Html>
        <directionalLight position={[2, 4, 3]} intensity={0.4} color="#fff7ed" />
        <pointLight position={[-2, 2.5, 2]} intensity={0.2} color="#e0f2fe" distance={8} decay={2} />
        {/* Stage C-2: потолочные светильники — реальный свет от тех же
            позиций, что и эмиссивные панели в Room, плюс мягкое верхнее
            заполнение для менее "прожекторного" вида (ambient уже есть
            в CanvasShell, это дополнительный, специфичный для комнаты свет) */}
        {[-2.4, 0, 2.4].map((x) => (
          <pointLight key={x} position={[x, ROOM_FLOOR_Y + ROOM_HEIGHT - 0.3, 0]} intensity={0.55} color="#fffaf0" distance={7} decay={2} />
        ))}

        <Room />
        <SinkCounter />
        <Workbench />
        <PlacementDiagnosticMarkers />

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
          if (t.kind === "glass_rod") return <GlassRodMesh key={t.id} tool={t} />;
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
        {heldId && <PlacementSurfacePlane />}
        {heldId && <PlacementGhost />}
        <InteractionPrompt />
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
  const { heldId } = useChemistryInteraction();
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
        cameraPosition={[0.4, 3.6, 6.4]}
        target={[0, 0.1, 0]}
        floorY={-0.1}
        bloomIntensity={0.3}
        quality={quality}
        orbitEnabled={!draggingId && !heldId}
        // target — центр рабочего стола (см. Workbench), не центр комнаты и
        // не мировой origin (совпадают здесь, но нарочно к столу). Дистанция
        // и углы подобраны так, чтобы при ЛЮБОЙ комбинации (max дистанция +
        // крайние polar/azimuth) камера оставалась строго внутри стен
        // (см. расчет допусков в комментарии у ROOM_HALF_WIDTH/DEPTH выше)
        minPolarAngle={Math.PI / 7}
        maxPolarAngle={1.42}
        minDistance={2.2}
        maxDistance={7}
        minAzimuthAngle={-Math.PI / 2.8}
        maxAzimuthAngle={Math.PI / 2.8}
        showFloor={false}
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
// Stage 5.7 audit — сброс лаборатории (ChemistryWorkspaceProvider) и сброс
// учебной сессии (ChemistryLabExperienceProvider) должны происходить ВМЕСТЕ:
// иначе после аварийного сброса студент оставался бы на устаревшем шаге
// пошагового руководства против уже пустого, свежего сосуда
function EmergencyStopResetButton() {
  const { resetExperiment } = useChemistryWorkspace();
  const { resetLabSession } = useChemistryLabExperience();
  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      onClick={() => {
        resetExperiment();
        resetLabSession();
      }}
      data-testid="emergency-stop-reset"
      className="flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500"
    >
      <RotateCcw size={16} />
      Сбросить эксперимент
    </motion.button>
  );
}

function ChemistryTeacherChatPanel({ simulationId, safetyWarnings }: { simulationId: string; safetyWarnings: SafetyWarning[] }) {
  const { state } = useChemistryWorkspace();
  const { experiment, status: experimentStatus, result } = useExperimentProgress();
  const { mode, modeConfig, selectedExperiment, currentStep, isCurrentStepUnlocked, completedExperimentIds, recordHintUsed } =
    useChemistryLabExperience();
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

  // Stage 5.7 audit — Exam Mode: "AI никогда не дает прямых ответов, только
  // оценивает" (см. спецификацию режимов). Панель с чатом — это как раз
  // канал прямых ответов, поэтому в Exam Mode она скрыта полностью;
  // оценка результата студент получает через экран завершения/тетрадь,
  // которые не зависят от этой панели.
  if (!context || !modeConfig.showAIExplanations) return null;
  return (
    <ChemistryTeacherChat
      simulationId={simulationId}
      context={context}
      onMessageSent={recordHintUsed}
      showFullHints={modeConfig.showFullHints}
    />
  );
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
  const {
    state,
    pourFromStockBottle,
    pourInto,
    moveItem,
    setActiveContainer,
    setItemTransform,
    releaseItemFromSlot,
    toggleCabinet,
    findAvailableStorageSlot,
    storeItemInCabinet,
  } = useChemistryWorkspace();
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
  const rawLabStepContext: LabStepContext = useMemo(
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

  // Stage 5.7 audit — performance: HEAT_TICK диспетчерится каждый кадр
  // (~60/сек) пока включена горелка, а activeContainer/state.containers
  // получают новую ссылку на каждый такой тик. Без троттлинга это
  // заставляло весь Guided Laboratory System (каталог, панель шагов,
  // журнал, AI-контекст) перерендериваться 60 раз/сек даже когда
  // реально меняется только температура. Троттлинг до ~300мс — та же
  // частота, что уже используется для HAZARD_TICK (см. ChemistryScene) —
  // не влияет на корректность (максимумы/детерминированность считает
  // ChemistryLabExperienceProvider), только снижает частоту ре-рендера.
  const LAB_CONTEXT_THROTTLE_MS = 300;
  const [labStepContext, setLabStepContext] = useState<LabStepContext>(rawLabStepContext);
  const lastLabContextCommitRef = useRef(0);
  const pendingLabContextTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const elapsed = Date.now() - lastLabContextCommitRef.current;
    if (elapsed >= LAB_CONTEXT_THROTTLE_MS) {
      lastLabContextCommitRef.current = Date.now();
      setLabStepContext(rawLabStepContext);
      return;
    }
    // слишком рано с прошлого коммита — откладываем, но НЕ теряем самое
    // свежее значение навсегда (trailing edge): без этого таймера
    // последнее реальное изменение могло бы "застрять" непримененным,
    // если поток обновлений обрывается ровно внутри окна троттлинга
    if (pendingLabContextTimeoutRef.current) clearTimeout(pendingLabContextTimeoutRef.current);
    const remaining = LAB_CONTEXT_THROTTLE_MS - elapsed;
    pendingLabContextTimeoutRef.current = setTimeout(() => {
      lastLabContextCommitRef.current = Date.now();
      setLabStepContext(rawLabStepContext);
    }, remaining);
    return () => {
      if (pendingLabContextTimeoutRef.current) clearTimeout(pendingLabContextTimeoutRef.current);
    };
  }, [rawLabStepContext]);

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
      const grams = STOCK_POUR_GRAMS_BY_SUBSTANCE[addAnimation.substanceId] ?? DEFAULT_STOCK_POUR_GRAMS;
      pourFromStockBottle(addAnimation.bottleId, addAnimation.targetId, grams);
      setAddAnimation(null);
    }, POUR_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [addAnimation, pourFromStockBottle]);

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
        <ChemistryInteractionProvider
          onConfirmPlacement={(id, position, rotationY) => {
            const capability = getInteractable(id);
            setItemTransform(id, position, rotationY, {
              elevation: capability?.tableElevation,
              storageSlotId: null,
            });
          }}
          getInteractableState={(id) => {
            const container = state.containers.find((item) => item.id === id);
            const bottle = state.stockBottles.find((item) => item.id === id);
            const tool = state.tools.find((item) => item.id === id);
            const item = container ?? bottle ?? tool;
            return {
              position: item?.position,
              elevation: item?.elevation,
              rotationY: item?.rotationY,
              storageSlotId: item?.storageSlotId,
              isOn: tool?.isOn,
              temperatureC: tool?.temperatureC,
              hasActiveFlame: tool?.isOn,
            };
          }}
          isInteractableAccessible={(id) => {
            const item =
              state.containers.find((entry) => entry.id === id) ??
              state.stockBottles.find((entry) => entry.id === id) ??
              state.tools.find((entry) => entry.id === id);
            if (!item?.storageSlotId) return true;
            const slot = getSlot(item.storageSlotId);
            if (!slot) return false;
            return state.cabinets.find((cabinet) => cabinet.id === slot.cabinetId)?.isOpen === true;
          }}
          onBeginPickup={releaseItemFromSlot}
          onCancelPickup={(id, origin) =>
            setItemTransform(id, origin.position, origin.rotationY, {
              elevation: origin.elevation,
              storageSlotId: origin.storageSlotId,
            })
          }
          onToggleCabinet={toggleCabinet}
          getCabinetState={(id) => {
            const cabinet = state.cabinets.find((entry) => entry.id === id);
            return cabinet ? { isOpen: cabinet.isOpen } : null;
          }}
          canStoreInCabinet={(itemId, cabinetId) =>
            findAvailableStorageSlot(itemId, cabinetId) !== null
          }
          onStoreInCabinet={storeItemInCabinet}
        >
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
                    <EmergencyStopResetButton />
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

                {/* Stage 5.7 audit — заголовок добавлен для ясности: без него
                    на странице выглядело как два независимых счетчика
                    прогресса ("Эксперимент 1/4" и отдельно каталог из 12
                    работ) без объяснения, чем они отличаются. Чисто
                    визуальное уточнение, логика ExperimentPanel не менялась. */}
                <div className="sm:col-span-2">
                  <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-slate-500">Быстрая проверка</h3>
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
        </ChemistryInteractionProvider>
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
