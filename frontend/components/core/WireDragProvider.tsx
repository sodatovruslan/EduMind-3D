"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";

/**
 * Physical World Core — Interaction System для проводов: pointer-down на
 * терминале начинает "тянуть" провод, pointer-move обновляет свободный
 * конец, pointer-up на ДРУГОМ терминале коммитит соединение через onConnect.
 * Компонент-потребитель (ElectricityLabScene) сам решает, что делать с
 * соединением (обычно — записать в ExperimentStateProvider).
 */
interface WireDragContextValue {
  draggingFrom: string | null;
  pendingPoint: THREE.Vector3 | null;
  hoveredTerminal: string | null;
  startDrag: (terminalId: string) => void;
  updatePendingPoint: (point: THREE.Vector3) => void;
  setHoveredTerminal: (id: string | null) => void;
  commitDrag: (terminalId: string) => void;
  cancelDrag: () => void;
  registerTerminalPosition: (id: string, position: THREE.Vector3) => void;
  getTerminalPosition: (id: string) => THREE.Vector3 | undefined;
}

const WireDragContext = createContext<WireDragContextValue | undefined>(undefined);

export function WireDragProvider({
  onConnect,
  children,
}: {
  onConnect: (fromId: string, toId: string) => void;
  children: React.ReactNode;
}) {
  const [draggingFrom, setDraggingFrom] = useState<string | null>(null);
  const [pendingPoint, setPendingPoint] = useState<THREE.Vector3 | null>(null);
  const [hoveredTerminal, setHoveredTerminal] = useState<string | null>(null);
  const positionsRef = useRef(new Map<string, THREE.Vector3>());

  const startDrag = useCallback((terminalId: string) => {
    setDraggingFrom(terminalId);
    const pos = positionsRef.current.get(terminalId);
    if (pos) setPendingPoint(pos.clone());
  }, []);

  const updatePendingPoint = useCallback((point: THREE.Vector3) => {
    setPendingPoint(point);
  }, []);

  const commitDrag = useCallback(
    (terminalId: string) => {
      setDraggingFrom((from) => {
        if (from && from !== terminalId) onConnect(from, terminalId);
        return null;
      });
      setPendingPoint(null);
    },
    [onConnect]
  );

  const cancelDrag = useCallback(() => {
    setDraggingFrom(null);
    setPendingPoint(null);
  }, []);

  const registerTerminalPosition = useCallback((id: string, position: THREE.Vector3) => {
    positionsRef.current.set(id, position.clone());
  }, []);

  const getTerminalPosition = useCallback((id: string) => positionsRef.current.get(id), []);

  const value = useMemo<WireDragContextValue>(
    () => ({
      draggingFrom,
      pendingPoint,
      hoveredTerminal,
      startDrag,
      updatePendingPoint,
      setHoveredTerminal,
      commitDrag,
      cancelDrag,
      registerTerminalPosition,
      getTerminalPosition,
    }),
    [draggingFrom, pendingPoint, hoveredTerminal, startDrag, updatePendingPoint, commitDrag, cancelDrag, registerTerminalPosition, getTerminalPosition]
  );

  return <WireDragContext.Provider value={value}>{children}</WireDragContext.Provider>;
}

export function useWireDrag(): WireDragContextValue {
  const ctx = useContext(WireDragContext);
  if (!ctx) throw new Error("useWireDrag должен использоваться внутри <WireDragProvider>");
  return ctx;
}

// невидимая плоскость на уровне рабочего стола — ловит pointerMove для
// свободного конца провода и pointerMissed/pointerUp по пустому месту
// для отмены жеста
export function WireDragSurface({ y = 0, size = 12 }: { y?: number; size?: number }) {
  const { draggingFrom, updatePendingPoint, cancelDrag } = useWireDrag();

  function handlePointerMove(e: ThreeEvent<PointerEvent>) {
    if (!draggingFrom) return;
    updatePendingPoint(e.point.clone());
  }

  return (
    <mesh
      position={[0, y, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerMove={handlePointerMove}
      onPointerUp={() => {
        if (draggingFrom) cancelDrag();
      }}
      visible={false}
    >
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );
}
