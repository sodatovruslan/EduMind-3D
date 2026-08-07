"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";

/**
 * Physical World Core — Interaction System для перемещения физических
 * компонентов по верстаку (post-S9.9 sandbox acceptance fix). Отдельная,
 * самостоятельная машина состояний — НЕ WireDragProvider.tsx: протяжка
 * провода начинается с клеммы и заканчивается на другой клемме;
 * перемещение компонента начинается с тела компонента и заканчивается
 * где угодно на столе. Смешивать их в одном провайдере значило бы
 * реально спутать два разных требования (см. явное указание не путать
 * wire dragging с component dragging).
 *
 * Тот же архитектурный паттерн, что и WireDragProvider (pointerDown ->
 * невидимая поверхность ловит pointerMove -> pointerUp коммитит,
 * Escape/window-pointerup — восстановление), переиспользован намеренно
 * ради согласованности, а не скопирован бездумно.
 */

// ниже которого перемещение считается "не было" (обычный клик) — иначе
// Switch/провода-клики после лёгкого дрожания руки ошибочно считались бы
// перемещением на долю миллиметра
const DRAG_MOVE_THRESHOLD = 0.05;

// разумные границы верстака — те же порядки величин, что и раскладка
// компонентов по умолчанию (см. DEFAULT_COMPONENT_POSITIONS), с запасом на
// перекомпоновку. Y никогда не меняется драгом (компонент не может
// "провалиться" сквозь стол или взлететь — ось Y для перетаскивания
// архитектурно недоступна, а не просто клампится)
export const COMPONENT_DRAG_BOUNDS = { minX: -5, maxX: 5, minZ: -3, maxZ: 3 };

interface ComponentDragContextValue {
  draggingComponentId: string | null;
  previewPosition: [number, number, number] | null;
  startDrag: (componentId: string, currentPosition: [number, number, number]) => void;
  updatePreviewPosition: (point: THREE.Vector3) => void;
  commitDrag: () => void;
  cancelDrag: () => void;
  // true ровно один раз сразу после реального (не ниже порога) перемещения
  // этого компонента — Switch использует это, чтобы подавить "клик"
  // (переключение), который иначе синтетически сработал бы сразу после
  // отпускания в конце драга (pointerUp на том же меше, что и pointerDown)
  consumeJustDragged: (componentId: string) => boolean;
}

const ComponentDragContext = createContext<ComponentDragContextValue | undefined>(undefined);

export function ComponentDragProvider({
  onMove,
  children,
}: {
  onMove: (componentId: string, position: [number, number, number]) => void;
  children: React.ReactNode;
}) {
  const [draggingComponentId, setDraggingComponentId] = useState<string | null>(null);
  const [previewPosition, setPreviewPosition] = useState<[number, number, number] | null>(null);

  const draggingRef = useRef<string | null>(null);
  const startPositionRef = useRef<[number, number, number] | null>(null);
  const previewRef = useRef<[number, number, number] | null>(null);
  const fixedYRef = useRef(0);
  const justDraggedRef = useRef<Set<string>>(new Set());

  const startDrag = useCallback((componentId: string, currentPosition: [number, number, number]) => {
    draggingRef.current = componentId;
    startPositionRef.current = currentPosition;
    previewRef.current = currentPosition;
    fixedYRef.current = currentPosition[1];
    setDraggingComponentId(componentId);
    setPreviewPosition(currentPosition);
    document.body.style.cursor = "grabbing";
  }, []);

  const updatePreviewPosition = useCallback((point: THREE.Vector3) => {
    if (!draggingRef.current) return;
    const next: [number, number, number] = [
      THREE.MathUtils.clamp(point.x, COMPONENT_DRAG_BOUNDS.minX, COMPONENT_DRAG_BOUNDS.maxX),
      fixedYRef.current,
      THREE.MathUtils.clamp(point.z, COMPONENT_DRAG_BOUNDS.minZ, COMPONENT_DRAG_BOUNDS.maxZ),
    ];
    previewRef.current = next;
    setPreviewPosition(next);
  }, []);

  const commitDrag = useCallback(() => {
    const id = draggingRef.current;
    const start = startPositionRef.current;
    const preview = previewRef.current;
    draggingRef.current = null;
    startPositionRef.current = null;
    previewRef.current = null;
    setDraggingComponentId(null);
    setPreviewPosition(null);
    document.body.style.cursor = "auto";
    if (!id || !preview) return;
    const moved = start ? new THREE.Vector3(...start).distanceTo(new THREE.Vector3(...preview)) > DRAG_MOVE_THRESHOLD : true;
    if (moved) {
      justDraggedRef.current.add(id);
      onMove(id, preview);
    }
  }, [onMove]);

  const cancelDrag = useCallback(() => {
    draggingRef.current = null;
    startPositionRef.current = null;
    previewRef.current = null;
    setDraggingComponentId(null);
    setPreviewPosition(null);
    document.body.style.cursor = "auto";
  }, []);

  const consumeJustDragged = useCallback((componentId: string) => {
    if (justDraggedRef.current.has(componentId)) {
      justDraggedRef.current.delete(componentId);
      return true;
    }
    return false;
  }, []);

  // тот же приём восстановления, что и в WireDragProvider: pointerUp вне
  // канваса не должен оставлять драг зависшим навсегда. В отличие от
  // отмены провода, обычное отпускание где угодно ЗАВЕРШАЕТ перемещение
  // (компонент остаётся там, куда его дотащили) — это ожидаемое поведение
  // drag-and-drop; ТОЛЬКО Escape явно отменяет/возвращает исходную позицию.
  useEffect(() => {
    function handleWindowPointerUp() {
      commitDrag();
    }
    function handleWindowKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") cancelDrag();
    }
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("keydown", handleWindowKeyDown);
    return () => {
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [commitDrag, cancelDrag]);

  const value = useMemo<ComponentDragContextValue>(
    () => ({ draggingComponentId, previewPosition, startDrag, updatePreviewPosition, commitDrag, cancelDrag, consumeJustDragged }),
    [draggingComponentId, previewPosition, startDrag, updatePreviewPosition, commitDrag, cancelDrag, consumeJustDragged]
  );

  return <ComponentDragContext.Provider value={value}>{children}</ComponentDragContext.Provider>;
}

export function useComponentDrag(): ComponentDragContextValue {
  const ctx = useContext(ComponentDragContext);
  if (!ctx) throw new Error("useComponentDrag должен использоваться внутри <ComponentDragProvider>");
  return ctx;
}

// невидимая плоскость верстака — тот же приём, что и WireDragSurface;
// отдельный экземпляр (не переиспользуем WireDragSurface напрямую), т.к.
// это осознанно другая машина состояний с другим набором обработчиков
export function ComponentDragSurface({ y = 0, size = 12 }: { y?: number; size?: number }) {
  const { draggingComponentId, updatePreviewPosition, commitDrag } = useComponentDrag();

  function handlePointerMove(e: ThreeEvent<PointerEvent>) {
    if (!draggingComponentId) return;
    updatePreviewPosition(e.point.clone());
  }

  return (
    <mesh
      position={[0, y, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerMove={handlePointerMove}
      onPointerUp={() => {
        if (draggingComponentId) commitDrag();
      }}
      visible={false}
    >
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );
}
