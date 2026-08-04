"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  getInteractable,
  type InteractableConfig,
  type InteractableRuntimeState,
  type PlacementSurfaceKind,
} from "@/lib/interactables";
import { getCabinet, type CabinetConfig } from "@/lib/cabinets";
import { observationLogger } from "@/lib/observation-logger";

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
export type FocusedKind = "item" | "cabinet";

export interface PickupOrigin {
  position: [number, number];
  elevation: number;
  rotationY: number;
  storageSlotId: string | null;
}

export interface CabinetRuntimeState {
  isOpen: boolean;
}

export interface PlacementCandidate {
  position: [number, number];
  rotationY: number;
  surface: PlacementSurfaceKind;
  isValid?: boolean;
  reason?: string;
}

interface ChemistryInteractionContextValue {
  phase: InteractionPhase;
  focusedId: string | null;
  focusedKind: FocusedKind | null;
  heldId: string | null;
  heldYawOffset: number;
  heldTiltRad: number;
  qEventCount: number;
  isPourSourceSupported: (id: string | null) => boolean;
  aimPoint: [number, number] | null;
  placementCandidate: PlacementCandidate | null;
  setFocused: (id: string, kind?: FocusedKind) => void;
  clearFocused: (id: string, kind?: FocusedKind) => void;
  pickUp: (id: string) => void;
  release: () => void;
  rotateHeld: (deltaYaw: number) => void;
  setHeldTiltRad: (tilt: number | ((prev: number) => number)) => void;
  setAimPoint: (point: [number, number] | null) => void;
  setPlacementCandidate: (candidate: PlacementCandidate | null) => void;
  confirmPlacement: () => void;
  toggleCap: (id?: string) => void;
  getPickupBlockedReason: (id: string) => string | null;
  getInteractableRuntimeState: (id: string) => InteractableRuntimeState;
  isInteractableAccessible: (id: string) => boolean;
  getCabinetState: (id: string) => CabinetRuntimeState | null;
  canStoreInCabinet: (itemId: string, cabinetId: string) => boolean;
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
  isInteractableAccessible?: (id: string) => boolean;
  onBeginPickup?: (id: string) => void;
  onCancelPickup?: (id: string, origin: PickupOrigin) => void;
  onToggleCabinet?: (id: string) => void;
  onToggleCap?: (id: string) => void;
  getCabinetState?: (id: string) => CabinetRuntimeState | null;
  canStoreInCabinet?: (itemId: string, cabinetId: string) => boolean;
  onStoreInCabinet?: (itemId: string, cabinetId: string) => boolean;
}

export function ChemistryInteractionProvider({
  children,
  onConfirmPlacement,
  getInteractableState,
  isInteractableAccessible,
  onBeginPickup,
  onCancelPickup,
  onToggleCabinet,
  onToggleCap,
  getCabinetState,
  canStoreInCabinet,
  onStoreInCabinet,
}: ChemistryInteractionProviderProps) {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [focusedKind, setFocusedKind] = useState<FocusedKind | null>(null);
  const [heldId, setHeldId] = useState<string | null>(null);
  const [heldYawOffset, setHeldYawOffset] = useState(0);
  const [heldTiltRad, setHeldTiltRad] = useState(0);
  const [aimPoint, setAimPointState] = useState<[number, number] | null>(null);
  const [placementCandidate, setPlacementCandidateState] = useState<PlacementCandidate | null>(null);

  // ref-копии для использования внутри keydown-обработчика без пересоздания
  // слушателя на каждый рендер (тот же прием, что и в ChemistryDragProvider)
  const focusedIdRef = useRef(focusedId);
  focusedIdRef.current = focusedId;
  const focusedKindRef = useRef(focusedKind);
  focusedKindRef.current = focusedKind;
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
  const isInteractableAccessibleRef = useRef(isInteractableAccessible);
  isInteractableAccessibleRef.current = isInteractableAccessible;
  const onBeginPickupRef = useRef(onBeginPickup);
  onBeginPickupRef.current = onBeginPickup;
  const onCancelPickupRef = useRef(onCancelPickup);
  onCancelPickupRef.current = onCancelPickup;
  const onToggleCabinetRef = useRef(onToggleCabinet);
  onToggleCabinetRef.current = onToggleCabinet;
  const getCabinetStateRef = useRef(getCabinetState);
  getCabinetStateRef.current = getCabinetState;
  const canStoreInCabinetRef = useRef(canStoreInCabinet);
  canStoreInCabinetRef.current = canStoreInCabinet;
  const onStoreInCabinetRef = useRef(onStoreInCabinet);
  onStoreInCabinetRef.current = onStoreInCabinet;
  const onToggleCapRef = useRef(onToggleCap);
  onToggleCapRef.current = onToggleCap;
  const pickupOriginRef = useRef<PickupOrigin | null>(null);

  const runtimeStateFor = useCallback(
    (id: string): InteractableRuntimeState => getInteractableStateRef.current?.(id) ?? {},
    []
  );

  const isAccessible = useCallback(
    (id: string): boolean => isInteractableAccessibleRef.current?.(id) ?? true,
    []
  );

  const getPickupBlockedReason = useCallback((id: string) => {
    if (isInteractableAccessibleRef.current?.(id) === false) return null;
    const capability = getInteractable(id);
    if (!capability) return null;
    const runtimeState = runtimeStateFor(id);
    return capability.canPickUpNow(runtimeState) ? null : capability.blockedReason(runtimeState);
  }, [runtimeStateFor]);

  const setFocused = useCallback((id: string, kind: FocusedKind = "item") => {
    // нельзя сфокусироваться на новом предмете, пока один уже в руке —
    // однопредметная модель "одна рука". Шкаф остаётся доступен для возврата.
    if (heldIdRef.current && kind === "item") return;
    setFocusedId(id);
    setFocusedKind(kind);
  }, []);

  const clearFocused = useCallback((id: string, kind?: FocusedKind) => {
    // снимаем фокус, только если он реально принадлежит этому id — защита
    // от гонки onPointerOut/onPointerOver при быстром переходе между
    // соседними предметами
    if (focusedIdRef.current !== id) return;
    if (kind && focusedKindRef.current !== kind) return;
    setFocusedId(null);
    setFocusedKind(null);
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
    if (isInteractableAccessibleRef.current?.(id) === false) return;
    const capability = getInteractable(id);
    if (!capability || !capability.canBeHeld) return; // нет способности — no-op
    const runtimeState = runtimeStateFor(id);
    if (!capability.canPickUpNow(runtimeState)) return;
    pickupOriginRef.current =
      runtimeState.position && runtimeState.elevation !== undefined
        ? {
            position: [...runtimeState.position],
            elevation: runtimeState.elevation,
            rotationY: runtimeState.rotationY ?? 0,
            storageSlotId: runtimeState.storageSlotId ?? null,
          }
        : null;
    onBeginPickupRef.current?.(id);
    setHeldId(id);
    setHeldYawOffset(runtimeState.rotationY ?? 0);
    setHeldTiltRad(0);
    setAimPointState(null);
    placementCandidateRef.current = null;
    setPlacementCandidateState(null);

    observationLogger.appendEvent("item_picked_up", "interaction", {
      objectId: id,
      objectKind: capability.storageKind ?? "item",
      fromStorageSlotId: runtimeState.storageSlotId ?? null,
    });
  }, [runtimeStateFor]);

  const release = useCallback(() => {
    const id = heldIdRef.current;
    const origin = pickupOriginRef.current;
    if (id && origin?.storageSlotId) {
      onCancelPickupRef.current?.(id, origin);
      observationLogger.appendEvent("pickup_cancelled", "interaction", {
        objectId: id,
        reason: "released_to_slot",
      });
    }
    if (heldTiltRad > 0 && id) {
      observationLogger.appendEvent("bottle_uprighted", "interaction", { objectId: id });
    }
    pickupOriginRef.current = null;
    setHeldId(null);
    setHeldYawOffset(0);
    setHeldTiltRad(0);
    setAimPointState(null);
    placementCandidateRef.current = null;
    setPlacementCandidateState(null);
  }, [heldTiltRad]);

  const confirmPlacement = useCallback(() => {
    const id = heldIdRef.current;
    const candidate = placementCandidateRef.current;
    if (!id || !candidate) return; // нечего подтверждать — предмет остаётся в руке
    const capability = getInteractable(id);
    if (!capability?.canBePlaced || !capability.allowedSurfaces.includes(candidate.surface)) return;
    onConfirmPlacementRef.current?.(id, candidate.position, candidate.rotationY);

    observationLogger.appendEvent("item_placed", "interaction", {
      objectId: id,
      objectKind: capability.storageKind ?? "item",
      surface: candidate.surface,
      position: candidate.position,
    });

    if (heldTiltRad > 0) {
      observationLogger.appendEvent("bottle_uprighted", "interaction", { objectId: id });
    }
    pickupOriginRef.current = null;
    setHeldId(null);
    setHeldYawOffset(0);
    setHeldTiltRad(0);
    setAimPointState(null);
    placementCandidateRef.current = null;
    setPlacementCandidateState(null);
  }, [heldTiltRad]);

  const cabinetStateFor = useCallback(
    (id: string): CabinetRuntimeState | null => getCabinetStateRef.current?.(id) ?? null,
    []
  );

  const canStoreHeldInCabinet = useCallback(
    (itemId: string, cabinetId: string): boolean =>
      cabinetStateFor(cabinetId)?.isOpen === true &&
      (canStoreInCabinetRef.current?.(itemId, cabinetId) ?? false),
    [cabinetStateFor]
  );

  const tryStoreHeldInFocusedCabinet = useCallback((): boolean => {
    const itemId = heldIdRef.current;
    const cabinetId = focusedKindRef.current === "cabinet" ? focusedIdRef.current : null;
    if (!itemId || !cabinetId || !canStoreHeldInCabinet(itemId, cabinetId)) return false;
    if (onStoreInCabinetRef.current?.(itemId, cabinetId) !== true) return false;
    pickupOriginRef.current = null;
    setHeldId(null);
    setHeldYawOffset(0);
    setHeldTiltRad(0);
    setAimPointState(null);
    placementCandidateRef.current = null;
    setPlacementCandidateState(null);
    return true;
  }, [canStoreHeldInCabinet]);

  const rotateHeld = useCallback((deltaYaw: number) => {
    if (!heldIdRef.current) return; // нечего вращать — no-op
    setHeldYawOffset((y) => y + deltaYaw);
  }, []);

  const toggleCap = useCallback((targetId?: string) => {
    const id =
      targetId ??
      (heldIdRef.current || (focusedKindRef.current === "item" ? focusedIdRef.current : null));
    if (!id) return;
    const capability = getInteractable(id);
    if (capability?.storageKind?.startsWith("stock_")) {
      onToggleCapRef.current?.(id);
    }
  }, []);

  const [qEventCount, setQEventCount] = useState(0);

  const isPourSourceSupported = useCallback((id: string | null): boolean => {
    if (!id) return false;
    const capability = getInteractable(id);
    if (!capability) return false;
    return (
      Boolean(capability.storageKind?.startsWith("stock_")) ||
      capability.legacyDragMode === "pour" ||
      id.startsWith("stock-") ||
      id.startsWith("beaker") ||
      id.startsWith("flask") ||
      id.startsWith("test-tube")
    );
  }, []);

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.repeat) return;
      if (isTypingTarget(e.target)) return;

      if (e.key === "e" || e.key === "E" || e.code === "KeyE") {
        if (heldIdRef.current) {
          if (!tryStoreHeldInFocusedCabinet()) confirmPlacement();
        } else if (focusedIdRef.current && focusedKindRef.current === "cabinet") {
          onToggleCabinetRef.current?.(focusedIdRef.current);
        } else if (focusedIdRef.current && focusedKindRef.current === "item") {
          pickUp(focusedIdRef.current);
        }
      } else if (e.key === "r" || e.key === "R" || e.code === "KeyR") {
        toggleCap();
      } else if (e.key === "q" || e.key === "Q" || e.code === "KeyQ") {
        const heldId = heldIdRef.current;
        if (heldId && isPourSourceSupported(heldId)) {
          setQEventCount((c) => c + 1);
          setHeldTiltRad((t) => (t > 0 ? 0 : Math.PI / 3));
        }
      } else if (e.key === "Escape") {
        if (typeof document !== "undefined" && document.fullscreenElement) return;
        if (heldIdRef.current) release();
      } else if (e.key === "ArrowLeft") {
        rotateHeld(-ROTATE_STEP);
      } else if (e.key === "ArrowRight") {
        rotateHeld(ROTATE_STEP);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pickUp, release, rotateHeld, confirmPlacement, tryStoreHeldInFocusedCabinet, toggleCap, isPourSourceSupported]);

  const value: ChemistryInteractionContextValue = {
    phase: heldId ? "held" : focusedId ? "focused" : "idle",
    focusedId,
    focusedKind,
    heldId,
    heldYawOffset,
    heldTiltRad,
    qEventCount,
    isPourSourceSupported,
    aimPoint,
    placementCandidate,
    setFocused,
    clearFocused,
    pickUp,
    release,
    rotateHeld,
    setHeldTiltRad,
    setAimPoint,
    setPlacementCandidate,
    confirmPlacement,
    toggleCap,
    getPickupBlockedReason,
    getInteractableRuntimeState: runtimeStateFor,
    isInteractableAccessible: isAccessible,
    getCabinetState: cabinetStateFor,
    canStoreInCabinet: canStoreHeldInCabinet,
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
    focusedKind,
    heldId,
    heldYawOffset,
    heldTiltRad,
    placementCandidate,
    setFocused,
    clearFocused,
    getPickupBlockedReason,
    getInteractableRuntimeState,
    isInteractableAccessible,
  } = useChemistryInteraction();
  const registeredCapability = getInteractable(id);
  const runtimeState = getInteractableRuntimeState(id);
  const accessible = isInteractableAccessible(id);
  const capability: InteractableConfig | null = accessible ? registeredCapability : null;
  const isFocused = focusedKind === "item" && focusedId === id;
  const isHeld = heldId === id;

  return {
    capability,
    registeredCapability,
    isAccessible: accessible,
    isFocused,
    isHeld,
    heldYawOffset: isHeld ? heldYawOffset : 0,
    heldTiltRad: isHeld ? heldTiltRad : 0,
    blockedReason: accessible ? getPickupBlockedReason(id) : null,
    canUseLegacyDrag:
      Boolean(capability && capability.legacyDragMode !== "none") && runtimeState.storageSlotId == null,
    // предмет визуально "садится" на превью-точку на столе, только пока сам
    // держится И точка валидна — иначе (не держим, либо точка красная/её нет)
    // остаётся у руки, как в Stage S-1
    placementTarget: isHeld ? placementCandidate : null,
    pointerHandlers: capability
      ? {
          onPointerOver: () => setFocused(id, "item"),
          onPointerOut: () => clearFocused(id, "item"),
        }
      : undefined,
  };
}

export function useCabinetInteractable(id: string) {
  const {
    focusedId,
    focusedKind,
    heldId,
    setFocused,
    clearFocused,
    getCabinetState,
    canStoreInCabinet,
  } = useChemistryInteraction();
  const config: CabinetConfig | null = getCabinet(id);
  const state = config ? getCabinetState(id) : null;
  return {
    config,
    state,
    isFocused: focusedKind === "cabinet" && focusedId === id,
    canStoreHeldItem: heldId ? canStoreInCabinet(heldId, id) : false,
    pointerHandlers: config
      ? {
          onPointerOver: () => setFocused(id, "cabinet"),
          onPointerOut: () => clearFocused(id, "cabinet"),
        }
      : undefined,
  };
}
