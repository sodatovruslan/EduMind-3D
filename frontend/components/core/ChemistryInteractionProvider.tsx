"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  getInteractable,
  type InteractableConfig,
  type InteractableRuntimeState,
  type PlacementSurfaceKind,
} from "@/lib/interactables";

/**
 * Chemistry World — Interaction Core, Stage S-1 (Focus & Pickup) + Stage S-2
 * (Free Placement). Отдельное, эфемерное состояние наведения/удержания/
 * прицеливания — то же разделение, что ChemistryDragProvider/WireDragProvider:
 * interaction state отдельно от домена (ChemistryWorkspaceProvider). НЕ
 * заменяет ChemistryDragProvider — сосуществует рядом; предметы без записи в
 * INTERACTABLE_REGISTRY (lib/interactables.ts) продолжают управляться старым
 * drag-механизмом без единого изменения.
 *
 * Ключевое свойство: пока предмет держат (heldId !== null) и НЕ подтверждено
 * размещение, в ChemistryWorkspaceProvider не диспетчится ни одно действие —
 * визуальный "полет к руке"/предпросмотр на столе (HeldObjectRig в
 * ChemistryWorldScene.tsx) и поворот в руке (heldYawOffset) полностью
 * локальны для этого провайдера. Единственный момент записи в домен —
 * confirmPlacement() (клавиша E над валидной точкой), который делает это НЕ
 * напрямую (провайдер домен-агностичен, не импортирует
 * ChemistryWorkspaceProvider), а через переданный снаружи колбэк
 * onConfirmPlacement — так провайдер остается переиспользуемым и для других
 * модулей (например Electricity Lab) с их собственным домен-состоянием.
 */
export type InteractionPhase = "idle" | "focused" | "held";

export interface PlacementCandidate {
  position: [number, number];
  rotationY: number;
  surface: PlacementSurfaceKind;
}

interface ChemistryInteractionContextValue {
  phase: InteractionPhase;
  focusedId: string | null;
  heldId: string | null;
  heldYawOffset: number;
  aimPoint: [number, number] | null;
  placementCandidate: PlacementCandidate | null;
  setFocused: (id: string) => void;
  clearFocused: (id: string) => void;
  pickUp: (id: string) => void;
  release: () => void;
  rotateHeld: (deltaYaw: number) => void;
  setAimPoint: (point: [number, number] | null) => void;
  setPlacementCandidate: (candidate: PlacementCandidate | null) => void;
  confirmPlacement: () => void;
  getPickupBlockedReason: (id: string) => string | null;
}

const ChemistryInteractionContext = createContext<ChemistryInteractionContextValue | undefined>(undefined);

// 15° за нажатие — мельче, чем шаг 45° старого ROTATE_ITEM в
// ChemistryWorkspaceProvider, потому что вращение в руке ручное/визуальное,
// не дискретный снап
const ROTATE_STEP = Math.PI / 12;

interface ChemistryInteractionProviderProps {
  children: React.ReactNode;
  // Stage S-2: вызывается ТОЛЬКО в момент подтверждённого размещения (E над
  // валидной точкой) — единственная точка, где этот провайдер приводит к
  // записи в домен, и делает это чужими руками (колбэк, не прямой импорт).
  onConfirmPlacement?: (id: string, position: [number, number], rotationY: number) => void;
  getInteractableState?: (id: string) => InteractableRuntimeState;
}

export function ChemistryInteractionProvider({
  children,
  onConfirmPlacement,
  getInteractableState,
}: ChemistryInteractionProviderProps) {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [heldId, setHeldId] = useState<string | null>(null);
  const [heldYawOffset, setHeldYawOffset] = useState(0);
  const [aimPoint, setAimPointState] = useState<[number, number] | null>(null);
  const [placementCandidate, setPlacementCandidateState] = useState<PlacementCandidate | null>(null);

  // ref-копии для использования внутри keydown-обработчика без пересоздания
  // слушателя на каждый рендер (тот же прием, что и в ChemistryDragProvider)
  const focusedIdRef = useRef(focusedId);
  focusedIdRef.current = focusedId;
  const heldIdRef = useRef(heldId);
  heldIdRef.current = heldId;
  const placementCandidateRef = useRef(placementCandidate);
  placementCandidateRef.current = placementCandidate;
  // onConfirmPlacement может быть новой функцией на каждый рендер родителя
  // (инлайн-колбэк) — держим в ref, а не в deps эффекта, иначе слушатель
  // клавиатуры пересоздавался бы на каждый рендер
  const onConfirmPlacementRef = useRef(onConfirmPlacement);
  onConfirmPlacementRef.current = onConfirmPlacement;
  const getInteractableStateRef = useRef(getInteractableState);
  getInteractableStateRef.current = getInteractableState;

  const runtimeStateFor = useCallback(
    (id: string): InteractableRuntimeState => getInteractableStateRef.current?.(id) ?? {},
    []
  );

  const getPickupBlockedReason = useCallback((id: string) => {
    const capability = getInteractable(id);
    if (!capability) return null;
    const runtimeState = runtimeStateFor(id);
    return capability.canPickUpNow(runtimeState) ? null : capability.blockedReason(runtimeState);
  }, [runtimeStateFor]);

  const setFocused = useCallback((id: string) => {
    // нельзя сфокусироваться на новом предмете, пока один уже в руке —
    // однопредметная модель "одна рука"
    setFocusedId((current) => (heldIdRef.current ? current : id));
  }, []);

  const clearFocused = useCallback((id: string) => {
    // снимаем фокус, только если он реально принадлежит этому id — защита
    // от гонки onPointerOut/onPointerOver при быстром переходе между
    // соседними предметами
    setFocusedId((current) => (current === id ? null : current));
  }, []);

  const setAimPoint = useCallback((point: [number, number] | null) => {
    setAimPointState(point);
  }, []);

  const setPlacementCandidate = useCallback((candidate: PlacementCandidate | null) => {
    placementCandidateRef.current = candidate;
    setPlacementCandidateState(candidate);
  }, []);

  const pickUp = useCallback((id: string) => {
    if (heldIdRef.current) return; // уже держим другой предмет — no-op
    const capability = getInteractable(id);
    if (!capability || !capability.canBeHeld) return; // нет способности — no-op
    const runtimeState = runtimeStateFor(id);
    if (!capability.canPickUpNow(runtimeState)) return;
    setHeldId(id);
    setHeldYawOffset(runtimeState.rotationY ?? 0);
    setAimPointState(null);
    placementCandidateRef.current = null;
    setPlacementCandidateState(null);
  }, [runtimeStateFor]);

  // Escape — ВСЕГДА безусловный отказ: возвращает предмет в исходную точку
  // текущего pickup-цикла, даже если в этот момент наведена валидная
  // (зелёная) точка размещения. onConfirmPlacement НЕ вызывается — поэтому
  // домен ничего не пишет, и "исходная позиция" — это просто то, что уже
  // было в ChemistryWorkspaceProvider (никогда не менялось, раз запись не
  // произошла) — не требует отдельного снапшота "исходного transform".
  const release = useCallback(() => {
    setHeldId(null);
    setHeldYawOffset(0);
    setAimPointState(null);
    placementCandidateRef.current = null;
    setPlacementCandidateState(null);
  }, []);

  // E над валидной (зелёной) точкой — подтвердить размещение. Над невалидной
  // точкой (красной) или без наведённой точки вовсе — no-op, предмет
  // остаётся в руке (пользователю понятно почему по цвету кольца в сцене).
  const confirmPlacement = useCallback(() => {
    const id = heldIdRef.current;
    const candidate = placementCandidateRef.current;
    if (!id || !candidate) return; // нечего подтверждать — предмет остаётся в руке
    const capability = getInteractable(id);
    if (!capability?.canBePlaced || !capability.allowedSurfaces.includes(candidate.surface)) return;
    onConfirmPlacementRef.current?.(id, candidate.position, candidate.rotationY);
    setHeldId(null);
    setHeldYawOffset(0);
    setAimPointState(null);
    placementCandidateRef.current = null;
    setPlacementCandidateState(null);
  }, []);

  const rotateHeld = useCallback((deltaYaw: number) => {
    if (!heldIdRef.current) return; // нечего вращать — no-op
    setHeldYawOffset((y) => y + deltaYaw);
  }, []);

  // Клавиатура: E — взять/подтвердить размещение, Escape — всегда безусловно
  // отменить и вернуть, ArrowLeft/ArrowRight — вращение в руке. Не реагирует,
  // пока пользователь печатает в любом текстовом поле (AI Teacher chat и
  // т.п.), и игнорирует авто-повтор ОС при зажатой клавише (e.repeat) — без
  // этого зажатая E бесконтрольно чередовала бы действия много раз в секунду.
  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.repeat) return;
      if (isTypingTarget(e.target)) return;

      if (e.key === "e" || e.key === "E") {
        if (heldIdRef.current) {
          confirmPlacement();
        } else if (focusedIdRef.current) {
          pickUp(focusedIdRef.current);
        }
      } else if (e.key === "Escape") {
        if (heldIdRef.current) release();
      } else if (e.key === "ArrowLeft") {
        rotateHeld(-ROTATE_STEP);
      } else if (e.key === "ArrowRight") {
        rotateHeld(ROTATE_STEP);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pickUp, release, rotateHeld, confirmPlacement]);

  const value: ChemistryInteractionContextValue = {
    phase: heldId ? "held" : focusedId ? "focused" : "idle",
    focusedId,
    heldId,
    heldYawOffset,
    aimPoint,
    placementCandidate,
    setFocused,
    clearFocused,
    pickUp,
    release,
    rotateHeld,
    setAimPoint,
    setPlacementCandidate,
    confirmPlacement,
    getPickupBlockedReason,
  };

  return <ChemistryInteractionContext.Provider value={value}>{children}</ChemistryInteractionContext.Provider>;
}

export function useChemistryInteraction(): ChemistryInteractionContextValue {
  const ctx = useContext(ChemistryInteractionContext);
  if (!ctx) throw new Error("useChemistryInteraction должен использоваться внутри <ChemistryInteractionProvider>");
  return ctx;
}

/**
 * Единая точка входа для ЛЮБОГО предмета сцены — заменяет точечные
 * `if (SET.has(id))`-проверки в компонентах одним переиспользуемым хуком.
 * Возвращает capability === null для предметов вне INTERACTABLE_REGISTRY —
 * в этом случае вызывающий компонент должен продолжать использовать старый
 * useDragHandlers без каких-либо изменений (см. ContainerMesh/StockBottleMesh
 * в ChemistryWorldScene.tsx).
 */
export function useInteractable(id: string) {
  const {
    focusedId,
    heldId,
    heldYawOffset,
    placementCandidate,
    setFocused,
    clearFocused,
    getPickupBlockedReason,
  } = useChemistryInteraction();
  const capability: InteractableConfig | null = getInteractable(id);
  const isFocused = focusedId === id;
  const isHeld = heldId === id;

  return {
    capability,
    isFocused,
    isHeld,
    heldYawOffset: isHeld ? heldYawOffset : 0,
    blockedReason: getPickupBlockedReason(id),
    // предмет визуально "садится" на превью-точку на столе, только пока сам
    // держится И точка валидна — иначе (не держим, либо точка красная/её нет)
    // остаётся у руки, как в Stage S-1
    placementTarget: isHeld ? placementCandidate : null,
    pointerHandlers: capability
      ? {
          onPointerOver: () => setFocused(id),
          onPointerOut: () => clearFocused(id),
        }
      : undefined,
  };
}
