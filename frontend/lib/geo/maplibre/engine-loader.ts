// G6.10 — вынесено из /geoworld-maplibre-spike (G6.9). Self-hosted движок
// первым (реальный root cause медленной cold-load — unpkg.com CDN давал
// 14.5-24.7с на ~1МБ файл в измеренной среде, см. GEOWORLD_ROADMAP.md G6.9),
// CDN — честный runtime-fallback, если статика почему-то недоступна.

export const MAPLIBRE_VERSION = "5.24.0";
export const MAPLIBRE_JS_LOCAL = `/vendor/maplibre-gl-${MAPLIBRE_VERSION}/maplibre-gl.js`;
export const MAPLIBRE_CSS_LOCAL = `/vendor/maplibre-gl-${MAPLIBRE_VERSION}/maplibre-gl.css`;
export const MAPLIBRE_JS_CDN = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`;
export const MAPLIBRE_CSS_CDN = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;

declare global {
  interface Window {
    maplibregl?: any;
  }
}

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if ((existing as HTMLScriptElement).dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve());
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

export function loadStylesheetOnce(href: string, fallbackHref?: string): void {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  if (fallbackHref) {
    link.onerror = () => {
      link.onerror = null;
      link.href = fallbackHref;
    };
  }
  document.head.appendChild(link);
}

/** Локальный файл первым, CDN как честный fallback — не превращаем "быстрее" в "хрупче". */
export async function loadScriptWithFallback(localSrc: string, cdnSrc: string): Promise<"local" | "cdn"> {
  try {
    await loadScriptOnce(localSrc);
    return "local";
  } catch {
    await loadScriptOnce(cdnSrc);
    return "cdn";
  }
}

export async function loadMapLibreEngine(): Promise<{ maplibregl: any; source: "local" | "cdn" }> {
  loadStylesheetOnce(MAPLIBRE_CSS_LOCAL, MAPLIBRE_CSS_CDN);
  const source = await loadScriptWithFallback(MAPLIBRE_JS_LOCAL, MAPLIBRE_JS_CDN);
  const maplibregl = window.maplibregl;
  if (!maplibregl) throw new Error("window.maplibregl не появился после загрузки скрипта");
  return { maplibregl, source };
}
