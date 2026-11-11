"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, QuadraticBezierLine, MeshTransmissionMaterial, useGLTF } from "@react-three/drei";
import { Play, Pause, RotateCcw, AlertTriangle, Settings } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import CanvasShell from "@/components/scenes/CanvasShell";
import AITeacherChat from "@/components/ai/AITeacherChat";
import TaskPanel from "@/components/tasks/TaskPanel";
import { TaskProgressProvider, useTaskProgress } from "@/components/tasks/TaskProgressProvider";
import {
  ExperimentStateProvider,
  useExperimentState,
} from "@/components/core/ExperimentStateProvider";
import { WireDragProvider, WireDragSurface, useWireDrag } from "@/components/core/WireDragProvider";
import { ComponentDragProvider, ComponentDragSurface, useComponentDrag } from "@/components/core/ComponentDragProvider";
import ConnectionPoint from "@/components/core/ConnectionPoint";
import { TutorialProvider, useTutorial } from "@/components/tutorial/TutorialProvider";
import TutorialPanel from "@/components/tutorial/TutorialPanel";
import { ElectricityLabExperienceProvider, useElectricityLabExperience } from "@/components/core/ElectricityLabExperienceProvider";
import ElectricityExperimentCatalogBrowser from "@/components/lab/ElectricityExperimentCatalogBrowser";
import ElectricityGuidedLabPanel from "@/components/lab/ElectricityGuidedLabPanel";
import ElectricityLabReportPanel from "@/components/lab/ElectricityLabReportPanel";
import ElectricityLabNotebookPanel from "@/components/lab/ElectricityLabNotebookPanel";
import ElectricityResumeModal from "@/components/lab/ElectricityResumeModal";
import AITeacherDock from "@/components/simulation/AITeacherDock";
import AskTeacherWidget from "@/components/help/AskTeacherWidget";
import { buildElectricityHelpContext } from "@/lib/help/contextAdapters";
import AnalogMeter, { METER_TERMINALS } from "@/components/electricity/AnalogMeter";
import { LabBench, NameTag } from "@/components/electricity/LabBench";
import BrightnessHud from "@/components/electricity/BrightnessHud";
import TaskCompleteOverlay from "@/components/electricity/TaskCompleteOverlay";
import { useSimulationClock } from "@/lib/use-simulation-clock";
import { useQuality, type QualityLevel } from "@/lib/quality-context";
import { useFullscreen } from "@/lib/useFullscreen";
import { isTypingTarget } from "@/lib/dom-input-utils";
import { SandboxModeOverlay } from "@/components/chemistry/sandbox/SandboxModeOverlay";
import { type CameraMode } from "@/lib/chemistry-lab-modes";
import { checkPlayerReach, type RoomInteriorBounds } from "@/lib/sandbox-locomotion";
import { buildAIContext } from "@/lib/ai-context-builder";
import { solveCircuit, bulbBrightness, type CircuitComponent, type CircuitSolution, type Connection } from "@/lib/circuit-engine";
import {
  checkAmmeterPlacement,
  checkVoltmeterPlacement,
  ammeterPlacementMessage,
  voltmeterPlacementMessage,
} from "@/lib/measurement-validation";
import { checkElectricalSafety, type SafetyWarning } from "@/lib/electricity-safety";
import { apiFetch, ApiError } from "@/lib/api";
import { playConnect, playDisconnect, playFuseBlow, playPowerOn, playSwitchClick } from "@/lib/sound-effects";
import { ACHIEVEMENT_EMOJI } from "@/lib/achievements";
import { explainError } from "@/lib/error-explanations";
import { submitLabCompleted } from "@/lib/progress-client";
import type { Simulation } from "@/lib/types";
import { useLocale } from "@/lib/locale-context";
import { TaskStatus, bulbPowerRatio, type TaskDefinition } from "@/lib/task-engine";
import { planBreak, planShort } from "@/lib/electricity-faults";
import { computeWireFlows, type WireFlow } from "@/lib/electricity-current-flow";

// Guided Onboarding: наведение курсора в любую точку компонента (не только
// на клемму) показывает всплывающую подпись с названием — общий хук вместо
// повторения одной и той же пары обработчиков в каждом компоненте.
// Stage S9.8 — необязательный курсор на наведении для компонентов, у
// которых наведение реально приводит к действию: "pointer" для Switch
// (клик переключает), "grab" для всех остальных с post-S9.9 — их теперь
// можно взять и перетащить (см. useComponentPlacement ниже).
function useHoverTooltip(cursor?: "pointer" | "grab") {
  const [hovered, setHovered] = useState(false);
  return {
    hovered,
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHovered(true);
      if (cursor) document.body.style.cursor = cursor;
    },
    onPointerOut: () => {
      setHovered(false);
      if (cursor) document.body.style.cursor = "auto";
    },
  };
}

// локализованное имя компонента для табличек на столе и подсказки "E — взять"
function useComponentName(id: string): string {
  const { t } = useLocale();
  return (t.electricity.hud.componentNames as Record<string, string>)[id] ?? id;
}

// табличка лежит на столе прямо перед компонентом: смещение задаётся
// относительно группы компонента, поэтому вычитаем её высоту
function tagOffset(position: [number, number, number], forward = 0.5): [number, number, number] {
  return [0, 0.02 - position[1], forward];
}

const BULB_RATED_POWER_W = 18;
// лампа крупнее остальных деталей — это главный «индикатор» опыта
const BULB_SCALE = 1.4;

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
} as const;

useGLTF.preload(MODEL_PATHS.battery);
useGLTF.preload(MODEL_PATHS.bulb);
useGLTF.preload(MODEL_PATHS.switch);

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

// post-S9.9 sandbox acceptance fix — исходная раскладка стенда (та же,
// что раньше была захардкожена прямо в position={...} каждого компонента)
// теперь служит ТОЛЬКО дефолтом для компонентов, у которых ещё нет
// сохранённой позиции (component.position === undefined) — уже существующие
// сохранения/тесты, не знающие о position, продолжают работать один в один.
const DEFAULT_COMPONENT_POSITIONS: Record<string, [number, number, number]> = {
  // задний ряд — приборы и лампа, лицом к ученику
  voltmeter: [-2.3, 0.45, -1.0],
  bulb: [0, 0.84, -1.0],
  ammeter: [2.3, 0.45, -1.0],
  // передний ряд — источник, ключ, резистор, предохранитель
  battery: [-2.8, 0.14, 0.9],
  switch: [-0.95, 0.1, 0.9],
  resistor: [0.95, 0.15, 0.9],
  fuse: [2.8, 0.11, 0.9],
};

// Immersive interaction acceptance fix — комната для WASD-перемещения
// (Stage S-7 v2 CanvasShell cameraMode="sandbox", уже общая инфраструктура,
// см. sandbox-locomotion.ts). Статичный прямоугольник с запасом вокруг
// раскладки стенда по умолчанию — Electricity Lab не регистрирует стены
// динамически, как Chemistry World, ей это не нужно: стенд компактнее и
// не переставляется целиком, только отдельные приборы на нём.
const ELECTRICITY_ROOM_BOUNDS: RoomInteriorBounds = { minX: -6, maxX: 6, minZ: -4, maxZ: 4 };

// дистанция, с которой уже показывается подсказка "E — взять" — переиспользует
// ту же самую функцию проверки (checkPlayerReach), что и Chemistry World,
// не изобретает собственную математику расстояния
const INTERACT_REACH_M = 1.8;

// единая точка "откуда компонент знает свою текущую позицию на верстаке" —
// committed-значение из ExperimentStateProvider (реальное доменное
// состояние, течёт через тот же reducer и S9.7 autosave без изменений их
// схемы) либо live-превью во время активного перетаскивания ИМЕННО этого
// компонента. Возвращает и обработчик начала захвата.
function useComponentPlacement(componentId: string) {
  const { state } = useExperimentState();
  const { draggingComponentId, previewPosition, startDrag } = useComponentDrag();
  const defaultPosition = DEFAULT_COMPONENT_POSITIONS[componentId] ?? [0, 0.28, 0];
  const committedPosition = state.components.find((c) => c.id === componentId)?.position ?? defaultPosition;
  const isDragging = draggingComponentId === componentId;
  const position = isDragging && previewPosition ? previewPosition : committedPosition;
  const controls = useThree((st) => st.controls) as { enabled: boolean } | null;

  function onPointerDown(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation();
    // как и у клемм: камера не должна крутиться, пока тащим деталь
    if (controls) controls.enabled = false;
    startDrag(componentId, committedPosition);
  }

  return { position, isDragging, onPointerDown };
}

function Battery() {
  const { hovered, onPointerOver, onPointerOut } = useHoverTooltip("grab");
  const { position, isDragging, onPointerDown } = useComponentPlacement("battery");
  const suggestedTerminals = useSuggestedTerminals();
  const { state } = useExperimentState();
  const { t } = useLocale();
  const name = useComponentName("battery");
  const voltage = state.components.find((c) => c.id === "battery")?.voltageV ?? 12;
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
    <group
      position={position}
      scale={isDragging ? 1.06 : 1}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onPointerDown={onPointerDown}
    >
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
      {(hovered || isDragging) && <NameTag text={`${name} · ${voltage} ${t.electricity.hud.unitV}`} position={tagOffset(position)} />}
    </group>
  );
}

function Resistor() {
  const bandColors = ["#a16207", "#000000", "#dc2626"];
  const { hovered, onPointerOver, onPointerOut } = useHoverTooltip("grab");
  const { position, isDragging, onPointerDown } = useComponentPlacement("resistor");
  const suggestedTerminals = useSuggestedTerminals();
  const { state } = useExperimentState();
  const { t } = useLocale();
  const name = useComponentName("resistor");
  const resistance = state.components.find((c) => c.id === "resistor")?.resistanceOhm ?? 4;
  return (
    <group
      position={position}
      scale={isDragging ? 1.06 : 1}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onPointerDown={onPointerDown}
    >
      {(hovered || isDragging) && <NameTag text={`${name} · ${resistance} ${t.electricity.hud.unitOhm}`} position={tagOffset(position)} />}
      <group rotation={[0, 0, Math.PI / 2]}>
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
      </group>
    </group>
  );
}

// цвет света лампы: тёплый жёлтый в рабочем режиме, раскалённый
// оранжево-красный, когда мощность выше номинальной
const BULB_WARM_COLOR = new THREE.Color("#fde047");
const BULB_HOT_COLOR = new THREE.Color("#ff6a3d");

/**
 * `brightness` — яркость 0..1 (обрезана на номинале), `powerRatio` — мощность
 * в долях номинала без обрезки: выше 1 лампа раскаляется и мерцает.
 */
function Bulb({ brightness, powerRatio }: { brightness: number; powerRatio: number }) {
  const lightRef = useRef<THREE.PointLight>(null);
  const glowRef = useRef(0);
  const filamentMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const { hovered, onPointerOver, onPointerOut } = useHoverTooltip("grab");
  const { position, isDragging, onPointerDown } = useComponentPlacement("bulb");
  const suggestedTerminals = useSuggestedTerminals();
  const name = useComponentName("bulb");
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

  useFrame((frame, delta) => {
    // перегрев: 0 на номинале, 1 при мощности в 2.5 раза выше номинала
    const heat = THREE.MathUtils.clamp((powerRatio - 1) / 1.5, 0, 1);
    // плавный разогрев/остывание — скорость подобрана так, чтобы лампа
    // "оживала" ощутимо, но не мгновенно; без базовой засветки — при
    // нулевом токе нить полностью тёмная
    glowRef.current = THREE.MathUtils.lerp(glowRef.current, brightness * 3.5 * (1 + heat * 1.5), Math.min(1, delta * 2.5));
    // мерцание накладывается поверх сглаженного значения, иначе сглаживание его бы съело
    const time = frame.clock.elapsedTime;
    const flicker = 1 + (Math.sin(time * 37) + Math.sin(time * 91)) * 0.15 * heat;
    const intensity = glowRef.current * flicker;
    if (lightRef.current) {
      lightRef.current.intensity = intensity;
      lightRef.current.color.lerpColors(BULB_WARM_COLOR, BULB_HOT_COLOR, heat);
    }
    if (filamentMaterialRef.current) {
      filamentMaterialRef.current.emissiveIntensity = intensity;
      filamentMaterialRef.current.emissive.lerpColors(BULB_WARM_COLOR, BULB_HOT_COLOR, heat);
    }
  });

  return (
    <group
      position={position}
      scale={(isDragging ? 1.06 : 1) * BULB_SCALE}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onPointerDown={onPointerDown}
    >
      {/* реалистичная GLB-модель лампы накаливания (стекло/нить/цоколь уже
          смоделированы отдельными мешами) вместо процедурного шара+тора */}
      <primitive object={model} />
      <pointLight ref={lightRef} color="#fde047" intensity={0} distance={4} decay={2} />
      {/* подставка-патрон: на её концах стоят клеммы лампы */}
      <mesh position={[0, -0.54, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.0, 0.1, 0.32]} />
        <meshStandardMaterial color="#2b3440" roughness={0.55} metalness={0.15} />
      </mesh>
      <mesh position={[0, -0.44, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.14, 0.12, 24]} />
        <meshStandardMaterial color="#111827" roughness={0.5} />
      </mesh>
      <ConnectionPoint id="bulb_a" position={[-0.42, -0.47, 0]} suggested={suggestedTerminals?.includes("bulb_a") ?? false} />
      <ConnectionPoint id="bulb_b" position={[0.42, -0.47, 0]} suggested={suggestedTerminals?.includes("bulb_b") ?? false} />
      {(hovered || isDragging) && <NameTag text={name} position={tagOffset(position).map((v) => v / BULB_SCALE) as [number, number, number]} />}
    </group>
  );
}

function Switch({ isClosed, onToggle }: { isClosed: boolean; onToggle: () => void }) {
  const { hovered, onPointerOver, onPointerOut } = useHoverTooltip("pointer");
  const { position, isDragging, onPointerDown } = useComponentPlacement("switch");
  const { consumeJustDragged } = useComponentDrag();
  const suggestedTerminals = useSuggestedTerminals();
  const name = useComponentName("switch");
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
    <group
      position={position}
      scale={isDragging ? 1.06 : 1}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onPointerDown={onPointerDown}
    >
      <primitive
        object={base}
        onClick={() => {
          // после реального перетаскивания (не клика) отпускание кнопки
          // мыши приходится на тот же меш — без этой проверки тумблер
          // паразитно переключался бы сразу после каждого перемещения
          if (consumeJustDragged("switch")) return;
          onToggle();
        }}
      />
      <ConnectionPoint id="switch_a" position={[-0.4, 0.13, 0]} suggested={suggestedTerminals?.includes("switch_a") ?? false} />
      <ConnectionPoint id="switch_b" position={[0.4, 0.13, 0]} suggested={suggestedTerminals?.includes("switch_b") ?? false} />
      {(hovered || isDragging) && <NameTag text={name} position={tagOffset(position)} />}
    </group>
  );
}

function Meter({
  id,
  symbol,
  max,
  majorStep,
  value,
  unit,
  testId,
  placementStatus,
  warningMessage,
}: {
  id: "ammeter" | "voltmeter";
  symbol: string;
  max: number;
  majorStep: number;
  value: number;
  unit: string;
  testId: string;
  placementStatus: string;
  warningMessage: string | null;
}) {
  const { hovered, onPointerOver, onPointerOut } = useHoverTooltip("grab");
  const { position, isDragging, onPointerDown } = useComponentPlacement(id);
  const suggestedTerminals = useSuggestedTerminals();
  const { t } = useLocale();
  const name = useComponentName(id);
  const termA = `${id}_a`;
  const termB = `${id}_b`;
  return (
    <group
      position={position}
      scale={isDragging ? 1.06 : 1}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onPointerDown={onPointerDown}
    >
      <AnalogMeter
        symbol={symbol}
        max={max}
        majorStep={majorStep}
        value={value}
        unit={unit}
        testId={testId}
        placementStatus={placementStatus}
        warningMessage={warningMessage}
        wrongLabel={t.electricity.hud.wrongConnection}
      />
      <ConnectionPoint id={termA} position={METER_TERMINALS[0]} color="#ef4444" suggested={suggestedTerminals?.includes(termA) ?? false} />
      <ConnectionPoint id={termB} position={METER_TERMINALS[1]} color="#475569" suggested={suggestedTerminals?.includes(termB) ?? false} />
      {(hovered || isDragging) && <NameTag text={name} position={tagOffset(position, 0.62)} />}
    </group>
  );
}

function Ammeter({ currentA, placementStatus, warningMessage }: { currentA: number; placementStatus: string; warningMessage: string | null }) {
  const { t } = useLocale();
  return (
    <Meter
      id="ammeter"
      symbol="A"
      max={5}
      majorStep={1}
      value={currentA}
      unit={t.electricity.hud.unitA}
      testId="ammeter-reading"
      placementStatus={placementStatus}
      warningMessage={warningMessage}
    />
  );
}

function Voltmeter({ voltageV, placementStatus, warningMessage }: { voltageV: number; placementStatus: string; warningMessage: string | null }) {
  const { t } = useLocale();
  return (
    <Meter
      id="voltmeter"
      symbol="V"
      max={25}
      majorStep={5}
      value={voltageV}
      unit={t.electricity.hud.unitV}
      testId="voltmeter-reading"
      placementStatus={placementStatus}
      warningMessage={warningMessage}
    />
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
  const { hovered, onPointerOver, onPointerOut } = useHoverTooltip("grab");
  const { position, isDragging, onPointerDown } = useComponentPlacement("fuse");
  const suggestedTerminals = useSuggestedTerminals();
  const { state } = useExperimentState();
  const { t } = useLocale();
  const name = useComponentName("fuse");
  const rated = state.components.find((c) => c.id === "fuse")?.ratedCurrentA ?? 5;
  return (
    <group
      position={position}
      scale={isDragging ? 1.06 : 1}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onPointerDown={onPointerDown}
    >
      {(hovered || isDragging) && <NameTag text={`${name} · ${rated} ${t.electricity.hud.unitA}`} position={tagOffset(position)} />}
      <group rotation={[0, 0, Math.PI / 2]}>
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
      </group>
    </group>
  );
}

// цвета проводов по очереди подключения — как набор лабораторных проводов;
// красного нет, им подсвечивается провод под курсором ("кликни — удалишь")
const WIRE_COLORS = ["#2563eb", "#eab308", "#16a34a", "#f97316", "#7c3aed", "#0f172a", "#0891b2", "#db2777"];

// радиус вокруг концов провода, где клик не удаляет провод (зона клеммы)
const WIRE_END_GUARD = 0.22;

// дуга провода: выходит из клеммы вверх и ложится аркой над столом, чтобы
// не уходить под столешницу и не протыкать соседние детали
function wireArc(a: THREE.Vector3, b: THREE.Vector3): THREE.CubicBezierCurve3 {
  const lift = 0.3 + a.distanceTo(b) * 0.12;
  return new THREE.CubicBezierCurve3(
    a,
    a.clone().add(new THREE.Vector3(0, lift, 0)),
    b.clone().add(new THREE.Vector3(0, lift, 0)),
    b
  );
}

// провод как объемная "резиновая" трубка с легким провисом (а не плоская
// линия) + латунные наконечники, которые слегка "подпрыгивают" при
// подключении — ощущение физической фиксации. Геометрия строится через
// useMemo (пересчитывается только когда меняются концы, не каждый кадр)
// и явно освобождается при размонтировании/пересборке.
// "Бегущий ток": светящиеся бусины едут по проводу от "+" к "−", пока по
// нему реально течёт ток (см. electricity-current-flow.ts). Чем больше ток,
// тем быстрее; при коротком замыкании бусины красные.
const FLOW_BEAD_SPACING_M = 0.45;

function FlowBeads({
  curve,
  reversed,
  currentA,
  color,
}: {
  curve: THREE.Curve<THREE.Vector3>;
  reversed: boolean;
  currentA: number;
  color: string;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const phaseRef = useRef(0);
  const length = useMemo(() => curve.getLength(), [curve]);
  const count = THREE.MathUtils.clamp(Math.round(length / FLOW_BEAD_SPACING_M), 2, 8);
  // м/с вдоль провода: заметно даже при малом токе, но не сливается в полосу при большом
  const speed = THREE.MathUtils.clamp(0.3 + Math.abs(currentA) * 0.22, 0.3, 1.6);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    phaseRef.current = (phaseRef.current + (delta * speed) / Math.max(length, 0.01)) % 1;
    for (let i = 0; i < count; i++) {
      const u = (phaseRef.current + i / count) % 1;
      curve.getPointAt(reversed ? 1 - u : u, dummy.position);
      // у клемм бусина меньше — плавно "выходит" из клеммы и "входит" в следующую
      dummy.scale.setScalar(0.55 + 0.45 * Math.sin(Math.PI * u));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    // raycast отключён: бусины не должны перехватывать клик по самому проводу
    <instancedMesh key={count} ref={meshRef} args={[undefined, undefined, count]} raycast={() => null} frustumCulled={false}>
      <sphereGeometry args={[0.042, 10, 10]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </instancedMesh>
  );
}

function WireTube({
  a,
  b,
  color,
  flow,
  currentA,
  flowColor,
  onClick,
}: {
  a: THREE.Vector3;
  b: THREE.Vector3;
  color: string;
  // направление тока в этом проводе; undefined — ток по нему не течёт
  flow: WireFlow | undefined;
  currentA: number;
  flowColor: string;
  onClick: (e: { stopPropagation: () => void }) => void;
}) {
  const capRef = useRef<THREE.Group>(null);
  const mountedAtRef = useRef(performance.now());
  // Stage S9.8 — Sandbox UX: провод УЖЕ кликабелен (клик — разрыв
  // соединения, инструкция под сценой это описывает), но до сих пор не
  // было никакой подсказки, что именно ЭТОТ провод под курсором можно
  // удалить — ни курсора, ни подсветки. Тот же язык, что и у danger-цвета
  // предупреждений безопасности (красный = "уберёт/опасно").
  const [hovered, setHovered] = useState(false);

  const curve = useMemo(() => wireArc(a, b), [a, b]);
  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 40, 0.028, 10, false), [curve]);

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
      <mesh
        geometry={geometry}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          // у самых концов провод проходит через клемму: нажатие там — это
          // начало/конец протягивания нового провода, а не удаление этого
          // (иначе повторное соединение тех же клемм стирало старый провод)
          if (e.point.distanceTo(a) < WIRE_END_GUARD || e.point.distanceTo(b) < WIRE_END_GUARD) return;
          // клик удаляет именно ЭТОТ провод -> сразу после этого мешу
          // нечего будет наводить, и onPointerOut ниже никогда не
          // сработает (R3F не эмулирует pointerleave при размонтировании
          // объекта) — без явного сброса здесь курсор застрял бы на
          // "pointer" до следующего наведения на что-то другое интерактивное
          document.body.style.cursor = "auto";
          setHovered(false);
          onClick(e);
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "auto";
        }}
        castShadow
      >
        <meshStandardMaterial
          color={hovered ? "#ef4444" : color}
          emissive={hovered ? "#ef4444" : "#000000"}
          emissiveIntensity={hovered ? 0.6 : 0}
          roughness={0.45}
          metalness={0.05}
        />
      </mesh>
      {flow && <FlowBeads curve={curve} reversed={flow.reversed} currentA={currentA} color={flowColor} />}
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

function Wires({ solution }: { solution: CircuitSolution }) {
  const { state, removeConnection } = useExperimentState();
  const flows = useMemo(
    () => computeWireFlows(state.components, state.connections, solution),
    [state.components, state.connections, solution]
  );
  const { getTerminalPosition } = useWireDrag();
  // post-S9.9: пока идёт перетаскивание компонента, мировые позиции его
  // клемм меняются каждый кадр (см. ConnectionPoint.tsx), но простое
  // мутирование Map-а в WireDragProvider само по себе не триггерит
  // ре-рендер этого компонента — принудительно тикаем ТОЛЬКО во время
  // активного драга, чтобы a/b ниже подхватывали свежие позиции и провод
  // визуально следовал за компонентом в реальном времени
  const { draggingComponentId } = useComponentDrag();
  const [, forceTick] = useState(0);
  // провод может появиться раньше, чем его клеммы сообщили свои позиции
  // (цепь, собранная лабораторией при загрузке, пока модели ещё грузятся) —
  // перерисовываемся, пока позиции не появятся
  const waitingForTerminalsRef = useRef(false);
  useFrame(() => {
    if (draggingComponentId || waitingForTerminalsRef.current) forceTick((t) => (t + 1) % 1_000_000);
  });
  waitingForTerminalsRef.current = state.connections.some(
    (c) => !getTerminalPosition(c.terminals[0]) || !getTerminalPosition(c.terminals[1])
  );

  return (
    <>
      {state.connections.map((connection, index) => {
        const a = getTerminalPosition(connection.terminals[0]);
        const b = getTerminalPosition(connection.terminals[1]);
        if (!a || !b) return null;
        return (
          <WireTube
            key={connection.id}
            a={a}
            b={b}
            color={WIRE_COLORS[index % WIRE_COLORS.length]}
            flow={flows.get(connection.id)}
            currentA={solution.currentA}
            flowColor={solution.isShortCircuit ? "#f87171" : "#fef08a"}
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
  const { t } = useLocale();
  const releaseText = t.electricity.hud.releaseOnTerminal;
  if (!draggingFrom || !pendingPoint) return null;
  const from = getTerminalPosition(draggingFrom);
  if (!from) return null;
  // легкий провис у "тянущегося" провода (дешевая QuadraticBezierLine,
  // а не полноценная trubка — этот превью пересчитывается на каждое
  // движение мыши, тут важна дешевизна, а не детальный объем)
  const mid = from.clone().add(pendingPoint).multiplyScalar(0.5);
  mid.y += 0.3 + from.distanceTo(pendingPoint) * 0.1;
  return (
    <>
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
      {/* Stage S9.8 — Sandbox UX: отмена клавишей Esc уже работала (см.
          WireDragProvider), но никак не была видна студенту — единственный
          способ узнать про неё был прочитать код. Подсказка появляется
          только во время активного жеста и исчезает вместе с ним — не
          добавляет постоянного визуального шума в остальное время. */}
      <Html position={pendingPoint} center distanceFactor={8} style={{ pointerEvents: "none" }}>
        <div
          className="pointer-events-none whitespace-nowrap rounded-lg border border-amber-400/30 bg-slate-900/90 px-2 py-1 text-[11px] text-amber-200 shadow-lg"
          style={{ transform: "translateY(-20px)" }}
        >
          {releaseText}
        </div>
      </Html>
    </>
  );
}

// какие компоненты стенда доступны через E-взаимодействие — те же 7,
// что уже поддерживают перетаскивание мышью (см. useComponentPlacement)
const INTERACTABLE_COMPONENT_IDS = ["battery", "resistor", "bulb", "switch", "ammeter", "voltmeter", "fuse"] as const;

// Immersive interaction acceptance fix — FPS-режим ("E — взять") для тех
// же 7 компонентов, что уже двигаются мышью в orbit-режиме. Переиспользует
// ГОТОВУЮ, полностью общую checkPlayerReach (та же функция, что и Chemistry
// World) вместо изобретения собственной математики дистанции, и ГОТОВУЮ
// машину состояний ComponentDragProvider (startDrag/updatePreviewPosition/
// commitDrag) вместо параллельной системы "предмет в руках" — как и
// требовалось: "existing component-movement system handles repositioning".
// Раздельно от WASD-контроллера (SandboxLocomotionController) — эта модель
// отвечает только за подсказку/захват/переноску, не за движение камеры.
function ElectricityProximityInteraction({ cameraMode }: { cameraMode: CameraMode }) {
  const { camera } = useThree();
  const { state } = useExperimentState();
  const { draggingComponentId, dragSource, startDrag, updatePreviewPosition, commitDrag } = useComponentDrag();
  const [nearestId, setNearestId] = useState<string | null>(null);
  const nearestIdRef = useRef<string | null>(null);
  const carryDistance = 1.1;
  const { t } = useLocale();
  const names = t.electricity.hud.componentNames as Record<string, string>;

  function resolvePosition(id: string): [number, number, number] {
    return state.components.find((c) => c.id === id)?.position ?? DEFAULT_COMPONENT_POSITIONS[id] ?? [0, 0.28, 0];
  }

  useFrame(() => {
    if (cameraMode !== "sandbox") {
      if (nearestIdRef.current !== null) {
        nearestIdRef.current = null;
        setNearestId(null);
      }
      return;
    }

    // во время переноски по клавише E — обновлять live-превью позиции
    // каждый кадр перед камерой (та же проекция взгляда, что и Chemistry
    // World's held-rig), подсказка "взять" при этом не показывается
    if (draggingComponentId && dragSource === "keyboard") {
      const dir = camera.getWorldDirection(new THREE.Vector3());
      const carryPoint = new THREE.Vector3(
        camera.position.x + dir.x * carryDistance,
        0,
        camera.position.z + dir.z * carryDistance
      );
      updatePreviewPosition(carryPoint);
      if (nearestIdRef.current !== null) {
        nearestIdRef.current = null;
        setNearestId(null);
      }
      return;
    }

    // мышиный драг (компонента или провода) активен — подсказка "E — взять"
    // не должна мешать/конкурировать с уже идущим взаимодействием
    if (draggingComponentId) {
      if (nearestIdRef.current !== null) {
        nearestIdRef.current = null;
        setNearestId(null);
      }
      return;
    }

    const playerXZ: [number, number] = [camera.position.x, camera.position.z];
    let closestId: string | null = null;
    let closestDistance = Infinity;
    for (const id of INTERACTABLE_COMPONENT_IDS) {
      const pos = resolvePosition(id);
      const check = checkPlayerReach(playerXZ, [pos[0], pos[2]], cameraMode, INTERACT_REACH_M);
      if (check.allowed && check.distance < closestDistance) {
        closestDistance = check.distance;
        closestId = id;
      }
    }
    if (closestId !== nearestIdRef.current) {
      nearestIdRef.current = closestId;
      setNearestId(closestId);
    }
  });

  useEffect(() => {
    if (cameraMode !== "sandbox") return;

    function handleKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.code !== "KeyE" && e.key !== "e" && e.key !== "E") return;

      if (draggingComponentId && dragSource === "keyboard") {
        commitDrag();
        return;
      }
      if (draggingComponentId) return; // мышиный драг — E ничего не делает
      const id = nearestIdRef.current;
      if (!id) return;
      startDrag(id, resolvePosition(id), "keyboard");
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraMode, draggingComponentId, dragSource, startDrag, commitDrag]);

  if (cameraMode !== "sandbox") return null;

  const isCarrying = !!draggingComponentId && dragSource === "keyboard";
  const promptText = isCarrying
    ? "E — отпустить · Esc — отменить"
    : nearestId
      ? `E — взять: ${names[nearestId] ?? nearestId}`
      : null;

  if (!promptText) return null;

  return (
    <Html fullscreen style={{ pointerEvents: "none" }}>
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-slate-900/85 px-3 py-1.5 text-xs text-slate-100">
        {promptText}
      </div>
    </Html>
  );
}

// Какие детали нужны в каждом задании. Остальных на столе нет, чтобы ученик
// видел только то, с чем работает. В лабораторных работах (каталог) схема
// подсказок идёт через все 7 деталей, поэтому там стол показывается целиком.
const TASK_BENCH_COMPONENTS: Record<string, string[]> = {
  "task-1-close-loop": ["battery", "switch", "bulb", "resistor"],
  "task-2-lamp-brightness": ["battery", "switch", "bulb", "resistor"],
  "task-5-find-break": ["battery", "switch", "bulb", "resistor"],
  // скрытые задания (ARCHIVED_TASKS в task-engine.ts)
  "task-2-ammeter-series": ["battery", "switch", "bulb", "resistor", "ammeter"],
  "task-3-voltmeter-parallel": ["battery", "switch", "bulb", "resistor", "voltmeter"],
  "task-4-target-current": ["battery", "switch", "bulb", "resistor", "ammeter"],
  "task-6-fix-short": ["battery", "switch", "bulb", "resistor"],
};

// Нижняя панель лаборатории: "Тренировка" (3 задания) или "Лабораторные
// работы" (каталог из 8 работ). Одновременно видна только одна.
//
// Вкладка "Лабораторные работы" пока скрыта: ученик видит только три
// задания. Весь её код остаётся рабочим — чтобы вернуть вкладку, достаточно
// поставить здесь true.
const LABS_TAB_ENABLED: boolean = false;

export type LabMode = "training" | "labs";
const LabModeContext = createContext<LabMode>("training");
const LAB_MODE_KEY = "edumind:electricity-lab-mode";

interface BenchFocus {
  isHidden: (id: string) => boolean;
}

function useBenchFocus(): BenchFocus {
  const { state } = useExperimentState();
  const { selectedExperiment } = useElectricityLabExperience();
  const { task } = useTaskProgress();
  const mode = useContext(LabModeContext);
  return useMemo(() => {
    if (mode === "labs" || selectedExperiment) return { isHidden: () => false };
    const needed = new Set(TASK_BENCH_COMPONENTS[task.id] ?? []);
    // деталь, к которой уже подключён провод, всегда остаётся на столе
    const wired = new Set<string>();
    for (const c of state.components) {
      if (state.connections.some((conn) => conn.terminals.some((term) => c.terminals.includes(term)))) wired.add(c.id);
    }
    const active = (id: string) => needed.size === 0 || needed.has(id) || wired.has(id);
    return { isHidden: (id: string) => !active(id) };
  }, [mode, selectedExperiment, task.id, state.components, state.connections]);
}

/** Warnings the student should actually see: no "fuse bypassed" when the fuse is not on the bench. */
function useVisibleSafetyWarnings(warnings: SafetyWarning[]): SafetyWarning[] {
  const focus = useBenchFocus();
  return useMemo(
    () => (focus.isHidden("fuse") ? warnings.filter((w) => w.code !== "unsafe_connection") : warnings),
    [focus, warnings]
  );
}

// деталь показывается на столе, только если она нужна в текущем задании
function BenchSlot({ id, children }: { id: string; children: React.ReactNode }) {
  const focus = useBenchFocus();
  return focus.isHidden(id) ? null : <>{children}</>;
}

function CircuitScene({
  solution,
  timeScale,
  safetyWarnings: allSafetyWarnings,
  cameraMode,
}: {
  solution: CircuitSolution;
  timeScale: number;
  safetyWarnings: SafetyWarning[];
  cameraMode: CameraMode;
}) {
  const { state, updateComponent, logEvent } = useExperimentState();
  const safetyWarnings = useVisibleSafetyWarnings(allSafetyWarnings);
  const shortLoggedRef = useRef(false);
  const overloadLoggedRef = useRef(false);
  const unsafeMeasurementLoggedRef = useRef(false);
  const unsafeConnectionLoggedRef = useRef(false);

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

  // Stage S9.4 — Safety Event Engine: тот же паттерн "залогировать один раз,
  // пока предупреждение не исчезло", что уже использован выше для
  // short_circuit — ничего не меняет в самом event-логе, просто добавляет
  // 3 новых кода, производных от electricity-safety.ts.
  useEffect(() => {
    const hasOverload = safetyWarnings.some((w) => w.code === "overload");
    if (hasOverload && !overloadLoggedRef.current) {
      overloadLoggedRef.current = true;
      logEvent({ type: "overload", code: "overload" });
    }
    if (!hasOverload) overloadLoggedRef.current = false;
  }, [safetyWarnings, logEvent]);

  useEffect(() => {
    const hasUnsafeMeasurement = safetyWarnings.some((w) => w.code === "unsafe_measurement");
    if (hasUnsafeMeasurement && !unsafeMeasurementLoggedRef.current) {
      unsafeMeasurementLoggedRef.current = true;
      logEvent({ type: "unsafe_measurement", code: "unsafe_measurement" });
    }
    if (!hasUnsafeMeasurement) unsafeMeasurementLoggedRef.current = false;
  }, [safetyWarnings, logEvent]);

  useEffect(() => {
    const hasUnsafeConnection = safetyWarnings.some((w) => w.code === "unsafe_connection");
    if (hasUnsafeConnection && !unsafeConnectionLoggedRef.current) {
      unsafeConnectionLoggedRef.current = true;
      logEvent({ type: "unsafe_connection", code: "unsafe_connection" });
    }
    if (!hasUnsafeConnection) unsafeConnectionLoggedRef.current = false;
  }, [safetyWarnings, logEvent]);

  const bulb = state.components.find((c) => c.id === "bulb");
  const switchComponent = state.components.find((c) => c.id === "switch");
  const fuse = state.components.find((c) => c.id === "fuse");

  const brightness = bulbBrightness(solution.readings.bulb, bulb?.ratedPowerW ?? BULB_RATED_POWER_W);
  const ammeterReading = solution.readings.ammeter?.currentA ?? 0;
  const voltmeterReading = solution.readings.voltmeter?.voltageV ?? 0;

  // Stage S9.3: реальная диагностика размещения приборов по той же
  // топологии (state.connections), что использует и task-engine.ts —
  // не пересчитывает физику, только читает уже посчитанный solution.
  const ammeterCheck = useMemo(
    () => checkAmmeterPlacement(state.components, state.connections, solution),
    [state.components, state.connections, solution]
  );
  const voltmeterCheck = useMemo(
    () => checkVoltmeterPlacement(state.components, state.connections, solution),
    [state.components, state.connections, solution]
  );
  const ammeterWarning = ammeterPlacementMessage(ammeterCheck);
  const voltmeterWarning = voltmeterPlacementMessage(voltmeterCheck);

  return (
    <group>
      {/* дополнительный мягкий фронтальный свет для этой сцены — не
          трогает общие настройки CanvasShell (SimLab/GeoWorld не меняются) */}
      <directionalLight position={[1, 4, 6]} intensity={0.35} color="#e0f2fe" />
      <pointLight position={[-2, 2.5, 3]} intensity={0.25} color="#fef3c7" distance={8} decay={2} />

      <LabBench />
      <BenchSlot id="battery">
        <Battery />
      </BenchSlot>
      <BenchSlot id="resistor">
        <Resistor />
      </BenchSlot>
      <BenchSlot id="bulb">
        <Bulb brightness={brightness} powerRatio={bulbPowerRatio({ components: state.components, connections: state.connections, solution })} />
      </BenchSlot>
      <BenchSlot id="switch">
      <Switch
        isClosed={switchComponent?.isClosed ?? true}
        onToggle={() => {
          const next = !(switchComponent?.isClosed ?? true);
          updateComponent("switch", { isClosed: next });
          logEvent({ type: "param_changed", componentId: "switch", field: "isClosed", value: next });
          playSwitchClick();
        }}
      />
      </BenchSlot>
      <BenchSlot id="ammeter">
        <Ammeter currentA={ammeterReading} placementStatus={ammeterCheck.status} warningMessage={ammeterWarning} />
      </BenchSlot>
      <BenchSlot id="voltmeter">
        <Voltmeter voltageV={voltmeterReading} placementStatus={voltmeterCheck.status} warningMessage={voltmeterWarning} />
      </BenchSlot>
      <BenchSlot id="fuse">
        <Fuse isBlown={fuse?.isBlown ?? false} justBlown={Boolean(solution.fuseToBlowId)} timeScale={timeScale} />
      </BenchSlot>
      <Wires solution={solution} />
      <PendingWirePreview />
      <WireDragSurface y={0.01} size={12} />
      <ComponentDragSurface y={0.011} size={12} />
      <ElectricityProximityInteraction cameraMode={cameraMode} />
      {/* неверное подключение прибора — компактная плашка в правом верхнем углу сцены (под кнопками),
          а не окно поверх приборов; сам прибор при этом подсвечен красным */}
      {(ammeterWarning || voltmeterWarning) && (
        <Html fullscreen style={{ pointerEvents: "none" }}>
          <div className="pointer-events-none absolute right-4 top-20 flex max-w-xs flex-col gap-2">
            {ammeterWarning && (
              <div data-testid="ammeter-reading-warning" className="rounded-lg border border-red-400/40 bg-red-950/85 px-3 py-2 text-xs leading-snug text-red-100 shadow-lg">
                ⚠ {ammeterWarning}
              </div>
            )}
            {voltmeterWarning && (
              <div data-testid="voltmeter-reading-warning" className="rounded-lg border border-red-400/40 bg-red-950/85 px-3 py-2 text-xs leading-snug text-red-100 shadow-lg">
                ⚠ {voltmeterWarning}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

// мост между WireDragProvider/ComponentDragProvider (обычные React-
// контексты, живут и снаружи Canvas) и CanvasShell: пока пользователь
// тянет провод ИЛИ перетаскивает компонент, OrbitControls должен быть
// выключен — иначе тот же pointer-жест дополнительно крутит камеру, и
// координаты терминалов/компонента "уезжают" прямо во время клика
function ElectricityCanvas({
  quality,
  solution,
  timeScale,
  safetyWarnings,
  cameraMode,
  isFullscreen,
}: {
  quality: QualityLevel;
  solution: CircuitSolution;
  timeScale: number;
  safetyWarnings: SafetyWarning[];
  cameraMode: CameraMode;
  isFullscreen: boolean;
}) {
  const { draggingFrom } = useWireDrag();
  const { draggingComponentId, dragSource } = useComponentDrag();
  // локомоция приостанавливается только пока МЫШЬЮ тянут провод/компонент —
  // клавиатурная переноска (E) намеренно продолжает разрешать WASD-ходьбу
  // с предметом в руках (см. dragSource в ComponentDragProvider)
  const mouseDragActive = !!draggingFrom || (!!draggingComponentId && dragSource === "mouse");
  return (
    <CanvasShell
      cameraPosition={[0, 4.5, 5.3]}
      target={[0, 0.2, -0.1]}
      floorY={-0.12}
      showFloor={false}
      bloomIntensity={0.4}
      quality={quality}
      orbitEnabled={!draggingFrom && !draggingComponentId}
      minPolarAngle={0.35}
      maxPolarAngle={1.15}
      minDistance={4.5}
      maxDistance={11}
      minAzimuthAngle={-0.75}
      maxAzimuthAngle={0.75}
      cameraMode={cameraMode}
      roomBounds={ELECTRICITY_ROOM_BOUNDS}
      colliders={[]}
      isFullscreen={isFullscreen}
      locomotionPaused={mouseDragActive}
    >
      <CircuitScene solution={solution} timeScale={timeScale} safetyWarnings={safetyWarnings} cameraMode={cameraMode} />
    </CanvasShell>
  );
}

// Обучение и задание 1 учат одному и тому же, но обучение ждёт провода в
// строго определённые клеммы. Если ученик собрал цепь по-своему и задание 1
// уже засчитано, обучение больше не нужно — закрываем его, чтобы оно не
// висело "Шаг 4 / 5" во время следующих заданий.
function TutorialAutoClose() {
  const { active, skipTutorial } = useTutorial();
  const { taskIndex, status } = useTaskProgress();
  const done = taskIndex > 0 || status === TaskStatus.COMPLETED;
  useEffect(() => {
    if (active && done) skipTutorial();
  }, [active, done, skipTutorial]);
  return null;
}

// Цепь, которую лаборатория собирает сама для задания "Найди поломку", если
// стол пуст (страницу обновили или нажали "Сбросить"): один случайный провод
// из четырёх не ставится — его и нужно найти.
const FIND_BREAK_WIRING: [string, string][] = [
  ["battery_pos", "switch_a"],
  ["switch_b", "resistor_a"],
  ["resistor_b", "bulb_a"],
  ["bulb_b", "battery_neg"],
];

// полная цепь для задания "Управляй яркостью", когда его открывают из списка
// заданий на чистом столе: собирать её заново там не нужно, задание про ползунки
function prebuiltWire([from, to]: [string, string]): Connection {
  return { id: `prebuilt-${from}-${to}-${Date.now()}`, terminals: [from, to] };
}

function FindBreakSetup() {
  const { task } = useTaskProgress();
  const { state, addConnection } = useExperimentState();
  const isBenchEmpty = state.connections.length === 0;
  // не собирать дважды для одного и того же пустого стола (в dev React
  // запускает эффекты по два раза)
  const builtRef = useRef(false);

  useEffect(() => {
    if (task.id !== "task-5-find-break" || !isBenchEmpty) {
      builtRef.current = false;
      return;
    }
    if (builtRef.current) return;
    builtRef.current = true;
    const missing = Math.floor(Math.random() * FIND_BREAK_WIRING.length);
    FIND_BREAK_WIRING.forEach(([from, to], index) => {
      if (index !== missing) addConnection(prebuiltWire([from, to]));
    });
  }, [task.id, isBenchEmpty, addConnection]);

  return null;
}

// показывает содержимое только в указанном задании тренировки
function OnlyForTask({ taskId, children }: { taskId: string; children: React.ReactNode }) {
  const { task } = useTaskProgress();
  return task.id === taskId ? <>{children}</> : null;
}

function LabModeTabs({ mode, onChange }: { mode: LabMode; onChange: (mode: LabMode) => void }) {
  const { t } = useLocale();
  const tabs: Array<{ id: LabMode; label: string }> = [
    { id: "training", label: t.electricity.hud.tabTraining },
    { id: "labs", label: t.electricity.hud.tabLabs },
  ];
  return (
    <div role="tablist" aria-label={t.electricity.hud.tabsAria} className="inline-flex self-start rounded-ds-control bg-text-primary/5 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={mode === tab.id}
          data-testid={`lab-mode-${tab.id}`}
          onClick={() => onChange(tab.id)}
          className={`ds-focus-ring rounded-ds-control px-4 py-2 text-ds-body font-medium transition-colors ${
            mode === tab.id ? "bg-surface text-text-primary shadow-ds-sm" : "text-text-secondary hover:text-text-primary"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function VisibleWarnings({
  warnings,
  children,
}: {
  warnings: SafetyWarning[];
  children: (visible: SafetyWarning[]) => React.ReactNode;
}) {
  return <>{children(useVisibleSafetyWarnings(warnings))}</>;
}

const QUALITY_OPTIONS: QualityLevel[] = ["low", "medium", "high"];

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
  selectedComponentId,
  components,
  connections,
  solution,
}: {
  simulationId: string;
  selectedComponentId: string | null;
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
  // T10 — the human "Ask Teacher" snapshot is a cheap re-shape of the SAME
  // LabAIContext already built above for the AI Teacher chat (brief §43:
  // never re-derived from raw state, never sent anywhere until the
  // student actually presses Send inside the widget).
  const helpSnapshot = buildElectricityHelpContext(context, { simulationId, selectedComponentId });
  return (
    <>
      <div className="pointer-events-none fixed bottom-4 left-4 z-40">
        <div className="pointer-events-auto">
          <AskTeacherWidget world="electricity" snapshot={helpSnapshot} />
        </div>
      </div>
      <AITeacherDock>
        <AITeacherChat
          simulationId={simulationId}
          context={context}
          learningProfile={learningProfile}
          onMessageSent={() => {
            recordHintUsed();
            recordLabHintUsed();
          }}
        />
      </AITeacherDock>
    </>
  );
}

// Stage E-2 — то же самое, что Emergency Stop Reset в Chemistry World
// Stage 5.7: сброс цепи (кнопка "Сбросить") должен сбрасывать И учебную
// сессию, иначе студент останется на устаревшем шаге против уже
// сброшенной, пустой цепи.
function ElectricityResetButton({ onReset }: { onReset: () => void }) {
  const { resetLabSession } = useElectricityLabExperience();
  // post-S9.9: полный сброс отменяет и любое активное перетаскивание
  // компонента — иначе после сброса завершение уже идущего драга
  // перезаписало бы только что восстановленную дефолтную позицию
  // устаревшим значением из превью
  const { cancelDrag } = useComponentDrag();
  const { t } = useLocale();
  return (
    <button
      onClick={() => {
        cancelDrag();
        onReset();
        resetLabSession();
      }}
      data-testid="reset-button"
      className="ds-focus-ring flex items-center gap-2 rounded-full border border-border/[0.12] px-4 py-2 text-ds-body font-medium text-text-primary transition-colors hover:bg-text-primary/5"
    >
      <RotateCcw size={16} />
      {t.electricity.hud.reset}
    </button>
  );
}

// переключает каталог/пошаговую панель в зависимости от того, выбрана ли
// сейчас лабораторная работа — и всегда показывает отчёт поверх, если
// только что была завершена работа (тот же паттерн, что
// GuidedLabExperienceSection в Chemistry World)
function ElectricityLabExperienceSection() {
  const { selectedExperiment, lastNotebookEntry, pendingResume, catalog, resumeSave, discardPendingResume } =
    useElectricityLabExperience();
  // D10 — local-only dismiss, unifying with Chemistry's resume modal (which
  // already has a non-destructive Cancel): lets the student look at the
  // catalog first instead of forcing an immediate Continue/Start Over
  // decision, without discarding the save or inventing new backend state.
  // Keyed to the save's own id so a genuinely different pending resume
  // (e.g. after starting a new experiment elsewhere) still prompts again.
  const [dismissedSaveId, setDismissedSaveId] = useState<string | null>(null);

  // Stage S9.7 — Autosave & Resume: незавершённая сессия найдена и ни одна
  // работа ещё не выбрана в этой загрузке страницы — предлагаем
  // Продолжить/Начать заново вместо каталога, пока студент не решит.
  if (pendingResume && !selectedExperiment && pendingResume.saveId !== dismissedSaveId) {
    const experiment = catalog.find((e) => e.id === pendingResume.experiment.experimentId);
    return (
      <ElectricityResumeModal
        experimentTitle={experiment?.title ?? pendingResume.experiment.experimentId}
        snapshot={pendingResume}
        onContinue={() => resumeSave(pendingResume)}
        onStartOver={discardPendingResume}
        onCancel={() => setDismissedSaveId(pendingResume.saveId)}
      />
    );
  }

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
  const { t } = useLocale();
  const { newAchievements, clearNewAchievements, repeatedMistakeCode, dismissRepeatedMistake } = useTaskProgress();

  if (newAchievements.length === 0 && !repeatedMistakeCode) return null;

  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      {newAchievements.length > 0 && (
        <div className="flex items-center justify-between rounded-ds-control border border-warning/40 bg-warning/10 p-3 text-ds-body text-warning">
          <span>
            {newAchievements
              .map((code) => `${ACHIEVEMENT_EMOJI[code] ?? "🏆"} ${t.achievements[code as keyof typeof t.achievements]?.title ?? code}`)
              .join(", ")}{" "}
            {t.electricity.hud.newAchievementSuffix}
          </span>
          <button onClick={clearNewAchievements} className="ds-focus-ring rounded-ds-control text-warning/70 transition-colors hover:text-warning">
            ×
          </button>
        </div>
      )}
      {repeatedMistakeCode && (
        <div className="flex items-center justify-between rounded-ds-control border border-accent-geo/40 bg-accent-geo/10 p-3 text-ds-body text-accent-geo">
          <span>{t.electricity.hud.repeatedMistakeMessage.replace("{mistake}", explainError(repeatedMistakeCode, repeatedMistakeCode))}</span>
          <button onClick={dismissRepeatedMistake} className="ds-focus-ring ml-2 shrink-0 rounded-ds-control text-accent-geo/70 transition-colors hover:text-accent-geo">
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
  const { t } = useLocale();
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
      setError(err instanceof ApiError ? err.message : t.electricity.hud.completeAttemptError);
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      {error && <p className="text-ds-body text-danger">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={handleComplete}
          disabled={state.connections.length === 0}
          data-testid="complete-button"
          className="ds-focus-ring rounded-full border border-border/[0.12] px-4 py-2 text-ds-body font-medium text-text-primary transition-colors hover:bg-text-primary/5 disabled:opacity-50"
        >
          {t.electricity.hud.completeAttempt}
        </button>
        {completionScore !== null && (
          <span className="font-mono text-ds-body font-medium text-text-primary">{t.electricity.hud.scoreLabel.replace("{score}", String(completionScore))}</span>
        )}
      </div>

      {labSummary && (
        <div
          className="rounded-ds-control border border-accent/40 bg-accent/10 p-4 text-ds-body text-text-primary"
          data-testid="lab-summary"
        >
          <p className="whitespace-pre-wrap">{labSummary.summary}</p>
          {labSummary.recommendedNext && (
            <p className="mt-2 text-accent">{t.electricity.hud.nextStepLabel} {labSummary.recommendedNext}</p>
          )}
          {labSummary.achievements.length > 0 && (
            <p className="mt-2 text-warning">
              {t.electricity.hud.newAchievementsLabel}{" "}
              {labSummary.achievements.map((code) => t.achievements[code as keyof typeof t.achievements]?.title ?? code).join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// SandboxModeOverlay переиспользован из Chemistry World без изменений (см.
// его полностью общий пропс-контракт); отдельный компонент-обёртка нужен
// только затем, чтобы позвать useComponentDrag() — сам SandboxModeOverlay
// рендерится ВНУТРИ ComponentDragProvider по дереву JSX, а не в теле
// ElectricityLabInner (которое рендерит сам Provider как родитель).
function ElectricitySandboxOverlay({
  cameraMode,
  setCameraMode,
  isFullscreen,
  toggleFullscreen,
}: {
  cameraMode: CameraMode;
  setCameraMode: (updater: (mode: CameraMode) => CameraMode) => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
}) {
  const { draggingComponentId } = useComponentDrag();
  const { t } = useLocale();
  return (
    <SandboxModeOverlay
      cameraMode={cameraMode}
      onToggleMode={() => setCameraMode((m) => (m === "orbit" ? "sandbox" : "orbit"))}
      disabled={!!draggingComponentId}
      disabledReason={t.electricity.hud.sandboxDisabledDragging}
      isFullscreen={isFullscreen}
      onToggleFullscreen={toggleFullscreen}
    />
  );
}

function ElectricityLabInner({ simulation }: ElectricityLabSceneProps) {
  const { state, addConnection, removeConnection, updateComponent, resetExperiment, actionsLog, logEvent } = useExperimentState();
  const { quality, setQuality } = useQuality();
  const { t } = useLocale();
  const clock = useSimulationClock();
  const mountedAtRef = useRef(Date.now());
  // Immersive interaction acceptance fix — тот же паттерн fullscreen, что и
  // у Chemistry World (переиспользован через useFullscreen, не переизобретён),
  // и тот же переключаемый режим камеры CanvasShell уже поддерживал
  // (cameraMode "orbit"|"sandbox") — просто не был подключён для Electricity.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggleFullscreen } = useFullscreen(wrapperRef);
  const [cameraMode, setCameraMode] = useState<CameraMode>("orbit");

  const battery = state.components.find((c) => c.id === "battery");
  const resistor = state.components.find((c) => c.id === "resistor");
  const solution = useMemo(() => solveCircuit(state.components, state.connections), [state.components, state.connections]);
  // Stage S9.4 — Safety System: считается один раз здесь (тот же паттерн,
  // что и solution выше) и прокидывается и в 3D-сцену (event-логирование),
  // и в 2D-баннер ниже — ничего не пересчитывается дважды.
  const safetyWarnings = useMemo(
    () => checkElectricalSafety({ components: state.components, connections: state.connections, solution }),
    [state.components, state.connections, solution]
  );

  const [labMode, setLabModeState] = useState<LabMode>(() => {
    if (!LABS_TAB_ENABLED || typeof window === "undefined") return "training";
    return window.localStorage.getItem(LAB_MODE_KEY) === "labs" ? "labs" : "training";
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  function setLabMode(mode: LabMode) {
    setLabModeState(mode);
    try {
      window.localStorage.setItem(LAB_MODE_KEY, mode);
    } catch {
      // без localStorage вкладка просто не запомнится
    }
  }

  // задания 5 и 6: лаборатория сама создаёт неисправность в собранной цепи,
  // чтобы ученику было что искать (иначе задание засчитывалось сразу)
  function plantFaultFor(task: TaskDefinition) {
    if (!solution.isCircuitActive || solution.isShortCircuit) return;
    if (task.id === "task-5-find-break") {
      const fault = planBreak(state.connections);
      if (fault?.kind === "remove") removeConnection(fault.connectionId);
    } else if (task.id === "task-6-fix-short") {
      const fault = planShort(state.connections);
      if (fault.kind === "add") addConnection(fault.connection);
    }
  }

  function handleConnect(fromId: string, toId: string) {
    addConnection({ id: `${fromId}-${toId}-${Date.now()}`, terminals: [fromId, toId] });
    playConnect();
  }

  // post-S9.9 sandbox acceptance fix — единственное место, где позиция
  // компонента реально попадает в домен (ExperimentStateProvider), ровно
  // тот же путь, что и любое другое реальное действие (updateComponent),
  // поэтому автоматически течёт и через существующий S9.7 autosave.
  function handleComponentMove(componentId: string, position: [number, number, number]) {
    updateComponent(componentId, { position });
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

  // ученик открыл задание из списка (или "пройти заново"): чистый стол с
  // исходными напряжением и сопротивлением. Для "Найди поломку" цепь с
  // разрывом соберёт FindBreakSetup, как только стол опустеет.
  function prepareBenchFor(task: TaskDefinition) {
    handleReset();
    if (task.id === "task-2-lamp-brightness") FIND_BREAK_WIRING.forEach((pair) => addConnection(prebuiltWire(pair)));
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
      onAdvance={plantFaultFor}
      onSelectTask={prepareBenchFor}
    >
    <ElectricityLabExperienceProvider
      simulationId={simulation.id}
      stepContext={{ components: state.components, connections: state.connections, solution }}
    >
    <LabModeContext.Provider value={labMode}>
    <ComponentDragProvider onMove={handleComponentMove}>
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
    <div className="min-w-0 flex-1 rounded-ds-panel border border-border/[0.08] bg-surface p-3 sm:p-5">
      <div
        ref={wrapperRef}
        className={
          isFullscreen
            ? "fixed inset-0 z-50 bg-slate-950 flex flex-col justify-center select-none"
            : "relative"
        }
      >
        <ElectricitySandboxOverlay
          cameraMode={cameraMode}
          setCameraMode={setCameraMode}
          isFullscreen={isFullscreen}
          toggleFullscreen={toggleFullscreen}
        />
        <WireDragProvider onConnect={handleConnect}>
          <ElectricityCanvas
            quality={quality}
            solution={solution}
            timeScale={clock.timeScale}
            safetyWarnings={safetyWarnings}
            cameraMode={cameraMode}
            isFullscreen={isFullscreen}
          />
        </WireDragProvider>
        {labMode === "training" && (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-16 z-20 flex justify-center">
              <TaskCompleteOverlay />
            </div>
            <OnlyForTask taskId="task-2-lamp-brightness">
              <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center">
                <BrightnessHud
                  ratio={bulbPowerRatio({ components: state.components, connections: state.connections, solution })}
                  voltageV={battery?.voltageV ?? 12}
                  resistanceOhm={resistor?.resistanceOhm ?? 4}
                  resistorInLoop={(resistor?.terminals ?? []).every((terminal) =>
                    state.connections.some((c) => c.terminals.includes(terminal))
                  )}
                  onVoltageChange={handleVoltageChange}
                  onResistanceChange={handleResistanceChange}
                />
              </div>
            </OnlyForTask>
          </>
        )}
      </div>

      <div className="ds-glass mt-4 flex flex-col gap-4 rounded-ds-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {LABS_TAB_ENABLED ? (
            <LabModeTabs mode={labMode} onChange={setLabMode} />
          ) : (
            <h2 className="text-ds-body font-semibold text-text-primary">{t.electricity.hud.tasksHeading}</h2>
          )}
          <div className="flex items-center gap-2">
            <ElectricityResetButton onReset={handleReset} />
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              aria-expanded={settingsOpen}
              aria-label={t.electricity.hud.settings}
              title={t.electricity.hud.settings}
              data-testid="lab-settings-toggle"
              className="ds-focus-ring flex h-9 w-9 items-center justify-center rounded-full border border-border/[0.12] text-text-secondary transition-colors hover:text-text-primary"
            >
              <Settings size={16} />
            </button>
          </div>
        </div>

        {settingsOpen && (
          <div className="flex flex-wrap items-center gap-4 rounded-ds-control border border-border/[0.1] p-3 text-ds-caption text-text-secondary">
            <button
              onClick={handleClockToggle}
              data-testid="clock-toggle"
              title={t.electricity.hud.clockHint}
              className="ds-focus-ring flex items-center gap-2 rounded-full border border-border/[0.12] px-3 py-1.5 text-ds-caption font-medium text-text-primary hover:bg-text-primary/5"
            >
              {clock.isRunning ? <Pause size={14} /> : <Play size={14} />}
              {clock.isRunning ? t.electricity.hud.clockPause : t.electricity.hud.clockStart}
            </button>
            <div role="radiogroup" aria-label={t.electricity.hud.qualityAria} className="flex items-center gap-1">
              <span className="mr-1">{t.electricity.hud.qualityAria}:</span>
              {QUALITY_OPTIONS.map((level) => (
                <button
                  key={level}
                  onClick={() => setQuality(level)}
                  role="radio"
                  aria-checked={quality === level}
                  data-testid={`quality-${level}`}
                  className={`ds-focus-ring rounded-full border px-2.5 py-1 transition-colors ${
                    quality === level ? "border-accent text-accent" : "border-border/[0.12] text-text-muted hover:text-text-primary"
                  }`}
                >
                  {level === "low" ? t.electricity.hud.qualityLow : level === "medium" ? t.electricity.hud.qualityMedium : t.electricity.hud.qualityHigh}
                </button>
              ))}
            </div>
          </div>
        )}

        <div
          data-testid="circuit-status"
          data-active={solution.isCircuitActive}
          data-short={solution.isShortCircuit}
          data-fuse-blown={state.components.find((c) => c.id === "fuse")?.isBlown ?? false}
          className="text-ds-body text-text-secondary"
        >
          {!solution.isClosedLoop && <p className="text-text-muted">{t.electricity.hud.statusConnect}</p>}
          {solution.isClosedLoop && solution.isShortCircuit && (
            <p className="font-medium text-danger">{t.electricity.hud.statusShort.replace("{current}", solution.currentA.toFixed(1))}</p>
          )}
          {solution.isClosedLoop && !solution.isShortCircuit && !solution.isCircuitActive && (
            <p className="text-warning">{t.electricity.hud.statusClosedNoCurrent}</p>
          )}
          {solution.isClosedLoop && solution.isCircuitActive && (
            <p className="text-success">
              {t.electricity.hud.statusActive
                .replace("{current}", solution.currentA.toFixed(2))
                .replace("{voltage}", (battery?.voltageV ?? 0).toFixed(1))}
            </p>
          )}
        </div>

        <VisibleWarnings warnings={safetyWarnings}>
          {(safetyWarnings) => (
            <AnimatePresence>
              {safetyWarnings.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  className="flex flex-col gap-2"
                  data-testid="safety-warnings"
                >
                  {safetyWarnings.map((w, i) => (
                    <motion.div
                      key={`${w.code}-${i}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      data-testid={`safety-warning-${w.code}`}
                      className={`flex items-center gap-2 rounded-ds-control border p-3 text-ds-body ${
                        w.severity === "danger" ? "border-danger/40 bg-danger/10 text-danger" : "border-warning/40 bg-warning/10 text-warning"
                      }`}
                    >
                      <AlertTriangle size={14} className="shrink-0" />
                      {w.message}
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </VisibleWarnings>

        {labMode === "training" ? (
          <>
            <TutorialAutoClose />
            <TutorialPanel />
            <TaskPanel />
            <FindBreakSetup />
          </>
        ) : (
          <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="voltage-slider" className="mb-1 block text-ds-caption font-medium text-text-secondary">
                {t.electricity.hud.voltageLabel}: {(battery?.voltageV ?? 0).toFixed(1)} {t.electricity.hud.unitV}
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
                className="w-full accent-accent"
              />
            </div>
            <div>
              <label htmlFor="resistance-slider" className="mb-1 block text-ds-caption font-medium text-text-secondary">
                {t.electricity.hud.resistanceLabel}: {(resistor?.resistanceOhm ?? 0).toFixed(1)} {t.electricity.hud.unitOhm}
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
                className="w-full accent-accent"
              />
            </div>
          </div>
            <ElectricityLabExperienceSection />
            <ElectricityLabNotebookPanel />
            <CompleteLabSection simulationId={simulation.id} actionsLog={actionsLog} mountedAtRef={mountedAtRef} />
          </>
        )}

        <ProgressBanners />
      </div>
    </div>

    <TeacherChatPanel
      simulationId={simulation.id}
      selectedComponentId={state.selectedId}
      components={state.components}
      connections={state.connections}
      solution={solution}
    />
    </div>
    </ComponentDragProvider>
    </LabModeContext.Provider>
    </ElectricityLabExperienceProvider>
    </TaskProgressProvider>
    </TutorialProvider>
  );
}
