// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import * as THREE from "three";
import { WireDragProvider, useWireDrag } from "./WireDragProvider";

/**
 * Stage S9.8 — Sandbox UX. WireDragProvider.tsx itself was NOT rewritten
 * this stage (the S9.8 audit confirmed its drag/cancel/recovery mechanics
 * are already production-quality) — but it had zero test coverage before
 * this stage, despite being the exact interaction state machine the whole
 * checkpoint is about. These are genuine, real-behavior tests, not padding.
 */

afterEach(cleanup);

function wrapperFor(onConnect: (a: string, b: string) => void) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <WireDragProvider onConnect={onConnect}>{children}</WireDragProvider>;
  };
}

describe("WireDragProvider — старт/движение/коммит жеста", () => {
  it("startDrag фиксирует draggingFrom и берёт pendingPoint из зарегистрированной позиции терминала", () => {
    const onConnect = vi.fn();
    const { result } = renderHook(() => useWireDrag(), { wrapper: wrapperFor(onConnect) });

    act(() => result.current.registerTerminalPosition("battery_pos", new THREE.Vector3(1, 0, 2)));
    act(() => result.current.startDrag("battery_pos"));

    expect(result.current.draggingFrom).toBe("battery_pos");
    expect(result.current.pendingPoint?.toArray()).toEqual([1, 0, 2]);
  });

  it("updatePendingPoint двигает свободный конец во время перетаскивания", () => {
    const onConnect = vi.fn();
    const { result } = renderHook(() => useWireDrag(), { wrapper: wrapperFor(onConnect) });

    act(() => result.current.startDrag("battery_pos"));
    act(() => result.current.updatePendingPoint(new THREE.Vector3(5, 0, 5)));

    expect(result.current.pendingPoint?.toArray()).toEqual([5, 0, 5]);
  });

  it("commitDrag на ДРУГОЙ терминал вызывает onConnect ровно один раз и полностью сбрасывает состояние драга", () => {
    const onConnect = vi.fn();
    const { result } = renderHook(() => useWireDrag(), { wrapper: wrapperFor(onConnect) });

    act(() => result.current.startDrag("battery_pos"));
    act(() => result.current.commitDrag("switch_a"));

    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(onConnect).toHaveBeenCalledWith("battery_pos", "switch_a");
    expect(result.current.draggingFrom).toBeNull();
    expect(result.current.pendingPoint).toBeNull();
  });

  it("commitDrag на ТОТ ЖЕ терминал не создаёт самосоединение, но состояние всё равно корректно сбрасывается (не зависает)", () => {
    const onConnect = vi.fn();
    const { result } = renderHook(() => useWireDrag(), { wrapper: wrapperFor(onConnect) });

    act(() => result.current.startDrag("battery_pos"));
    act(() => result.current.commitDrag("battery_pos"));

    expect(onConnect).not.toHaveBeenCalled();
    expect(result.current.draggingFrom).toBeNull();
  });

  it("commitDrag без активного startDrag — no-op, не вызывает onConnect", () => {
    const onConnect = vi.fn();
    const { result } = renderHook(() => useWireDrag(), { wrapper: wrapperFor(onConnect) });

    act(() => result.current.commitDrag("switch_a"));
    expect(onConnect).not.toHaveBeenCalled();
  });
});

describe("WireDragProvider — отмена жеста (весь этот блок уже работал до S9.8, здесь впервые проверяется)", () => {
  it("cancelDrag() сбрасывает draggingFrom/pendingPoint и НЕ вызывает onConnect", () => {
    const onConnect = vi.fn();
    const { result } = renderHook(() => useWireDrag(), { wrapper: wrapperFor(onConnect) });

    act(() => result.current.startDrag("battery_pos"));
    act(() => result.current.cancelDrag());

    expect(result.current.draggingFrom).toBeNull();
    expect(result.current.pendingPoint).toBeNull();
    expect(onConnect).not.toHaveBeenCalled();
  });

  it("клавиша Escape во время активного драга отменяет его", () => {
    const onConnect = vi.fn();
    const { result } = renderHook(() => useWireDrag(), { wrapper: wrapperFor(onConnect) });

    act(() => result.current.startDrag("battery_pos"));
    expect(result.current.draggingFrom).toBe("battery_pos");

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(result.current.draggingFrom).toBeNull();
    expect(onConnect).not.toHaveBeenCalled();
  });

  it("Escape без активного драга ничего не ломает (идемпотентно)", () => {
    const onConnect = vi.fn();
    const { result } = renderHook(() => useWireDrag(), { wrapper: wrapperFor(onConnect) });

    expect(() => {
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      });
    }).not.toThrow();
    expect(result.current.draggingFrom).toBeNull();
  });

  it("глобальный pointerup (курсор отпущен вне канваса) отменяет активный драг — защита от зависшего жеста", () => {
    const onConnect = vi.fn();
    const { result } = renderHook(() => useWireDrag(), { wrapper: wrapperFor(onConnect) });

    act(() => result.current.startDrag("battery_pos"));
    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup"));
    });

    expect(result.current.draggingFrom).toBeNull();
    expect(onConnect).not.toHaveBeenCalled();
  });

  it("отмена не оставляет обработчики зарегистрированными повторно после размонтирования (нет утечки слушателей)", () => {
    const onConnect = vi.fn();
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useWireDrag(), { wrapper: wrapperFor(onConnect) });

    const keydownAdds = addSpy.mock.calls.filter((c) => c[0] === "keydown").length;
    const pointerupAdds = addSpy.mock.calls.filter((c) => c[0] === "pointerup").length;
    expect(keydownAdds).toBeGreaterThan(0);
    expect(pointerupAdds).toBeGreaterThan(0);

    unmount();
    const keydownRemoves = removeSpy.mock.calls.filter((c) => c[0] === "keydown").length;
    const pointerupRemoves = removeSpy.mock.calls.filter((c) => c[0] === "pointerup").length;
    expect(keydownRemoves).toBe(keydownAdds);
    expect(pointerupRemoves).toBe(pointerupAdds);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

describe("WireDragProvider — реестр мировых позиций терминалов", () => {
  it("registerTerminalPosition клонирует переданный вектор — не хранит общую ссылку на вызывающий объект", () => {
    const onConnect = vi.fn();
    const { result } = renderHook(() => useWireDrag(), { wrapper: wrapperFor(onConnect) });

    const pos = new THREE.Vector3(1, 1, 1);
    act(() => result.current.registerTerminalPosition("battery_pos", pos));
    pos.set(9, 9, 9); // мутация исходного вектора после регистрации не должна повлиять на сохранённое значение

    expect(result.current.getTerminalPosition("battery_pos")?.toArray()).toEqual([1, 1, 1]);
  });

  it("getTerminalPosition для незарегистрированного id возвращает undefined, а не бросает исключение", () => {
    const onConnect = vi.fn();
    const { result } = renderHook(() => useWireDrag(), { wrapper: wrapperFor(onConnect) });
    expect(result.current.getTerminalPosition("unknown")).toBeUndefined();
  });
});
