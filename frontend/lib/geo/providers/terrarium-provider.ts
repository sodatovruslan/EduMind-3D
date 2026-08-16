import type { ElevationProvider, ElevationTileData } from "../elevation-provider";
import type { TileBounds } from "../tiling";
import {
  buildTerrariumTileUrl,
  decodeTerrariumPixel,
  pickTerrariumLevel,
  terrariumTileBounds,
  terrariumTileForLatLng,
} from "./terrarium-grid";

// Полная официальная атрибуция AWS Open Data "Terrain Tiles" (изначально
// Mapzen/Tilezen "Joerd") — датасет собран из НЕСКОЛЬКИХ национальных
// источников, каждый требует упоминания. Источник дословной формулировки:
// https://github.com/tilezen/joerd/blob/master/docs/attribution.md
export const TERRARIUM_ATTRIBUTION =
  "Elevation data: ArcticDEM (DigitalGlobe/NSF), Australia (Geoscience Australia), Austria (offene Daten Österreichs), " +
  "Canada (Open Government Licence), Europe (Copernicus EU-DEM), ETOPO1 (NOAA), Mexico (INEGI), New Zealand (LINZ), " +
  "Norway (Kartverket), United Kingdom (Environment Agency), United States 3DEP/NED, GMTED2010 and SRTM (USGS) — " +
  "via AWS Open Data Terrain Tiles.";

export type PngDecoder = (blob: Blob) => Promise<{ width: number; height: number; pixels: Uint8ClampedArray }>;

// Декодирует PNG в RGBA-пиксели через offscreen-канвас — единственный
// способ прочитать сырые значения пикселей в браузере без сторонней
// библиотеки (createImageBitmap сам по себе не даёт доступа к пикселям).
const defaultDecode: PngDecoder = async (blob) => {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable — cannot decode Terrarium pixel data");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, pixels: data };
};

export interface TerrariumElevationProviderOptions {
  maxLevel?: number;
  fetchImpl?: typeof fetch;
  decode?: PngDecoder;
}

/**
 * Реальный ElevationProvider поверх AWS Open Data "Terrain Tiles"
 * (Terrarium PNG-кодирование, Web Mercator). Полностью изолирован от
 * TileEngine/внутренней geodetic-схемы — принимает и возвращает
 * ГЕОГРАФИЧЕСКИЕ ГРАНИЦЫ, не id какой-либо конкретной адресной схемы (см.
 * elevation-provider.ts).
 */
export class TerrariumElevationProvider implements ElevationProvider {
  private readonly maxLevel: number;
  private readonly fetchImpl: typeof fetch;
  private readonly decode: PngDecoder;

  constructor(options: TerrariumElevationProviderOptions = {}) {
    this.maxLevel = options.maxLevel ?? 10;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.decode = options.decode ?? defaultDecode;
  }

  async requestElevation(bounds: TileBounds, signal: AbortSignal): Promise<ElevationTileData> {
    const lat = (bounds.latMin + bounds.latMax) / 2;
    const lng = (bounds.lngMin + bounds.lngMax) / 2;
    const desiredSpan = Math.max(bounds.lngMax - bounds.lngMin, bounds.latMax - bounds.latMin);
    const level = pickTerrariumLevel(lat, desiredSpan, this.maxLevel);
    const ref = terrariumTileForLatLng(level, lat, lng);
    const url = buildTerrariumTileUrl(ref);

    const response = await this.fetchImpl(url, { signal });
    if (!response.ok) {
      throw new Error(`Terrarium elevation tile request failed: HTTP ${response.status} for ${url}`);
    }
    const blob = await response.blob();
    if (signal.aborted) {
      throw new DOMException("Elevation request aborted", "AbortError");
    }
    const { width, height, pixels } = await this.decode(blob);

    const heights = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const p = i * 4;
      heights[i] = decodeTerrariumPixel(pixels[p], pixels[p + 1], pixels[p + 2]);
    }

    return {
      heights,
      width,
      height,
      bounds: terrariumTileBounds(ref),
      attribution: TERRARIUM_ATTRIBUTION,
    };
  }
}
