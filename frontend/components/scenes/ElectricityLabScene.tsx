"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html, QuadraticBezierLine, MeshTransmissionMaterial, useGLTF } from "@react-three/drei";
import { Play, Pause, RotateCcw } from "lucide-react";
import CanvasShell from "@/components/scenes/CanvasShell";
import AITeacherChat from "@/components/ai/AITeacherChat";
import TaskPanel from "@/components/tasks/TaskPanel";
import { TaskProgressProvider, useTaskProgress } from "@/components/tasks/TaskProgressProvider";
import {
  ExperimentStateProvider,
  useExperimentState,
} from "@/components/core/ExperimentStateProvider";
import { WireDragProvider, WireDragSurface, useWireDrag } from "@/components/core/WireDragProvider";
import ConnectionPoint from "@/components/core/ConnectionPoint";
import { TutorialProvider, useTutorial } from "@/components/tutorial/TutorialProvider";
import TutorialPanel from "@/components/tutorial/TutorialPanel";
import { ElectricityLabExperienceProvider, useElectricityLabExperience } from "@/components/core/ElectricityLabExperienceProvider";
import ElectricityExperimentCatalogBrowser from "@/components/lab/ElectricityExperimentCatalogBrowser";
import ElectricityGuidedLabPanel from "@/components/lab/ElectricityGuidedLabPanel";
import ElectricityLabReportPanel from "@/components/lab/ElectricityLabReportPanel";
import ElectricityLabNotebookPanel from "@/components/lab/ElectricityLabNotebookPanel";
import { COMPONENT_INFO } from "@/lib/component-info";
import { useSimulationClock } from "@/lib/use-simulation-clock";
import { useQuality, type QualityLevel } from "@/lib/quality-context";
import { buildAIContext } from "@/lib/ai-context-builder";
import { solveCircuit, bulbBrightness, type CircuitComponent, type CircuitSolution, type Connection } from "@/lib/circuit-engine";
import { apiFetch, ApiError } from "@/lib/api";
import { playConnect, playDisconnect, playFuseBlow, playPowerOn, playSwitchClick } from "@/lib/sound-effects";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { explainError } from "@/lib/error-explanations";
import { submitLabCompleted } from "@/lib/progress-client";
import type { Simulation } from "@/lib/types";

// Guided Onboarding: наведение курсора в любую точку компонента (не только
// на клемму) показывает всплывающую подпись с названием — общий хук вместо
// повторения одной и той же пары обработчиков в каждом компоненте
function useHoverTooltip() {
  const [hovered, setHovered] = useState(false);
  return {
    hovered,
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHovered(true);
    },
    onPointerOut: () => setHovered(false),
  };
}

function TooltipLabel({ label, position = [0, 0.55, 0] as [number, number, number] }: { label: string; position?: [number, number, number] }) {
  return (
    <Html position={position} center distanceFactor={8} style={{ pointerEvents: "none" }}>
      <div className="pointer-events-none whitespace-nowrap rounded-lg border border-white/10 bg-slate-900/90 px-2 py-1 text-xs text-slate-100 shadow-lg">
        {label}
      </div>
    </Html>
  );
}

const BULB_RATED_POWER_W = 18;

// фиксированная раскладка стенда: компоненты не перетаскиваются по столу
// (это отдельная фича на будущее) — интерактивность сосредоточена на
// главном требуемом жесте: соединении терминалов проводом
const INITIAL_COMPONENTS: CircuitComponent[] = [
  { id: "battery", kind: "battery", terminals: ["battery_pos", "battery_neg"], voltageV: 12 },
  { id: "resistor", kind: "resistor", terminals: ["resistor_a", "resistor_b"], resistanceOhm: 4 },
  { id: "bulb", kind: "bulb", terminals: ["bulb_a", "bulb_b"], resistanceOhm: 2, ratedPowerW: BULB_RATED_POWER_W },
  { id: "switch", kind: "switch", terminals: ["switch_a", "switch_b"], isClosed: true },
  { id: "ammeter", kind: "ammeter", terminals: ["ammeter_a", "ammeter_b"] },
  { id: "fuse", kind: "fuse", terminals: ["fuse_a", "fuse_b"], ratedCurrentA: 5, isBlown: false },
  { id: "voltmeter", kind: "voltmeter", terminals: ["voltmeter_a", "voltmeter_b"] },
];

// латунь/медь для контактов и наконечников проводов — единая палитра
// "металла" по всей сцене вместо нейтрального серого
const BRASS_COLOR = "#c9a227";
const COPPER_COLOR = "#b87333";

// Visual Realism Upgrade: готовые CC0 GLB-модели (battery/bulb/switch/
// multimeter) вместо части процедурных примитивов. Модели уже оптимизированы
// офлайн через gltf-transform (resize+webp+meshopt: 36.6MB -> ~1.1MB суммарно)
// — здесь только загрузка и подгонка масштаба/поворота под существующие
// клеммы (ConnectionPoint) и анимации, физика/логика не тронуты.
const MODEL_PATHS = {
  battery: "/models/electricity/battery.glb",
  bulb: "/models/electricity/bulb.glb",
  switch: "/models/electricity/switch.glb",
  multimeter: "/models/electricity/multimeter.glb",
} as const;

useGLTF.preload(MODEL_PATHS.battery);
useGLTF.preload(MODEL_PATHS.bulb);
useGLTF.preload(MODEL_PATHS.switch);
useGLTF.preload(MODEL_PATHS.multimeter);

// клонируем сцену модели (useGLTF кэширует и делит один и тот же граф между
// вызовами), один раз включаем тени и клонируем материалы явно — Object3D.
// clone(true) клонирует иерархию мешей, но НЕ материалы (они остаются общими
// с закэшированным оригиналом useGLTF), а лампе ниже нужно менять
// emissiveIntensity нити только у своего инстанса.
function prepareClone(scene: THREE.Object3D): THREE.Object3D {
  const clone = scene.clone(true);
  clone.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // после meshopt/quantization у некоторых мешей боковая сфера отсечения
      // (boundingSphere) считается неверно относительно родительского
      // трансформа — отключаем frustum culling для надёжности, мешей в
      // сцене мало, это не сказывается на производительности
      mesh.frustumCulled = false;
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => m.clone());
      } else if (mesh.material) {
        mesh.material = mesh.material.clone();
      }
    }
  });
  return clone;
}

// Честный автофит по РЕАЛЬНОМУ bounding box уже распакованной (dequantized)
// three.js-геометрии — не по сырым числам из glTF JSON (которые после
// KHR_mesh_quantization ничего не говорят без учёта per-node scale/offset).
// targetSize — желаемый размер по самой длинной оси, тот же, что был у
// процедурного меша, который эта модель заменяет (см. вызовы ниже), поэтому
// существующие ConnectionPoint (клеммы) остаются на месте без пересчёта.
// Модель всегда центрируется по X/Z и по умолчанию по Y тоже (так были
// центрированы все заменяемые процедурные меши); yOffset — осознанный сдвиг
// по Y там, где это нужно по композиции (напр. лампа — визуальная сборка
// смещена вверх относительно точек подключения проводов снизу).
function autoFit(clone: THREE.Object3D, targetSize: number, yOffset: number) {
  const box = new THREE.Box3().setFromObject(clone);
  const size = box.getSize(new THREE.Vector3());
  const longestAxis = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetSize / longestAxis;
  clone.scale.setScalar(scale);

  const scaledBox = new THREE.Box3().setFromObject(clone);
  const center = scaledBox.getCenter(new THREE.Vector3());
  clone.position.x -= center.x;
  clone.position.y -= center.y - yOffset;
  clone.position.z -= center.z;
}

function usePreparedGLTF(path: string, targetSize: number, yOffset = 0) {
  const { scene } = useGLTF(path);
  return useMemo(() => {
    const clone = prepareClone(scene);
    autoFit(clone, targetSize, yOffset);
    return clone;
  }, [scene, targetSize, yOffset]);
}

// Рубильник — рычаг ("SwitchHandle") остаётся ровно там, где его поставил
// автор модели, внутри общей иерархии; вращаем его СОБСТВЕННЫЙ rotation
// (локальный, вокруг его же авторского шарнира), а не переносим меш в
// отдельный узел — так исключён риск сломать позицию при репарентинге.
// Рычаг приходит из glTF с ненулевым "родным" углом покоя (авторский
// шарнир смонтирован под наклоном) — baseHandleRotationX запоминает этот
// угол один раз при загрузке, чтобы анимация тумблера СМЕЩАЛА его, а не
// затирала абсолютным значением (иначе рычаг проваливался в корпус).
function useSwitchModel(targetSize: number) {
  const { scene } = useGLTF(MODEL_PATHS.switch);
  return useMemo(() => {
    const clone = prepareClone(scene);
    autoFit(clone, targetSize, 0);
    const handle = clone.getObjectByName("SwitchHandle_SwitchHandle_0") as THREE.Object3D | null;
    const baseHandleRotationX = handle?.rotation.x ?? 0;
    return { base: clone, handle, baseHandleRotationX };
  }, [scene, targetSize]);
}

// процедурная текстура столешницы (шум + пара царапин) — тот же прием,
// что и градиентный фон в CanvasShell (CanvasTexture), без внешних файлов
function useLabBenchTexture() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#20262f";
      ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 3000; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const shade = 15 + Math.random() * 20;
        ctx.fillStyle = `rgba(${shade + 25},${shade + 30},${shade + 38},0.35)`;
        ctx.fillRect(x, y, 1, 1);
      }
      ctx.strokeStyle = "rgba(148,163,184,0.12)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 16; i++) {
        const x1 = Math.random() * 512;
        const y1 = Math.random() * 512;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + (Math.random() - 0.5) * 140, y1 + (Math.random() - 0.5) * 50);
        ctx.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 1.3);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);

  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function Workbench() {
  const benchTexture = useLabBenchTexture();
  return (
    <mesh position={[0, -0.05, 0]} receiveShadow>
      <boxGeometry args={[9, 0.1, 4]} />
      <meshStandardMaterial map={benchTexture} roughness={0.55} metalness={0.1} bumpMap={benchTexture} bumpScale={0.002} />
    </mesh>
  );
}

// Stage E-2 (Task 4 — Interactive Guidance): подсветка нужной клеммы
// теперь может приходить из двух источников — одноразового Guided
// Onboarding (useTutorial) и текущего шага "Сборка" выбранной
// лабораторной работы (useElectricityLabExperience). Оба читают только
// реальное состояние (connections/шаг), никакого заскриптованного
// сценария — просто объединяем, какую пару терминалов подсветить прямо
// сейчас, не трогая ни один из двух источников по отдельности.
function useSuggestedTerminals(): [string, string] | null {
  const { suggestedTerminals: tutorialTerminals } = useTutorial();
  const { suggestedTerminals: labTerminals } = useElectricityLabExperience();
  return tutorialTerminals ?? labTerminals;
}

function Battery() {
  const { hovered, onPointerOver, onPointerOut } = useHoverTooltip();
  const suggestedTerminals = useSuggestedTerminals();
  const info = COMPONENT_INFO.battery;
  // targetSize=0.9 — та же длина, что была у процедурного cylinderGeometry
  // (args={[0.22, 0.22, 0.9, 24]}), поэтому клеммы ниже остаются на месте.
  // Модель уже авторски смоделирована лежащей на боку (её собственный
  // bbox: X ±1.0, Y/Z ±0.25 — длинная ось УЖЕ совпадает со сценовой X,
  // вдоль которой стоят клеммы), поэтому в отличие от старого
  // cylinderGeometry (который по умолчанию стоял вдоль Y и требовал
  // поворота на 90°) этой модели дополнительный поворот не нужен —
  // с ним она вставала вертикально ("солдатиком").
  const model = usePreparedGLTF(MODEL_PATHS.battery, 0.9);
  return (
    <group position={[-3.2, 0.28, 0]} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      {/* реалистичная GLB-модель батареи вместо процедурного цилиндра —
          масштаб посчитан автофитом, модель уже лежит вдоль нужной оси */}
      <primitive object={model} />
      <ConnectionPoint
        id="battery_pos"
        position={[-0.4, 0, 0]}
        color="#ef4444"
        suggested={suggestedTerminals?.includes("battery_pos") ?? false}
      />
      <ConnectionPoint
        id="battery_neg"
        position={[0.4, 0, 0]}
        color="#1e293b"
        suggested={suggestedTerminals?.includes("battery_neg") ?? false}
      />
      {/* Guided Onboarding: явные +/- рядом с клеммами, чтобы новичок сразу
          понимал полярность, а не считывал её только по цвету */}
      <Html position={[-0.4, 0.32, 0]} center distanceFactor={8} style={{ pointerEvents: "none" }}>
        <div className="pointer-events-none text-lg font-bold leading-none text-red-400">+</div>
      </Html>
      <Html position={[0.4, 0.32, 0]} center distanceFactor={8} style={{ pointerEvents: "none" }}>
        <div className="pointer-events-none text-lg font-bold leading-none text-slate-300">−</div>
      </Html>
      {hovered && <TooltipLabel label={`${info.emoji} ${info.name}`} />}
    </group>
  );
}

function Resistor() {
  const bandColors = ["#a16207", "#000000", "#dc2626"];
  const { hovered, onPointerOver, onPointerOut } = useHoverTooltip();
  const suggestedTerminals = useSuggestedTerminals();
  const info = COMPONENT_INFO.resistor;
  return (
    <group position={[-1.5, 0.28, 0]} rotation={[0, 0, Math.PI / 2]} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      {/* керамическое тело */}
      <mesh castShadow>
        <cylinderGeometry args={[0.13, 0.13, 0.7, 20]} />
        <meshStandardMaterial color="#e7d8b1" roughness={0.5} metalness={0} />
      </mesh>
      {bandColors.map((color, i) => (
        <mesh key={color + i} position={[0, -0.15 + i * 0.15, 0]}>
          <cylinderGeometry args={[0.135, 0.135, 0.04, 20]} />
          <meshStandardMaterial color={color} roughness={0.35} />
        </mesh>
      ))}
      {/* металлические выводы по краям керамики */}
      <mesh position={[0, 0.37, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.06, 10]} />
        <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.37, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.06, 10]} />
        <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.3} />
      </mesh>
      <ConnectionPoint id="resistor_a" position={[0, 0.4, 0]} suggested={suggestedTerminals?.includes("resistor_a") ?? false} />
      <ConnectionPoint id="resistor_b" position={[0, -0.4, 0]} suggested={suggestedTerminals?.includes("resistor_b") ?? false} />
      {hovered && <TooltipLabel label={`${info.emoji} ${info.name}`} position={[0, 0, 0.2]} />}
    </group>
  );
}

function Bulb({ brightness }: { brightness: number }) {
  const lightRef = useRef<THREE.PointLight>(null);
  const filamentMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const { hovered, onPointerOver, onPointerOut } = useHoverTooltip();
  const suggestedTerminals = useSuggestedTerminals();
  const info = COMPONENT_INFO.bulb;
  // targetSize=0.68 — высота старой сборки (цоколь -0.4 .. верх стекла
  // +0.28); yOffset=-0.06 ставит низ модели туда же, где был низ цоколя,
  // чтобы клеммы ниже (провода-выводы) остались на прежнем месте
  const model = usePreparedGLTF(MODEL_PATHS.bulb, 0.68, -0.06);

  useEffect(() => {
    // нить накала в GLB-модели — единственный меш, которому нужно реально
    // светиться (управляется тем же brightness, что и раньше, ничего
    // не заскриптовано)
    const filament = model.getObjectByName("filament (lit)_0") as THREE.Mesh | undefined;
    const material = filament?.material as THREE.MeshStandardMaterial | undefined;
    if (material) {
      material.emissive = new THREE.Color("#facc15");
      material.emissiveIntensity = 0;
      filamentMaterialRef.current = material;
    }
  }, [model]);

  useFrame((_, delta) => {
    // плавный разогрев/остывание — тот же easing-принцип для света и
    // свечения нити, скорость подобрана так, чтобы лампа "оживала"
    // ощутимо, но не мгновенно
    const targetIntensity = brightness * 3.5;
    if (lightRef.current) {
      lightRef.current.intensity = THREE.MathUtils.lerp(lightRef.current.intensity, targetIntensity, Math.min(1, delta * 2.5));
    }
    if (filamentMaterialRef.current) {
      // без базовой засветки — при нулевом токе нить должна быть полностью темной
      filamentMaterialRef.current.emissiveIntensity = THREE.MathUtils.lerp(
        filamentMaterialRef.current.emissiveIntensity,
        brightness * 3.5,
        Math.min(1, delta * 2.5)
      );
    }
  });

  return (
    <group position={[0.2, 0.6, 0]} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      {/* реалистичная GLB-модель лампы накаливания (стекло/нить/цоколь уже
          смоделированы отдельными мешами) вместо процедурного шара+тора */}
      <primitive object={model} />
      <pointLight ref={lightRef} color="#fde047" intensity={0} distance={4} decay={2} />
      <ConnectionPoint id="bulb_a" position={[-0.42, -0.6, 0]} suggested={suggestedTerminals?.includes("bulb_a") ?? false} />
      <ConnectionPoint id="bulb_b" position={[0.42, -0.6, 0]} suggested={suggestedTerminals?.includes("bulb_b") ?? false} />
      {hovered && <TooltipLabel label={`${info.emoji} ${info.name}`} position={[0, 0.4, 0]} />}
    </group>
  );
}

function Switch({ isClosed, onToggle }: { isClosed: boolean; onToggle: () => void }) {
  const { hovered, onPointerOver, onPointerOut } = useHoverTooltip();
  const suggestedTerminals = useSuggestedTerminals();
  const info = COMPONENT_INFO.switch;
  // targetSize=0.8 — модель это компактный тумблер (мировой bbox после
  // авторской Z-up→Y-up коррекции: X≈0.13, Y≈0.23, Z≈0.13 — самая длинная
  // ось "вверх", а не "вширь", как у старого плоского рычага box[0.9,...]),
  // поэтому подгонка по длине всей модели к 0.9 раздувала её втрое; 0.8 по
  // высоте даёт заметный, реалистично крупный корпус (явно больше клемм-
  // маркеров ConnectionPoint радиусом 0.055–0.16), а не игрушечный кубик
  const { base, handle, baseHandleRotationX } = useSwitchModel(0.8);

  useFrame((_, delta) => {
    if (!handle) return;
    // смещение ОТ авторского угла покоя рычага, а не абсолютный угол
    const targetAngle = baseHandleRotationX + (isClosed ? 0 : -0.7);
    handle.rotation.x = THREE.MathUtils.lerp(handle.rotation.x, targetAngle, Math.min(1, delta * 6));
  });

  return (
    <group position={[1.9, 0.1, 0]} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      <primitive object={base} onClick={onToggle} />
      <ConnectionPoint id="switch_a" position={[-0.4, 0.13, 0]} suggested={suggestedTerminals?.includes("switch_a") ?? false} />
      <ConnectionPoint id="switch_b" position={[0.4, 0.13, 0]} suggested={suggestedTerminals?.includes("switch_b") ?? false} />
      {hovered && <TooltipLabel label={`${info.emoji} ${info.name}`} position={[0, 0.35, 0]} />}
    </group>
  );
}

function MeterHousing({
  position,
  label,
  value,
  unit,
  testId,
}: {
  position: [number, number, number];
  label: string;
  value: number;
  unit: string;
  testId: string;
}) {
  const displayRef = useRef<HTMLDivElement>(null);
  const displayedValueRef = useRef(value);

  useFrame((_, delta) => {
    // плавная смена цифр на экране прибора вместо мгновенного скачка —
    // сам displayedValueRef и содержимое div обновляются напрямую через
    // ref, а не через React state, чтобы не плодить лишние ре-рендеры
    // каждый кадр (data-value ниже остается точным для тестов/расчетов)
    displayedValueRef.current = THREE.MathUtils.lerp(displayedValueRef.current, value, Math.min(1, delta * 5));
    if (displayRef.current) {
      displayRef.current.textContent = `${displayedValueRef.current.toFixed(2)} ${unit}`;
    }
  });

  // targetSize=0.5 — примерно та же длина, что у старого box[0.55,0.4,0.3]
  const model = usePreparedGLTF(MODEL_PATHS.multimeter, 0.5);

  return (
    <group position={position}>
      {/* реалистичная GLB-модель мультиметра как корпус для амперметра и
          вольтметра — цифровое табло поверх (Html) остаётся как есть */}
      <group rotation={[0, Math.PI / 2, 0]}>
        <primitive object={model} />
      </group>
      <mesh position={[0, 0.06, 0.151]}>
        <planeGeometry args={[0.34, 0.22]} />
        <meshStandardMaterial color="#052e1b" roughness={0.4} metalness={0.1} />
      </mesh>
      <Html position={[0, 0.06, 0.16]} center distanceFactor={6} occlude>
        <div
          data-testid={testId}
          data-value={value}
          className="pointer-events-none rounded bg-black/80 px-2 py-1 font-mono text-[10px] text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.45)]"
        >
          <div className="text-[8px] uppercase tracking-widest text-emerald-600">{label}</div>
          <div ref={displayRef} className="tabular-nums">
            {value.toFixed(2)} {unit}
          </div>
        </div>
      </Html>
    </group>
  );
}

function Ammeter({ currentA }: { currentA: number }) {
  const { hovered, onPointerOver, onPointerOut } = useHoverTooltip();
  const suggestedTerminals = useSuggestedTerminals();
  const info = COMPONENT_INFO.ammeter;
  return (
    <group position={[3.2, 0.28, -0.45]} rotation={[0, Math.PI / 2, 0]} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      <MeterHousing position={[0, 0, 0]} label="A" value={currentA} unit="A" testId="ammeter-reading" />
      <ConnectionPoint id="ammeter_a" position={[0, 0, 0.45]} suggested={suggestedTerminals?.includes("ammeter_a") ?? false} />
      <ConnectionPoint id="ammeter_b" position={[0, 0, -0.45]} suggested={suggestedTerminals?.includes("ammeter_b") ?? false} />
      {hovered && <TooltipLabel label={`${info.emoji} ${info.name}`} position={[0, 0.3, 0]} />}
    </group>
  );
}

function Voltmeter({ voltageV }: { voltageV: number }) {
  const { hovered, onPointerOver, onPointerOut } = useHoverTooltip();
  const suggestedTerminals = useSuggestedTerminals();
  const info = COMPONENT_INFO.voltmeter;
  return (
    <group position={[-1.5, 1.05, 0.9]} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      <MeterHousing position={[0, 0, 0]} label="V" value={voltageV} unit="V" testId="voltmeter-reading" />
      <ConnectionPoint id="voltmeter_a" position={[-0.4, 0, 0]} color={BRASS_COLOR} suggested={suggestedTerminals?.includes("voltmeter_a") ?? false} />
      <ConnectionPoint id="voltmeter_b" position={[0.4, 0, 0]} color={BRASS_COLOR} suggested={suggestedTerminals?.includes("voltmeter_b") ?? false} />
      {hovered && <TooltipLabel label={`${info.emoji} ${info.name}`} position={[0, 0.3, 0]} />}
    </group>
  );
}

function FuseParticles({ active, timeScale, count }: { active: boolean; timeScale: number; count: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particles = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        t: Math.random(),
        angle: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 0.5,
      })),
    [count]
  );

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    particles.forEach((p, i) => {
      if (active) {
        p.t += delta * p.speed * timeScale;
        if (p.t > 1) p.t = 0;
      }
      const radius = p.t * 0.35;
      const scale = active ? 0.02 * (1 - p.t) : 0.0001;
      dummy.position.set(Math.cos(p.angle) * radius, p.t * 0.3, Math.sin(p.angle) * radius);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshStandardMaterial color="#fb923c" emissive="#f97316" emissiveIntensity={2} />
    </instancedMesh>
  );
}

function Fuse({ isBlown, justBlown, timeScale }: { isBlown: boolean; justBlown: boolean; timeScale: number }) {
  const { preset } = useQuality();
  const particleCount = Math.min(preset.maxParticles, 14);
  const { hovered, onPointerOver, onPointerOut } = useHoverTooltip();
  const suggestedTerminals = useSuggestedTerminals();
  const info = COMPONENT_INFO.fuse;
  return (
    <group position={[1.4, 0.28, -1.6]} rotation={[0, 0, Math.PI / 2]} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      <mesh castShadow>
        <cylinderGeometry args={[0.09, 0.09, 0.5, 16]} />
        <MeshTransmissionMaterial thickness={0.03} roughness={0.1} transmission={0.85} ior={1.4} color={isBlown ? "#1c1917" : "#e0f2fe"} resolution={64} samples={1} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[0.01, 0.01, isBlown ? 0.1 : 0.4, 8]} />
        <meshStandardMaterial color={isBlown ? "#1c1917" : "#94a3b8"} metalness={0.8} roughness={0.3} />
      </mesh>
      <FuseParticles active={justBlown} timeScale={timeScale} count={particleCount} />
      <ConnectionPoint id="fuse_a" position={[0, 0.3, 0]} suggested={suggestedTerminals?.includes("fuse_a") ?? false} />
      <ConnectionPoint id="fuse_b" position={[0, -0.3, 0]} suggested={suggestedTerminals?.includes("fuse_b") ?? false} />
      {hovered && <TooltipLabel label={`${info.emoji} ${info.name}`} position={[0, 0, 0.2]} />}
    </group>
  );
}

// провод как объемная "резиновая" трубка с легким провисом (а не плоская
// линия) + латунные наконечники, которые слегка "подпрыгивают" при
// подключении — ощущение физической фиксации. Геометрия строится через
// useMemo (пересчитывается только когда меняются концы, не каждый кадр)
// и явно освобождается при размонтировании/пересборке.
function WireTube({ a, b, onClick }: { a: THREE.Vector3; b: THREE.Vector3; onClick: (e: { stopPropagation: () => void }) => void }) {
  const capRef = useRef<THREE.Group>(null);
  const mountedAtRef = useRef(performance.now());

  const geometry = useMemo(() => {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y -= 0.18; // легкий провис, как у настоящего провода
    const curve = new THREE.CatmullRomCurve3([a, mid, b]);
    return new THREE.TubeGeometry(curve, 20, 0.022, 8, false);
  }, [a, b]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(() => {
    if (!capRef.current) return;
    const elapsed = performance.now() - mountedAtRef.current;
    const t = Math.min(1, elapsed / 350);
    // легкий bounce с затуханием — "защелкивание" провода на месте
    const scale = t >= 1 ? 1 : 1 + Math.sin(t * Math.PI) * 0.45 * (1 - t);
    capRef.current.scale.setScalar(scale);
  });

  return (
    <group>
      <mesh geometry={geometry} onClick={onClick} castShadow>
        <meshStandardMaterial color="#18181b" roughness={0.7} metalness={0.05} />
      </mesh>
      <group ref={capRef}>
        <mesh position={a}>
          <sphereGeometry args={[0.032, 10, 10]} />
          <meshStandardMaterial color={COPPER_COLOR} metalness={0.85} roughness={0.25} />
        </mesh>
        <mesh position={b}>
          <sphereGeometry args={[0.032, 10, 10]} />
          <meshStandardMaterial color={COPPER_COLOR} metalness={0.85} roughness={0.25} />
        </mesh>
      </group>
    </group>
  );
}

function Wires() {
  const { state, removeConnection } = useExperimentState();
  const { getTerminalPosition } = useWireDrag();

  return (
    <>
      {state.connections.map((connection) => {
        const a = getTerminalPosition(connection.terminals[0]);
        const b = getTerminalPosition(connection.terminals[1]);
        if (!a || !b) return null;
        return (
          <WireTube
            key={connection.id}
            a={a}
            b={b}
            onClick={(e) => {
              e.stopPropagation();
              playDisconnect();
              removeConnection(connection.id);
            }}
          />
        );
      })}
    </>
  );
}

function PendingWirePreview() {
  const { draggingFrom, pendingPoint, getTerminalPosition } = useWireDrag();
  if (!draggingFrom || !pendingPoint) return null;
  const from = getTerminalPosition(draggingFrom);
  if (!from) return null;
  // легкий провис у "тянущегося" провода (дешевая QuadraticBezierLine,
  // а не полноценная trubка — этот превью пересчитывается на каждое
  // движение мыши, тут важна дешевизна, а не детальный объем)
  const mid = from.clone().add(pendingPoint).multiplyScalar(0.5);
  mid.y -= 0.12;
  return (
    <QuadraticBezierLine
      start={from}
      end={pendingPoint}
      mid={mid}
      color="#facc15"
      lineWidth={1.5}
      dashed
      dashScale={4}
      transparent
      opacity={0.6}
    />
  );
}

function CircuitScene({ solution, timeScale }: { solution: CircuitSolution; timeScale: number }) {
  const { state, updateComponent, logEvent } = useExperimentState();
  const shortLoggedRef = useRef(false);

  useEffect(() => {
    if (solution.fuseToBlowId) {
      updateComponent(solution.fuseToBlowId, { isBlown: true });
      logEvent({ type: "fuse_blown", componentId: solution.fuseToBlowId });
      logEvent({ type: "component_damaged", componentId: solution.fuseToBlowId });
      playFuseBlow();
    }
  }, [solution.fuseToBlowId, updateComponent, logEvent]);

  useEffect(() => {
    if (solution.isShortCircuit && !shortLoggedRef.current) {
      shortLoggedRef.current = true;
      logEvent({ type: "short_circuit" });
    }
    if (!solution.isShortCircuit) shortLoggedRef.current = false;
  }, [solution.isShortCircuit, logEvent]);

  const bulb = state.components.find((c) => c.id === "bulb");
  const switchComponent = state.components.find((c) => c.id === "switch");
  const fuse = state.components.find((c) => c.id === "fuse");

  const brightness = bulbBrightness(solution.readings.bulb, bulb?.ratedPowerW ?? BULB_RATED_POWER_W);
  const ammeterReading = solution.readings.ammeter?.currentA ?? 0;
  const voltmeterReading = solution.readings.voltmeter?.voltageV ?? 0;

  return (
    <group>
      {/* дополнительный мягкий фронтальный свет для этой сцены — не
          трогает общие настройки CanvasShell (SimLab/GeoWorld не меняются) */}
      <directionalLight position={[1, 4, 6]} intensity={0.35} color="#e0f2fe" />
      <pointLight position={[-2, 2.5, 3]} intensity={0.25} color="#fef3c7" distance={8} decay={2} />

      <Workbench />
      <Battery />
      <Resistor />
      <Bulb brightness={brightness} />
      <Switch
        isClosed={switchComponent?.isClosed ?? true}
        onToggle={() => {
          const next = !(switchComponent?.isClosed ?? true);
          updateComponent("switch", { isClosed: next });
          logEvent({ type: "param_changed", componentId: "switch", field: "isClosed", value: next });
          playSwitchClick();
        }}
      />
      <Ammeter currentA={ammeterReading} />
      <Voltmeter voltageV={voltmeterReading} />
      <Fuse isBlown={fuse?.isBlown ?? false} justBlown={Boolean(solution.fuseToBlowId)} timeScale={timeScale} />
      <Wires />
      <PendingWirePreview />
      <WireDragSurface y={0.01} size={12} />
    </group>
  );
}

// мост между WireDragProvider (обычный React-контекст, живет и снаружи
// Canvas) и CanvasShell: пока пользователь тянет провод, OrbitControls
// должен быть выключен — иначе тот же pointer-жест дополнительно крутит
// камеру, и координаты терминалов "уезжают" прямо во время клика
function ElectricityCanvas({
  quality,
  solution,
  timeScale,
}: {
  quality: QualityLevel;
  solution: CircuitSolution;
  timeScale: number;
}) {
  const { draggingFrom } = useWireDrag();
  return (
    <CanvasShell
      cameraPosition={[3.4, 2.6, 7.4]}
      target={[0.2, 0.35, -0.6]}
      floorY={-0.06}
      bloomIntensity={0.4}
      quality={quality}
      orbitEnabled={!draggingFrom}
      minPolarAngle={Math.PI / 6}
      maxPolarAngle={Math.PI / 2.1}
    >
      <CircuitScene solution={solution} timeScale={timeScale} />
    </CanvasShell>
  );
}

const QUALITY_OPTIONS: QualityLevel[] = ["low", "medium", "high"];
const QUALITY_LABEL: Record<QualityLevel, string> = { low: "Низкое", medium: "Среднее", high: "Высокое" };

interface ElectricityLabSceneProps {
  simulation: Simulation;
}

export default function ElectricityLabScene({ simulation }: ElectricityLabSceneProps) {
  return (
    <ExperimentStateProvider initialComponents={INITIAL_COMPONENTS}>
      <ElectricityLabInner simulation={simulation} />
    </ExperimentStateProvider>
  );
}

// AI Teacher (Stage 3): собирает LabAIContext из уже посчитанного состояния
// (Task Validator через useTaskProgress + Physics/Circuit Engine через
// components/connections/solution) и передает его в чат — рендерится
// внутри TaskProgressProvider, поэтому может звать useTaskProgress()
function TeacherChatPanel({
  simulationId,
  components,
  connections,
  solution,
}: {
  simulationId: string;
  components: CircuitComponent[];
  connections: Connection[];
  solution: CircuitSolution;
}) {
  const { task, status, totalXp, result, learningProfile, recordHintUsed } = useTaskProgress();
  // Stage E-2/E-3 (Task 7 — AI Teacher Upgrade): AI получает ТОЛЬКО уже
  // посчитанное состояние учебного слоя (выбранная лабораторная работа,
  // текущий шаг, реально записанные измерения, последняя запись
  // журнала, черновик вывода) — ничего не решает само про прогресс.
  const {
    selectedExperiment,
    currentStep,
    isCurrentStepUnlocked,
    measurements,
    completedExperimentIds,
    lastNotebookEntry,
    conclusionDraft,
    recordHintUsed: recordLabHintUsed,
  } = useElectricityLabExperience();
  const context = useMemo(
    () =>
      buildAIContext({
        task,
        taskStatus: status,
        xp: totalXp,
        components,
        connections,
        solution,
        validation: result,
        labExperiment: selectedExperiment,
        labStep: currentStep,
        labStepUnlocked: isCurrentStepUnlocked,
        labMeasurements: measurements,
        labCompletedExperimentIds: completedExperimentIds,
        labLastNotebookEntry: lastNotebookEntry,
        labConclusionDraft: conclusionDraft,
      }),
    [
      task,
      status,
      totalXp,
      components,
      connections,
      solution,
      result,
      selectedExperiment,
      currentStep,
      isCurrentStepUnlocked,
      measurements,
      completedExperimentIds,
      lastNotebookEntry,
      conclusionDraft,
    ]
  );
  return (
    <AITeacherChat
      simulationId={simulationId}
      context={context}
      learningProfile={learningProfile}
      onMessageSent={() => {
        recordHintUsed();
        recordLabHintUsed();
      }}
    />
  );
}

// Stage E-2 — то же самое, что Emergency Stop Reset в Chemistry World
// Stage 5.7: сброс цепи (кнопка "Сбросить") должен сбрасывать И учебную
// сессию, иначе студент останется на устаревшем шаге против уже
// сброшенной, пустой цепи.
function ElectricityResetButton({ onReset }: { onReset: () => void }) {
  const { resetLabSession } = useElectricityLabExperience();
  return (
    <button
      onClick={() => {
        onReset();
        resetLabSession();
      }}
      data-testid="reset-button"
      className="flex items-center gap-2 rounded-full border border-glass-border px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/5"
    >
      <RotateCcw size={16} />
      Сбросить
    </button>
  );
}

// переключает каталог/пошаговую панель в зависимости от того, выбрана ли
// сейчас лабораторная работа — и всегда показывает отчёт поверх, если
// только что была завершена работа (тот же паттерн, что
// GuidedLabExperienceSection в Chemistry World)
function ElectricityLabExperienceSection() {
  const { selectedExperiment, lastNotebookEntry } = useElectricityLabExperience();
  return (
    <>
      {lastNotebookEntry && <ElectricityLabReportPanel />}
      {selectedExperiment ? <ElectricityGuidedLabPanel /> : <ElectricityExperimentCatalogBrowser />}
    </>
  );
}

// Adaptive Learning (Stage 4): показывает реальные события из
// TaskProgressProvider — новые достижения (уже разблокированные backend'ом
// на основании реальной истории) и заметку о повторяющейся ошибке (backend
// реально нашел 3 одинаковых кода ошибки подряд в LearningEvent).
function ProgressBanners() {
  const { newAchievements, clearNewAchievements, repeatedMistakeCode, dismissRepeatedMistake } = useTaskProgress();

  if (newAchievements.length === 0 && !repeatedMistakeCode) return null;

  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      {newAchievements.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-200">
          <span>
            {newAchievements
              .map((code) => `${ACHIEVEMENTS[code]?.emoji ?? "🏆"} ${ACHIEVEMENTS[code]?.title ?? code}`)
              .join(", ")}{" "}
            — новое достижение!
          </span>
          <button onClick={clearNewAchievements} className="text-amber-300/70 hover:text-amber-100">
            ×
          </button>
        </div>
      )}
      {repeatedMistakeCode && (
        <div className="flex items-center justify-between rounded-xl border border-sky-400/40 bg-sky-500/10 p-3 text-sm text-sky-200">
          <span>
            Я заметил, что ты уже несколько раз повторяешь одну и ту же ошибку: {explainError(repeatedMistakeCode, repeatedMistakeCode)}
          </span>
          <button onClick={dismissRepeatedMistake} className="ml-2 shrink-0 text-sky-300/70 hover:text-sky-100">
            ×
          </button>
        </div>
      )}
    </div>
  );
}

// Adaptive Learning (Stage 4): после завершения попытки (существующий
// /api/simulations/{id}/complete, не тронут) дополнительно отправляет
// реальные накопленные за сессию счетчики (sessionTotals из
// TaskProgressProvider — сколько подсказок/ошибок/попыток было по факту)
// на /api/progress/lab-completed и показывает итог, который сгенерировал
// AI Teacher строго на основании этих чисел.
function CompleteLabSection({
  simulationId,
  actionsLog,
  mountedAtRef,
}: {
  simulationId: string;
  actionsLog: Record<string, unknown>[];
  mountedAtRef: React.MutableRefObject<number>;
}) {
  const { state } = useExperimentState();
  const { sessionTotals } = useTaskProgress();
  const [error, setError] = useState<string | null>(null);
  const [completionScore, setCompletionScore] = useState<number | null>(null);
  const [labSummary, setLabSummary] = useState<{ summary: string; recommendedNext: string; achievements: string[] } | null>(
    null
  );

  async function handleComplete() {
    setError(null);
    try {
      const result = await apiFetch<{ score: number | null }>(`/api/simulations/${simulationId}/complete`, {
        method: "POST",
        body: JSON.stringify({
          actions_log: actionsLog,
          duration_seconds: Math.round((Date.now() - mountedAtRef.current) / 1000),
        }),
      });
      setCompletionScore(result.score);

      const labResult = await submitLabCompleted({
        simulationId,
        tasksCompleted: sessionTotals.tasksCompleted,
        totalMistakes: sessionTotals.mistakes,
        totalHints: sessionTotals.hints,
        totalAttempts: sessionTotals.attempts,
      });
      setLabSummary({
        summary: labResult.summary,
        recommendedNext: labResult.recommended_next,
        achievements: labResult.new_achievements,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось завершить попытку");
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={handleComplete}
          disabled={state.connections.length === 0}
          data-testid="complete-button"
          className="rounded-full border border-glass-border px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/5 disabled:opacity-50"
        >
          Завершить попытку
        </button>
        {completionScore !== null && (
          <span className="font-mono text-sm font-medium text-slate-100">Оценка: {completionScore}/100</span>
        )}
      </div>

      {labSummary && (
        <div
          className="rounded-xl border border-neon-violet/40 bg-neon-violet/10 p-4 text-sm text-slate-200"
          data-testid="lab-summary"
        >
          <p className="whitespace-pre-wrap">{labSummary.summary}</p>
          {labSummary.recommendedNext && (
            <p className="mt-2 text-neon-violet">Следующий шаг: {labSummary.recommendedNext}</p>
          )}
          {labSummary.achievements.length > 0 && (
            <p className="mt-2 text-amber-300">
              Новые достижения:{" "}
              {labSummary.achievements.map((code) => ACHIEVEMENTS[code]?.title ?? code).join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ElectricityLabInner({ simulation }: ElectricityLabSceneProps) {
  const { state, addConnection, updateComponent, resetExperiment, actionsLog, logEvent } = useExperimentState();
  const { quality, setQuality } = useQuality();
  const clock = useSimulationClock();
  const mountedAtRef = useRef(Date.now());

  const battery = state.components.find((c) => c.id === "battery");
  const resistor = state.components.find((c) => c.id === "resistor");
  const solution = useMemo(() => solveCircuit(state.components, state.connections), [state.components, state.connections]);

  function handleConnect(fromId: string, toId: string) {
    addConnection({ id: `${fromId}-${toId}-${Date.now()}`, terminals: [fromId, toId] });
    playConnect();
  }

  function handleVoltageChange(value: number) {
    updateComponent("battery", { voltageV: value });
    logEvent({ type: "param_changed", componentId: "battery", field: "voltageV", value });
  }

  function handleResistanceChange(value: number) {
    updateComponent("resistor", { resistanceOhm: value });
    logEvent({ type: "param_changed", componentId: "resistor", field: "resistanceOhm", value });
  }

  function handleReset() {
    resetExperiment(INITIAL_COMPONENTS);
    clock.reset();
  }

  function handleClockToggle() {
    if (!clock.isRunning) playPowerOn();
    if (clock.isRunning) clock.pause();
    else clock.start();
  }

  const switchClosed = state.components.find((c) => c.id === "switch")?.isClosed ?? true;

  return (
    <TutorialProvider connections={state.connections} switchClosed={switchClosed} isCircuitActive={solution.isCircuitActive}>
    <TaskProgressProvider
      simulationId={simulation.id}
      components={state.components}
      connections={state.connections}
      solution={solution}
    >
    <ElectricityLabExperienceProvider
      simulationId={simulation.id}
      stepContext={{ components: state.components, connections: state.connections, solution }}
    >
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
    <div className="flex-1 rounded-2xl bg-gradient-to-b from-slate-900 via-slate-950 to-black p-3 sm:p-5">
      <div className="relative">
        <WireDragProvider onConnect={handleConnect}>
          <ElectricityCanvas quality={quality} solution={solution} timeScale={clock.timeScale} />
        </WireDragProvider>
      </div>

      <div className="glass-panel mt-4 grid grid-cols-1 gap-4 rounded-2xl p-4 sm:grid-cols-2">
        <div className="flex items-center gap-2 text-xs text-slate-500 sm:col-span-2" data-testid="terminal-legend">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: BRASS_COLOR }} />
          Золотые точки — это клеммы, к которым можно подключать провода. Наведи курсор на компонент, чтобы увидеть его
          название.
        </div>

        <TutorialPanel />
        <div>
          <label htmlFor="voltage-slider" className="mb-1 block font-mono text-xs uppercase tracking-widest text-slate-400">
            Напряжение источника: {(battery?.voltageV ?? 0).toFixed(1)} В
          </label>
          <input
            id="voltage-slider"
            type="range"
            min={1}
            max={24}
            step={0.5}
            value={battery?.voltageV ?? 12}
            onChange={(e) => handleVoltageChange(Number(e.target.value))}
            data-testid="voltage-slider"
            className="w-full accent-neon-violet"
          />
        </div>

        <div>
          <label htmlFor="resistance-slider" className="mb-1 block font-mono text-xs uppercase tracking-widest text-slate-400">
            Сопротивление резистора: {(resistor?.resistanceOhm ?? 0).toFixed(1)} Ом
          </label>
          <input
            id="resistance-slider"
            type="range"
            min={1}
            max={40}
            step={0.5}
            value={resistor?.resistanceOhm ?? 4}
            onChange={(e) => handleResistanceChange(Number(e.target.value))}
            data-testid="resistance-slider"
            className="w-full accent-neon-violet"
          />
        </div>

        <div className="flex items-end justify-between gap-2">
          <div className="flex gap-2">
            <button
              onClick={handleClockToggle}
              data-testid="clock-toggle"
              title="Управляет только анимацией искр и таймером сессии. Ток и напряжение считаются по закону Ома мгновенно и всегда, независимо от этой кнопки."
              className="neon-glow-indigo flex items-center gap-2 rounded-full bg-neon-violet px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
            >
              {clock.isRunning ? <Pause size={16} /> : <Play size={16} />}
              {clock.isRunning ? "Пауза анимации" : "Старт анимации"}
            </button>
            <ElectricityResetButton onReset={handleReset} />
          </div>

          <div role="radiogroup" aria-label="Качество рендера" className="flex items-center gap-1 font-mono text-xs text-slate-500">
            {QUALITY_OPTIONS.map((level) => (
              <button
                key={level}
                onClick={() => setQuality(level)}
                role="radio"
                aria-checked={quality === level}
                data-testid={`quality-${level}`}
                title={QUALITY_LABEL[level]}
                className={`rounded-full border px-2 py-1 uppercase transition ${
                  quality === level
                    ? "border-neon-violet text-neon-violet"
                    : "border-glass-border text-slate-500 hover:text-slate-300"
                }`}
              >
                {level[0]}
              </button>
            ))}
          </div>
        </div>

        <div
          data-testid="circuit-status"
          data-active={solution.isCircuitActive}
          data-short={solution.isShortCircuit}
          data-fuse-blown={state.components.find((c) => c.id === "fuse")?.isBlown ?? false}
          className="rim-light rounded-xl border border-glass-border bg-surface-container-lowest/60 p-3 text-sm text-slate-300 sm:col-span-2"
        >
          {!solution.isClosedLoop && (
            <p className="text-slate-400">
              Соедини терминалы проводами: потяни от одной точки подключения к другой, чтобы собрать полный контур.
              Клик по проводу — разрыв соединения.
            </p>
          )}
          {solution.isClosedLoop && solution.isShortCircuit && (
            <p className="font-medium text-red-400">
              ⚠ Короткое замыкание! Сопротивление контура почти нулевое — расчетный ток {solution.currentA.toFixed(1)} А.
            </p>
          )}
          {solution.isClosedLoop && !solution.isShortCircuit && !solution.isCircuitActive && (
            <p className="text-amber-300">Цепь замкнута, но ток не течет — проверь выключатель и предохранитель.</p>
          )}
          {solution.isClosedLoop && solution.isCircuitActive && (
            <p className="text-emerald-300">
              Ток течет: I = {solution.currentA.toFixed(2)} А (закон Ома: U/R = {(battery?.voltageV ?? 0).toFixed(1)}В /
              контур).
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-slate-500">Быстрая проверка</h3>
          <TaskPanel />
        </div>

        {/* Stage E-2 — Advanced Laboratory Experience: отдельная, более
            богатая учебная надстройка поверх существующей лаборатории.
            Не заменяет TaskPanel выше (тот продолжает работать как
            раньше) — это дополнительный слой: каталог из 8 лабораторных
            работ с полным циклом (введение/теория/оборудование/сборка/
            измерение/анализ/вывод), автоматический отчёт и Лабораторный
            журнал измерений. */}
        <div className="space-y-4 sm:col-span-2">
          <h3 className="font-headline text-lg font-semibold text-slate-100">Лабораторные работы</h3>
          <ElectricityLabExperienceSection />
          <ElectricityLabNotebookPanel />
        </div>

        <ProgressBanners />

        <CompleteLabSection simulationId={simulation.id} actionsLog={actionsLog} mountedAtRef={mountedAtRef} />
      </div>
    </div>

    <TeacherChatPanel
      simulationId={simulation.id}
      components={state.components}
      connections={state.connections}
      solution={solution}
    />
    </div>
    </ElectricityLabExperienceProvider>
    </TaskProgressProvider>
    </TutorialProvider>
  );
}
