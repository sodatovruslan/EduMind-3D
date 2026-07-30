"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Flame, RotateCw } from "lucide-react";
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
import { checkSafety, type SafetyWarning } from "@/lib/chemistry-safety";
import { buildChemistryAIContext } from "@/lib/chemistry-context-builder";
import { useQuality, type QualityLevel } from "@/lib/quality-context";
import type { Simulation } from "@/lib/types";

const HEAT_RATE_C_PER_SEC = 12;
const DROP_PROXIMITY_RADIUS = 0.5;

// процедурная текстура столешницы — своя отдельная реализация (тот же
// прием CanvasTexture, что и в Electricity Lab, но не переиспользует его код)
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
      select(id);
      startDrag(id);
    },
  };
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

function ContainerMesh({ item }: { item: ContainerItem }) {
  const { state } = useChemistryWorkspace();
  const { onPointerDown } = useDragHandlers(item.id);
  const isSelected = state.selectedItemId === item.id;
  const isActive = state.activeContainerId === item.id;

  const colorHex = computeColorHex(item.data);
  const volumeMl = totalVolumeMl(item.data);
  const fillHeight = Math.min(0.32, (volumeMl / 400) * 0.32);
  const hasPrecipitate = item.data.precipitate.length > 0;
  const aggregateState = aggregateStateOf(item.data);

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
    >
      {/* прозрачное "стекло" */}
      <mesh castShadow>
        {outerGeometry}
        <meshPhysicalMaterial
          color="#dbeafe"
          transparent
          opacity={0.28}
          roughness={0.1}
          transmission={0.6}
          thickness={0.05}
        />
      </mesh>

      {/* жидкость внутри — цвет и уровень посчитаны Chemistry Engine */}
      {volumeMl > 0 && (
        <mesh position={[0, -halfHeight + fillHeight / 2, 0]}>
          <cylinderGeometry args={[0.2, 0.2, Math.max(0.02, fillHeight), 20]} />
          <meshStandardMaterial color={colorHex} transparent opacity={aggregateState === "gas" ? 0.35 : 0.85} />
        </mesh>
      )}

      {/* осадок на дне — реальный, только если Chemistry Engine его посчитал */}
      {hasPrecipitate && (
        <mesh position={[0, -halfHeight + 0.015, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 0.03, 20]} />
          <meshStandardMaterial color={SUBSTANCES[item.data.precipitate[0].substanceId]?.colorHex ?? "#f5f5f4"} roughness={0.8} />
        </mesh>
      )}

      {(isSelected || isActive) && (
        <mesh position={[0, -halfHeight - 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.28, 0.32, 24]} />
          <meshBasicMaterial color={isActive ? "#a78bfa" : "#38bdf8"} transparent opacity={0.7} />
        </mesh>
      )}

      {isSelected && <RotateHandle id={item.id} />}

      <Html position={[0, halfHeight + 0.25, 0]} center distanceFactor={9} style={{ pointerEvents: "none" }}>
        <div className="pointer-events-none whitespace-nowrap rounded-md border border-white/10 bg-slate-900/85 px-2 py-0.5 text-[10px] text-slate-100">
          {item.data.temperatureC.toFixed(0)}°C
        </div>
      </Html>
    </group>
  );
}

function StockBottleMesh({ bottle }: { bottle: StockBottle }) {
  const [hovered, setHovered] = useState(false);
  const { onPointerDown } = useDragHandlers(bottle.id);
  const substance = SUBSTANCES[bottle.substanceId];

  return (
    <group
      position={[bottle.position[0], 0.16, bottle.position[1]]}
      onPointerDown={onPointerDown}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <mesh castShadow>
        <cylinderGeometry args={[0.09, 0.09, 0.32, 16]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.3} metalness={0.1} transparent opacity={0.85} />
      </mesh>
      <mesh position={[0, 0.19, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.06, 12]} />
        <meshStandardMaterial color={substance?.colorHex ?? "#94a3b8"} metalness={0.4} roughness={0.4} />
      </mesh>
      {hovered && (
        <Html position={[0, 0.35, 0]} center distanceFactor={9} style={{ pointerEvents: "none" }}>
          <div className="pointer-events-none whitespace-nowrap rounded-md border border-white/10 bg-slate-900/90 px-2 py-1 text-xs text-slate-100">
            {substance?.name} ({substance?.formula})
          </div>
        </Html>
      )}
    </group>
  );
}

function BurnerMesh({ tool }: { tool: ToolItem }) {
  const { toggleBurner } = useChemistryWorkspace();
  const { onPointerDown } = useDragHandlers(tool.id);
  const flameRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!flameRef.current) return;
    const pulse = tool.isOn ? 1 + Math.sin(clock.elapsedTime * 10) * 0.15 : 0.001;
    flameRef.current.scale.setScalar(pulse);
  });

  return (
    <group position={[tool.position[0], 0, tool.position[1]]} rotation={[0, tool.rotationY, 0]} onPointerDown={onPointerDown}>
      <mesh castShadow>
        <cylinderGeometry args={[0.22, 0.26, 0.18, 20]} />
        <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh
        position={[0, 0.12, 0]}
        onClick={(e) => {
          e.stopPropagation();
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
    </group>
  );
}

function StandMesh({ tool }: { tool: ToolItem }) {
  const { onPointerDown } = useDragHandlers(tool.id);
  return (
    <group position={[tool.position[0], 0, tool.position[1]]} rotation={[0, tool.rotationY, 0]} onPointerDown={onPointerDown}>
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
    </group>
  );
}

function PipetteMesh({ tool }: { tool: ToolItem }) {
  const { onPointerDown } = useDragHandlers(tool.id);
  return (
    <group position={[tool.position[0], 0.05, tool.position[1]]} rotation={[0, tool.rotationY, 0]} onPointerDown={onPointerDown}>
      <mesh castShadow>
        <cylinderGeometry args={[0.02, 0.03, 0.5, 12]} />
        <meshStandardMaterial color="#cbd5e1" transparent opacity={0.5} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.28, 0]}>
        <sphereGeometry args={[0.05, 12, 12]} />
        <meshStandardMaterial color="#f87171" roughness={0.6} />
      </mesh>
    </group>
  );
}

function ThermometerMesh({ tool }: { tool: ToolItem }) {
  const { state } = useChemistryWorkspace();
  const { onPointerDown } = useDragHandlers(tool.id);
  const active = state.containers.find((c) => c.id === state.activeContainerId);

  return (
    <group position={[tool.position[0], 0.05, tool.position[1]]} rotation={[0, tool.rotationY, 0]} onPointerDown={onPointerDown}>
      <mesh castShadow>
        <cylinderGeometry args={[0.015, 0.015, 0.45, 10]} />
        <meshStandardMaterial color="#e2e8f0" transparent opacity={0.7} />
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
    </group>
  );
}

function ScaleMesh({ tool }: { tool: ToolItem }) {
  const { state } = useChemistryWorkspace();
  const { onPointerDown } = useDragHandlers(tool.id);
  const active = state.containers.find((c) => c.id === state.activeContainerId);
  const massG = active ? totalMassG(active.data) : 0;

  return (
    <group position={[tool.position[0], 0, tool.position[1]]} rotation={[0, tool.rotationY, 0]} onPointerDown={onPointerDown}>
      <mesh castShadow>
        <boxGeometry args={[0.5, 0.08, 0.4]} />
        <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.4} />
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
    </group>
  );
}

function ChemistryScene({ onDrop }: { onDrop: (id: string, x: number, z: number) => void }) {
  const { state, heatTick } = useChemistryWorkspace();

  useFrame((_, delta) => {
    const burnerOn = state.tools.some((t) => t.kind === "burner" && t.isOn);
    if (burnerOn) heatTick(delta * HEAT_RATE_C_PER_SEC);
  });

  return (
    <group>
      <directionalLight position={[2, 4, 3]} intensity={0.4} color="#fff7ed" />
      <pointLight position={[-2, 2.5, 2]} intensity={0.2} color="#e0f2fe" distance={8} decay={2} />

      <Workbench />

      {state.containers.map((c) => (
        <ContainerMesh key={c.id} item={c} />
      ))}
      {state.stockBottles.map((b) => (
        <StockBottleMesh key={b.id} bottle={b} />
      ))}
      {state.tools.map((t) => {
        if (t.kind === "burner") return <BurnerMesh key={t.id} tool={t} />;
        if (t.kind === "stand") return <StandMesh key={t.id} tool={t} />;
        if (t.kind === "pipette") return <PipetteMesh key={t.id} tool={t} />;
        if (t.kind === "thermometer") return <ThermometerMesh key={t.id} tool={t} />;
        if (t.kind === "scale") return <ScaleMesh key={t.id} tool={t} />;
        return null;
      })}

      <DragSurface onDrop={onDrop} />
    </group>
  );
}

// пока ученик тащит оборудование, OrbitControls должен быть выключен —
// иначе тот же pointer-жест еще и крутит камеру (тот же прием, что
// ElectricityCanvas/orbitEnabled={!draggingFrom} в Electricity Lab)
function ChemistryCanvas({ quality, onDrop }: { quality: QualityLevel; onDrop: (id: string, x: number, z: number) => void }) {
  const { draggingId } = useChemistryDrag();
  return (
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
      <ChemistryScene onDrop={onDrop} />
    </CanvasShell>
  );
}

const QUALITY_OPTIONS: QualityLevel[] = ["low", "medium", "high"];
const QUALITY_LABEL: Record<QualityLevel, string> = { low: "Низкое", medium: "Среднее", high: "Высокое" };

function distance(a: [number, number], b: [number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
}

// AI Teacher (Chemistry World): собирает ChemistryAIContext из уже
// посчитанного Chemistry/Reaction Engine + Experiment Validator + Safety
// System — рендерится внутри ExperimentProgressProvider
function ChemistryTeacherChatPanel({ simulationId, safetyWarnings }: { simulationId: string; safetyWarnings: SafetyWarning[] }) {
  const { state } = useChemistryWorkspace();
  const { experiment, status: experimentStatus, result } = useExperimentProgress();
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
          })
        : null,
    [experiment, experimentStatus, activeContainer, occurredReactionIds, result, safetyWarnings]
  );

  if (!context) return null;
  return <ChemistryTeacherChat simulationId={simulationId} context={context} />;
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

function ChemistryWorldInner({ simulation }: ChemistryWorldSceneProps) {
  const { state, addSubstanceToContainer, pourInto, moveItem, setActiveContainer } = useChemistryWorkspace();
  const { quality, setQuality } = useQuality();

  const activeContainer = state.containers.find((c) => c.id === state.activeContainerId) ?? state.containers[0];
  const occurredReactionIds = useMemo(
    () => state.reactionLog.filter((e) => e.containerId === activeContainer.id).map((e) => e.reactionId),
    [state.reactionLog, activeContainer.id]
  );
  const safetyWarnings = useMemo(() => checkSafety({ container: activeContainer.data, firstAddedOrder: state.firstAddedOrder[activeContainer.id] }), [
    activeContainer,
    state.firstAddedOrder,
  ]);

  function handleDrop(id: string, x: number, z: number) {
    const point: [number, number] = [x, z];

    const draggedContainer = state.containers.find((c) => c.id === id);
    if (draggedContainer) {
      const target = state.containers.find((c) => c.id !== id && distance(c.position, point) < DROP_PROXIMITY_RADIUS);
      if (target) {
        pourInto(id, target.id);
        return;
      }
      moveItem(id, point);
      return;
    }

    const draggedBottle = state.stockBottles.find((b) => b.id === id);
    if (draggedBottle) {
      const target = state.containers.find((c) => distance(c.position, point) < DROP_PROXIMITY_RADIUS);
      if (target) {
        addSubstanceToContainer(target.id, draggedBottle.substanceId, 20);
        return;
      }
      // бутылка возвращается на полку, если брошена не рядом с сосудом
      return;
    }

    moveItem(id, point);
  }

  return (
    <ChemistryTutorialProvider container={activeContainer.data}>
      <ExperimentProgressProvider labState={{ container: activeContainer.data, occurredReactionIds }}>
        <ChemistryDragProvider>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <div className="flex-1 rounded-2xl bg-gradient-to-b from-slate-900 via-slate-950 to-black p-3 sm:p-5">
              <ChemistryCanvas quality={quality} onDrop={handleDrop} />

              <div className="glass-panel mt-4 grid grid-cols-1 gap-4 rounded-2xl p-4 sm:grid-cols-2">
                <div className="flex items-center gap-2 text-xs text-slate-500 sm:col-span-2">
                  Перетаскивай бутылки с реактивами на сосуды, сосуды — друг на друга (чтобы перелить), нажми на горелку,
                  чтобы включить нагрев. Выбранный сосуд отмечен фиолетовым кольцом — именно его проверяет текущий
                  эксперимент.
                </div>

                <ChemistryTutorialPanel />

                <div className="sm:col-span-2">
                  <label className="mb-1 block font-mono text-xs uppercase tracking-widest text-slate-400">
                    Активный сосуд (проверяется экспериментом)
                  </label>
                  <div className="flex gap-2">
                    {state.containers.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setActiveContainer(c.id)}
                        data-testid={`select-active-${c.id}`}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                          state.activeContainerId === c.id
                            ? "border-neon-violet text-neon-violet"
                            : "border-glass-border text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {c.kind === "test_tube" ? "Пробирка" : c.kind === "flask" ? "Колба" : "Стакан"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1 font-mono text-xs text-slate-500 sm:col-span-2">
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

                {safetyWarnings.length > 0 && (
                  <div className="flex flex-col gap-2 sm:col-span-2" data-testid="safety-warnings">
                    {safetyWarnings.map((w) => (
                      <div
                        key={w.code}
                        className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${
                          w.severity === "danger"
                            ? "border-red-400/40 bg-red-500/10 text-red-300"
                            : "border-amber-400/40 bg-amber-500/10 text-amber-200"
                        }`}
                        data-testid={`safety-warning-${w.code}`}
                      >
                        <Flame size={14} className="shrink-0" />
                        {w.message}
                      </div>
                    ))}
                  </div>
                )}

                <div className="sm:col-span-2">
                  <ExperimentPanel />
                </div>
              </div>
            </div>

            <ChemistryTeacherChatPanel simulationId={simulation.id} safetyWarnings={safetyWarnings} />
          </div>
        </ChemistryDragProvider>
      </ExperimentProgressProvider>
    </ChemistryTutorialProvider>
  );
}
