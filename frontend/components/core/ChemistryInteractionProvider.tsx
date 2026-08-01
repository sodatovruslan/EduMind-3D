"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getInteractable, type InteractableConfig } from "@/lib/interactables";

/**
 * Chemistry World — Interaction Core, Stage S-1 (Focus & Pickup).
 * Отдельное, эфемерное состояние наведения/удержания — то же разделение,
 * что ChemistryDragProvider/WireDragProvider: interaction state отдельно от
 * домена (ChemistryWorkspaceProvider). НЕ заменяет ChemistryDragProvider —
 * сосуществует рядом; предметы без записи в INTERACTABLE_REGISTRY (lib/interactables.ts)
 * продолжают управляться старым drag-механизмом без единого изменения.
 *
 * Ключевое свойство Stage S-1: пока предмет держат (heldId !== null), в
 * ChemistryWorkspaceProvider не диспетчится ни одно действие — визуальный
 * "полет к руке" (HeldObjectRig в ChemistryWorldScene.tsx) и поворот в руке
 * (heldYawOffset) полностью локальны для этого провайдера и бесследно
 * исчезают при release() — домен (позиция/химия предмета) все это время
 * остается нетронутым.
 */
export type InteractionPhase = "idle" | "focused" | "held";

interface ChemistryInteractionContextValue {
  phase: InteractionPhase;
  focusedId: string | null;
  heldId: string | null;
  heldYawOffset: number;
  setFocused: (id: string) => void;
  clearFocused: (id: string) => void;
  pickUp: (id: string) => void;
  release: () => void;
  rotateHeld: (deltaYaw: number) => void;
}

const ChemistryInteractionContext = createContext<ChemistryInteractionContextValue | undefined>(undefined);

// 15° за нажатие — мельче, чем шаг 45° старого ROTATE_ITEM в
// ChemistryWorkspaceProvider, потому что вращение в руке ручное/визуальное,
// не дискретный снап
const ROTATE_STEP = Math.PI / 12;

export function ChemistryInteractionProvider({ children }: { children: React.ReactNode }) {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [heldId, setHeldId] = useState<string | null>(null);
  const [heldYawOffset, setHeldYawOffset] = useState(0);

  // ref-копии для использования внутри keydown-обработчика без пересоздания
  // слушателя на каждый рендер (тот же прием, что и в ChemistryDragProvider)
  const focusedIdRef = useRef(focusedId);
  focusedIdRef.current = focusedId;
  const heldIdRef = useRef(heldId);
  heldIdRef.current = heldId;

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

  const pickUp = useCallback((id: string) => {
    if (heldIdRef.current) return; // уже держим другой предмет — no-op
    const capability = getInteractable(id);
    if (!capability || !capability.canBeHeld) return; // нет способности — no-op
    setHeldId(id);
    setHeldYawOffset(0);
  }, []);

  const release = useCallback(() => {
    setHeldId(null);
    setHeldYawOffset(0);
  }, []);

  const rotateHeld = useCallback((deltaYaw: number) => {
    if (!heldIdRef.current) return; // нечего вращать — no-op
    setHeldYawOffset((y) => y + deltaYaw);
  }, []);

  // Клавиатура: E — взять/отпустить (toggle), Escape — безопасно отпустить,
  // ArrowLeft/ArrowRight — вращение в руке. Не реагирует, пока пользователь
  // печатает в любом текстовом поле (AI Teacher chat и т.п.), и игнорирует
  // авто-повтор ОС при зажатой клавише (e.repeat) — без этого зажатая E
  // бесконтрольно чередовала бы pickUp/release много раз в секунду.
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
          release();
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
  }, [pickUp, release, rotateHeld]);

  const value: ChemistryInteractionContextValue = {
    phase: heldId ? "held" : focusedId ? "focused" : "idle",
    focusedId,
    heldId,
    heldYawOffset,
    setFocused,
    clearFocused,
    pickUp,
    release,
    rotateHeld,
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
  const { focusedId, heldId, heldYawOffset, setFocused, clearFocused } = useChemistryInteraction();
  const capability: InteractableConfig | null = getInteractable(id);
  const isFocused = focusedId === id;
  const isHeld = heldId === id;

  return {
    capability,
    isFocused,
    isHeld,
    heldYawOffset: isHeld ? heldYawOffset : 0,
    pointerHandlers: capability
      ? {
          onPointerOver: () => setFocused(id),
          onPointerOut: () => clearFocused(id),
        }
      : undefined,
  };
}
