// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { createRef } from "react";
import { useFullscreen } from "./useFullscreen";

/**
 * Immersive interaction acceptance fix — общий fullscreen-хук, вынесенный
 * из Chemistry World's ранее локальной реализации ("Prefer sharing
 * Chemistry's fullscreen implementation over building a second one" —
 * теперь Electricity Lab использует тот же самый хук, не копию).
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function fireFullscreenChange() {
  act(() => {
    document.dispatchEvent(new Event("fullscreenchange"));
  });
}

describe("useFullscreen", () => {
  it("toggleFullscreen вызывает requestFullscreen на переданном wrapper, когда сейчас не fullscreen", () => {
    const el = document.createElement("div");
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(el, "requestFullscreen", { value: requestFullscreen, configurable: true });
    const ref = createRef<HTMLDivElement>();
    (ref as { current: HTMLDivElement }).current = el;

    const { result } = renderHook(() => useFullscreen(ref));
    act(() => result.current.toggleFullscreen());

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it("toggleFullscreen вызывает document.exitFullscreen, когда уже в fullscreen", () => {
    const el = document.createElement("div");
    Object.defineProperty(document, "fullscreenElement", { value: el, configurable: true });
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, "exitFullscreen", { value: exitFullscreen, configurable: true });
    const ref = createRef<HTMLDivElement>();
    (ref as { current: HTMLDivElement }).current = el;

    const { result } = renderHook(() => useFullscreen(ref));
    act(() => result.current.toggleFullscreen());

    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });
  });

  it("isFullscreen следует за событием fullscreenchange (enter/exit) — используется для перерисовки canvas-обёртки без скачка layout", () => {
    const el = document.createElement("div");
    const ref = createRef<HTMLDivElement>();
    (ref as { current: HTMLDivElement }).current = el;
    const { result } = renderHook(() => useFullscreen(ref));

    expect(result.current.isFullscreen).toBe(false);

    Object.defineProperty(document, "fullscreenElement", { value: el, configurable: true });
    fireFullscreenChange();
    expect(result.current.isFullscreen).toBe(true);

    Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });
    fireFullscreenChange();
    expect(result.current.isFullscreen).toBe(false);
  });

  it("снимает слушатель fullscreenchange при размонтировании (нет утечки — не оставляет состояние 'застрявшим' после смены сцены)", () => {
    const el = document.createElement("div");
    const ref = createRef<HTMLDivElement>();
    (ref as { current: HTMLDivElement }).current = el;
    const removeSpy = vi.spyOn(document, "removeEventListener");

    const { unmount } = renderHook(() => useFullscreen(ref));
    unmount();

    expect(removeSpy).toHaveBeenCalledWith("fullscreenchange", expect.any(Function));
  });
});
