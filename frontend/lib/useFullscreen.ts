import { useCallback, useEffect, useState, type RefObject } from "react";

/**
 * Shared fullscreen toggle — extracted from Chemistry World's scene-local
 * implementation (the only place this existed before). Fullscreens the
 * given wrapper element (not `document.documentElement` and not the raw
 * `<canvas>`), consistent with how CanvasShell's own `isFullscreen` prop
 * already expects to be driven. Reused as-is by Electricity Lab rather
 * than reimplemented, per explicit instruction to prefer sharing
 * Chemistry's fullscreen implementation over building a second one.
 */
export function useFullscreen(wrapperRef: RefObject<HTMLElement>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!wrapperRef.current) return;
    if (!document.fullscreenElement) {
      wrapperRef.current.requestFullscreen?.().catch((err: unknown) => {
        console.warn("Fullscreen request error:", err);
      });
    } else {
      document.exitFullscreen?.().catch((err: unknown) => {
        console.warn("Exit fullscreen error:", err);
      });
    }
  }, [wrapperRef]);

  return { isFullscreen, toggleFullscreen };
}
