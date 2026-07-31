"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html, QuadraticBezierLine, MeshTransmissionMaterial } from "@react-three/drei";
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

function Battery() {
  const { hovered, onPointerOver, onPointerOut } = useHoverTooltip();
  const { suggestedTerminals } = useTutorial();
  const info = COMPONENT_INFO.battery;
  return (
    <group position={[-3.2, 0.28, 0]} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      {/* пластиковый корпус — матовый, невысокая металличность */}
      <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.22, 0.22, 0.9, 24]} />
        <meshStandardMaterial color="#1d4ed8" roughness={0.5} metalness={0.08} />
      </mesh>
      {/* латунные клеммы */}
      <mesh rotation={[0, 0, Math.PI / 2]} position={[-0.42, 0, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.06, 16]} />
        <meshStandardMaterial color="#1c1917" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0.42, 0, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.06, 16]} />
        <meshStandardMaterial color={BRASS_COLOR} metalness={0.85} roughness={0.25} />
      </mesh>
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
  const { suggestedTerminals } = useTutorial();
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
  const filamentRef = useRef<THREE.MeshStandardMaterial>(null);
  const { hovered, onPointerOver, onPointerOut } = useHoverTooltip();
  const { suggestedTerminals } = useTutorial();
  const info = COMPONENT_INFO.bulb;

  useFrame((_, delta) => {
    // плавный разогрев/остывание — тот же easing-принцип для света и
    // свечения нити, скорость подобрана так, чтобы лампа "оживала"
    // ощутимо, но не мгновенно
    const targetIntensity = brightness * 3.5;
    if (lightRef.current) {
      lightRef.current.intensity = THREE.MathUtils.lerp(lightRef.current.intensity, targetIntensity, Math.min(1, delta * 2.5));
    }
    if (filamentRef.current) {
      // без базовой засветки — при нулевом токе нить должна быть полностью темной
      filamentRef.current.emissiveIntensity = THREE.MathUtils.lerp(
        filamentRef.current.emissiveIntensity,
        brightness * 3.5,
        Math.min(1, delta * 2.5)
      );
    }
  });

  return (
    <group position={[0.2, 0.6, 0]} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      {/* алюминиевый цоколь */}
      <mesh position={[0, -0.32, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.14, 0.16, 16]} />
        <meshStandardMaterial color="#9ca3af" metalness={0.9} roughness={0.28} />
      </mesh>
      <mesh position={[0, -0.24, 0]}>
        <torusGeometry args={[0.125, 0.008, 8, 24]} />
        <meshStandardMaterial color="#6b7280" metalness={0.9} roughness={0.35} />
      </mesh>
      <mesh castShadow>
        <sphereGeometry args={[0.28, 32, 32]} />
        <MeshTransmissionMaterial thickness={0.08} roughness={0.06} transmission={0.94} ior={1.45} color="#fefce8" resolution={128} samples={2} />
      </mesh>
      <mesh>
        <torusGeometry args={[0.08, 0.012, 8, 24]} />
        <meshStandardMaterial ref={filamentRef} color="#fde047" emissive="#facc15" emissiveIntensity={0} />
      </mesh>
      <pointLight ref={lightRef} color="#fde047" intensity={0} distance={4} decay={2} />
      <ConnectionPoint id="bulb_a" position={[-0.42, -0.6, 0]} suggested={suggestedTerminals?.includes("bulb_a") ?? false} />
      <ConnectionPoint id="bulb_b" position={[0.42, -0.6, 0]} suggested={suggestedTerminals?.includes("bulb_b") ?? false} />
      {hovered && <TooltipLabel label={`${info.emoji} ${info.name}`} position={[0, 0.4, 0]} />}
    </group>
  );
}

function Switch({ isClosed, onToggle }: { isClosed: boolean; onToggle: () => void }) {
  const leverRef = useRef<THREE.Group>(null);
  const { hovered, onPointerOver, onPointerOut } = useHoverTooltip();
  const { suggestedTerminals } = useTutorial();
  const info = COMPONENT_INFO.switch;

  useFrame((_, delta) => {
    if (!leverRef.current) return;
    const targetAngle = isClosed ? 0 : -0.7;
    leverRef.current.rotation.z = THREE.MathUtils.lerp(leverRef.current.rotation.z, targetAngle, Math.min(1, delta * 6));
  });

  return (
    <group position={[1.9, 0.28, 0]} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      {/* пластиковое основание */}
      <mesh position={[0, -0.08, 0]} castShadow>
        <boxGeometry args={[0.9, 0.08, 0.3]} />
        <meshStandardMaterial color="#334155" roughness={0.55} metalness={0.15} />
      </mesh>
      <group ref={leverRef} position={[-0.35, 0, 0]}>
        <mesh position={[0.35, 0.04, 0]} castShadow onClick={onToggle}>
          <boxGeometry args={[0.7, 0.05, 0.06]} />
          <meshStandardMaterial color={isClosed ? "#16a34a" : "#dc2626"} roughness={0.25} metalness={0.5} />
        </mesh>
        {/* металлическая шарнирная ось */}
        <mesh>
          <sphereGeometry args={[0.035, 10, 10]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.9} roughness={0.25} />
        </mesh>
      </group>
      <ConnectionPoint id="switch_a" position={[-0.4, 0, 0]} suggested={suggestedTerminals?.includes("switch_a") ?? false} />
      <ConnectionPoint id="switch_b" position={[0.4, 0, 0]} suggested={suggestedTerminals?.includes("switch_b") ?? false} />
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

  return (
    <group position={position}>
      <mesh castShadow>
        <boxGeometry args={[0.55, 0.4, 0.3]} />
        <meshStandardMaterial color="#0f172a" roughness={0.35} metalness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.151]}>
        <planeGeometry args={[0.47, 0.33]} />
        <meshStandardMaterial color="#052e1b" roughness={0.4} metalness={0.1} />
      </mesh>
      <Html position={[0, 0, 0.16]} center distanceFactor={6} occlude>
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
  const { suggestedTerminals } = useTutorial();
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
  const { suggestedTerminals } = useTutorial();
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
  const { suggestedTerminals } = useTutorial();
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
  const context = useMemo(
    () => buildAIContext({ task, taskStatus: status, xp: totalXp, components, connections, solution, validation: result }),
    [task, status, totalXp, components, connections, solution, result]
  );
  return (
    <AITeacherChat
      simulationId={simulationId}
      context={context}
      learningProfile={learningProfile}
      onMessageSent={recordHintUsed}
    />
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
          <label className="mb-1 block font-mono text-xs uppercase tracking-widest text-slate-400">
            Напряжение источника: {(battery?.voltageV ?? 0).toFixed(1)} В
          </label>
          <input
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
          <label className="mb-1 block font-mono text-xs uppercase tracking-widest text-slate-400">
            Сопротивление резистора: {(resistor?.resistanceOhm ?? 0).toFixed(1)} Ом
          </label>
          <input
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
            <button
              onClick={handleReset}
              data-testid="reset-button"
              className="flex items-center gap-2 rounded-full border border-glass-border px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/5"
            >
              <RotateCcw size={16} />
              Сбросить
            </button>
          </div>

          <div className="flex items-center gap-1 font-mono text-xs text-slate-500">
            {QUALITY_OPTIONS.map((level) => (
              <button
                key={level}
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
          <TaskPanel />
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
    </TaskProgressProvider>
    </TutorialProvider>
  );
}
