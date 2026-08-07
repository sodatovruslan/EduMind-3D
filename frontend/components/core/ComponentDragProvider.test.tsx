// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import * as THREE from "three";
import { ComponentDragProvider, useComponentDrag, COMPONENT_DRAG_BOUNDS } from "./ComponentDragProvider";

/**
 * Post-S9.9 acceptance fix — component repositioning. Separate state
 * machine from WireDragProvider.tsx (wire dragging starts/ends on
 * terminals; component dragging starts on a component body and ends
 * anywhere on the table) — tested independently, same idiom as
 * WireDragProvider.test.tsx.
 */

afterEach(cleanup);

function wrapperFor(onMove: (id: string, position: [number, number, number]) => void) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <ComponentDragProvider onMove={onMove}>{children}</ComponentDragProvider>;
  };
}

describe("ComponentDragProvider — старт/движение/коммит жеста", () => {
  it("startDrag фиксирует draggingComponentId и берёт previewPosition из текущей позиции", () => {
    const onMove = vi.fn();
    const { result } = renderHook(() => useComponentDrag(), { wrapper: wrapperFor(onMove) });

    act(() => result.current.startDrag("battery", [-3.2, 0.28, 0]));

    expect(result.current.draggingComponentId).toBe("battery");
    expect(result.current.previewPosition).toEqual([-3.2, 0.28, 0]);
  });

  it("updatePreviewPosition двигает XZ, но НИКОГДА не меняет Y (компонент не проваливается сквозь стол и не взлетает)", () => {
    const onMove = vi.fn();
    const { result } = renderHook(() => useComponentDrag(), { wrapper: wrapperFor(onMove) });

    act(() => result.current.startDrag("battery", [-3.2, 0.28, 0]));
    act(() => result.current.updatePreviewPosition(new THREE.Vector3(1, 999, 2)));

    expect(result.current.previewPosition).toEqual([1, 0.28, 2]); // Y осталась исходной, несмотря на point.y=999
  });

  it("updatePreviewPosition ограничивает X/Z разумными границами стола", () => {
    const onMove = vi.fn();
    const { result } = renderHook(() => useComponentDrag(), { wrapper: wrapperFor(onMove) });

    act(() => result.current.startDrag("battery", [0, 0.28, 0]));
    act(() => result.current.updatePreviewPosition(new THREE.Vector3(999, 0, -999)));

    expect(result.current.previewPosition![0]).toBe(COMPONENT_DRAG_BOUNDS.maxX);
    expect(result.current.previewPosition![2]).toBe(COMPONENT_DRAG_BOUNDS.minZ);
  });

  it("commitDrag после реального перемещения вызывает onMove с итоговой позицией и сбрасывает состояние", () => {
    const onMove = vi.fn();
    const { result } = renderHook(() => useComponentDrag(), { wrapper: wrapperFor(onMove) });

    act(() => result.current.startDrag("battery", [-3.2, 0.28, 0]));
    act(() => result.current.updatePreviewPosition(new THREE.Vector3(1, 0, 1)));
    act(() => result.current.commitDrag());

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith("battery", [1, 0.28, 1]);
    expect(result.current.draggingComponentId).toBeNull();
    expect(result.current.previewPosition).toBeNull();
  });

  it("commitDrag без реального движения (обычный клик) НЕ вызывает onMove — не спамит домен ложными перемещениями", () => {
    const onMove = vi.fn();
    const { result } = renderHook(() => useComponentDrag(), { wrapper: wrapperFor(onMove) });

    act(() => result.current.startDrag("switch", [1.9, 0.1, 0]));
    // пренебрежимо малое движение мыши — меньше порога
    act(() => result.current.updatePreviewPosition(new THREE.Vector3(1.9001, 0.1, 0.0001)));
    act(() => result.current.commitDrag());

    expect(onMove).not.toHaveBeenCalled();
  });

  it("consumeJustDragged возвращает true ровно один раз сразу после реального перемещения, затем false", () => {
    const onMove = vi.fn();
    const { result } = renderHook(() => useComponentDrag(), { wrapper: wrapperFor(onMove) });

    act(() => result.current.startDrag("switch", [1.9, 0.1, 0]));
    act(() => result.current.updatePreviewPosition(new THREE.Vector3(3, 0.1, 0)));
    act(() => result.current.commitDrag());

    expect(result.current.consumeJustDragged("switch")).toBe(true);
    expect(result.current.consumeJustDragged("switch")).toBe(false); // повторный вызов — уже потреблено
  });

  it("consumeJustDragged остаётся false для обычного клика без движения (Switch продолжает переключаться кликом)", () => {
    const onMove = vi.fn();
    const { result } = renderHook(() => useComponentDrag(), { wrapper: wrapperFor(onMove) });

    act(() => result.current.startDrag("switch", [1.9, 0.1, 0]));
    act(() => result.current.commitDrag()); // без updatePreviewPosition вообще — чистый клик

    expect(result.current.consumeJustDragged("switch")).toBe(false);
  });
});

describe("ComponentDragProvider — восстановление (тот же принцип, что и WireDragProvider)", () => {
  it("cancelDrag() сбрасывает состояние и НЕ вызывает onMove — компонент остаётся на исходном месте", () => {
    const onMove = vi.fn();
    const { result } = renderHook(() => useComponentDrag(), { wrapper: wrapperFor(onMove) });

    act(() => result.current.startDrag("battery", [-3.2, 0.28, 0]));
    act(() => result.current.updatePreviewPosition(new THREE.Vector3(2, 0, 2)));
    act(() => result.current.cancelDrag());

    expect(result.current.draggingComponentId).toBeNull();
    expect(result.current.previewPosition).toBeNull();
    expect(onMove).not.toHaveBeenCalled();
  });

  it("клавиша Escape во время активного перемещения отменяет его без вызова onMove", () => {
    const onMove = vi.fn();
    const { result } = renderHook(() => useComponentDrag(), { wrapper: wrapperFor(onMove) });

    act(() => result.current.startDrag("battery", [-3.2, 0.28, 0]));
    act(() => result.current.updatePreviewPosition(new THREE.Vector3(2, 0, 2)));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(result.current.draggingComponentId).toBeNull();
    expect(onMove).not.toHaveBeenCalled();
  });

  it("глобальный pointerup (отпущено вне стола/канваса) ЗАВЕРШАЕТ перемещение (коммит), а не отменяет его", () => {
    const onMove = vi.fn();
    const { result } = renderHook(() => useComponentDrag(), { wrapper: wrapperFor(onMove) });

    act(() => result.current.startDrag("battery", [-3.2, 0.28, 0]));
    act(() => result.current.updatePreviewPosition(new THREE.Vector3(2, 0, 2)));
    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup"));
    });

    expect(onMove).toHaveBeenCalledWith("battery", [2, 0.28, 2]);
    expect(result.current.draggingComponentId).toBeNull();
  });

  it("не оставляет обработчики зарегистрированными после размонтирования (нет утечки слушателей)", () => {
    const onMove = vi.fn();
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useComponentDrag(), { wrapper: wrapperFor(onMove) });

    const adds = addSpy.mock.calls.filter((c) => c[0] === "keydown" || c[0] === "pointerup").length;
    unmount();
    const removes = removeSpy.mock.calls.filter((c) => c[0] === "keydown" || c[0] === "pointerup").length;
    expect(removes).toBe(adds);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
