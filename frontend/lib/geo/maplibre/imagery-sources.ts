// G6.10 — вынесено из /geoworld-maplibre-spike (G6.8/G6.9). Provider
// конфигурация, лицензионные ограничения и HLS date-resolution — та же
// логика, эмпирически проверенная (curl/WMTSCapabilities/официальные
// Terms), см. GEOWORLD_ROADMAP.md разделы G6.8/G6.9 за полным разбором.
import { lngLatToTileXY } from "./tile-math";

export const GIBS_URL =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg";
export const GIBS_ATTRIBUTION = "Imagery: NASA GIBS / Blue Marble Next Generation (public domain)";

export const HLS_TILE_TEMPLATE =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/HLS_S30_Nadir_BRDF_Adjusted_Reflectance/default/{date}/GoogleMapsCompatible_Level12/{z}/{y}/{x}.png";
export const HLS_ATTRIBUTION = "Imagery: NASA GIBS / HLS Sentinel-2 (~30m/px, public domain, no key)";

// ВАЖНО (найдено headless-тестом в G6.8, реальный баг, не гипотеза):
// `GoogleMapsCompatible_Level8` — потолок тайловой сетки BlueMarble,
// буквально 8 уровней (z0-8). Запрос z9 — невалидный TileMatrix, GIBS
// отвечает HTTP 400 (не 404). MapLibre сам умеет "overzoom" за счёт
// source-`maxzoom`, лишний трафик/невалидные запросы для этого не нужны.
export const BLUEMARBLE_MAX_ZOOM = 8;

// server.arcgisonline.com — БЕЗ ключа, CORS открыт (curl-подтверждено,
// G6.8), НО Esri Master Agreement прямо запрещает production-использование
// без ArcGIS Online/Enterprise-подписки — ЮРИДИЧЕСКИЙ конфликт для
// стороннего коммерческого EdTech-продукта. Только eval/comparison-слой,
// НИКОГДА production dependency (прямое указание G6.10 §16).
export const ESRI_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const ESRI_ATTRIBUTION =
  "Imagery: Esri World Imagery — EVALUATION ONLY (Esri Master Agreement disallows production use outside an ArcGIS subscription)";
export const ESRI_MIN_ZOOM = 6;
export const ESRI_MAX_ZOOM = 19;

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// Тайл-представитель около Душанбе — главный acceptance-регион задания.
const HLS_PROBE_Z = 8;
const HLS_PROBE_TILE = lngLatToTileXY(68.773879, 38.560035, HLS_PROBE_Z);

/**
 * HLS — композит по КОНКРЕТНЫМ датам, не непрерывный ежедневный охват
 * (спутник пролетает не каждый день + облачность). Пробуем несколько
 * последних дней ПАРАЛЛЕЛЬНО, берём самую свежую дату с реальным
 * попаданием (HTTP 200). Если ни одна не сработала за `maxDaysBack`
 * попыток — возвращаем `null`, вызывающий код честно пропускает этот tier.
 */
export async function resolveHlsDate(maxDaysBack = 8, timeoutMs = 7000): Promise<string | null> {
  const candidates = Array.from({ length: maxDaysBack }, (_, i) => isoDateDaysAgo(i));
  const results = await Promise.allSettled(
    candidates.map(async (date) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const url = HLS_TILE_TEMPLATE.replace("{date}", date)
          .replace("{z}", String(HLS_PROBE_Z))
          .replace("{y}", String(HLS_PROBE_TILE.y))
          .replace("{x}", String(HLS_PROBE_TILE.x));
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return date;
      } finally {
        clearTimeout(timer);
      }
    })
  );
  const working = results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
    .map((r) => r.value)
    .sort()
    .reverse();
  return working[0] ?? null;
}

// G6.9 §17 — HLS date-discovery делает до 8 параллельных пробных запросов
// при КАЖДОЙ загрузке страницы (~7с на попытку, если не попадает точно).
// Кэшируем резолвленную дату в `localStorage` с TTL — повторный визит в
// течение TTL пропускает пробник целиком. TTL сознательно короткий (2
// часа, не "навсегда"), т.к. HLS-даты по своей природе меняются (требование
// §17 "данные не должны тихо устаревать навсегда").
const HLS_CACHE_KEY = "geoworld-maplibre-hls-date-cache-v1";
const HLS_CACHE_TTL_MS = 2 * 60 * 60 * 1000;

export function getCachedHlsDate(): string | null {
  try {
    const raw = localStorage.getItem(HLS_CACHE_KEY);
    if (!raw) return null;
    const { date, cachedAt } = JSON.parse(raw) as { date: string; cachedAt: number };
    if (Date.now() - cachedAt > HLS_CACHE_TTL_MS) return null;
    return date;
  } catch {
    return null;
  }
}

export function setCachedHlsDate(date: string): void {
  try {
    localStorage.setItem(HLS_CACHE_KEY, JSON.stringify({ date, cachedAt: Date.now() }));
  } catch {
    // localStorage недоступен (приватный режим и т.п.) — не критично, просто нет кэша.
  }
}
