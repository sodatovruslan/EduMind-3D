import { tileBounds, tileCenter, type TileId } from "../tiling";
import type { TileData, TileProvider } from "../tile-provider";
import {
  GIBS_MAX_LEVEL,
  buildGibsTileUrl,
  gibsTileBounds,
  gibsTileForLatLng,
  pickGibsLevel,
} from "./gibs-grid";

// Официальная формулировка благодарности NASA GIBS (см. GEOWORLD_ROADMAP.md,
// раздел G3, за источником) — используется дословно, не придумана.
export const GIBS_ATTRIBUTION =
  "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (EOSDIS).";

export type GibsImageDecoder = (blob: Blob) => Promise<ImageBitmap>;

const defaultDecode: GibsImageDecoder = (blob) => createImageBitmap(blob);

export interface GibsTileProviderOptions {
  /** Слой GIBS. По умолчанию BlueMarble_NextGeneration — статичный, без временного измерения, максимально надёжный базовый снимок. */
  layer?: string;
  /** Идентификатор TileMatrixSet, привязанный к слою (см. gibs-grid.ts). */
  tileMatrixSet?: string;
  /** Реальный потолок разрешения провайдера — не выдумываем детализацию сверх этого. */
  maxLevel?: number;
  /** Инъекция для тестов — не бьём по реальной сети в unit-тестах. */
  fetchImpl?: typeof fetch;
  /** Инъекция для тестов — jsdom не умеет декодировать реальные JPEG. */
  decode?: GibsImageDecoder;
}

/**
 * Реальный TileProvider поверх NASA GIBS (EPSG:4326, слой BlueMarble_NextGeneration).
 * Всё специфичное для конкретного провайдера (URL, схема тайлов, формат
 * картинки) живёт СТРОГО здесь — TileEngine/LOD-логика/рендер не знают
 * про GIBS вообще, работают через один и тот же интерфейс TileProvider.
 */
export class GibsTileProvider implements TileProvider {
  private readonly layer: string;
  private readonly tileMatrixSet: string;
  private readonly maxLevel: number;
  private readonly fetchImpl: typeof fetch;
  private readonly decode: GibsImageDecoder;

  constructor(options: GibsTileProviderOptions = {}) {
    this.layer = options.layer ?? "BlueMarble_NextGeneration";
    this.tileMatrixSet = options.tileMatrixSet ?? "500m";
    this.maxLevel = options.maxLevel ?? GIBS_MAX_LEVEL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.decode = options.decode ?? defaultDecode;
  }

  async requestTile(id: TileId, signal: AbortSignal): Promise<TileData> {
    // Наша внутренняя geodetic-квадротрёх НЕ совпадает с сеткой GIBS (см.
    // gibs-grid.ts) — поэтому мы не подставляем id.z/x/y напрямую, а находим,
    // какой РЕАЛЬНЫЙ тайл GIBS покрывает центр нашего внутреннего тайла, на
    // уровне детализации, который не грубее (и не сильно мельче) желаемого.
    const bounds = tileBounds(id);
    const center = tileCenter(id);
    const desiredSpan = Math.max(bounds.lngMax - bounds.lngMin, bounds.latMax - bounds.latMin);
    const level = pickGibsLevel(desiredSpan, this.maxLevel);
    const ref = gibsTileForLatLng(level, center.lat, center.lng);
    const url = buildGibsTileUrl(this.layer, this.tileMatrixSet, ref, "jpeg");

    const response = await this.fetchImpl(url, { signal });
    if (!response.ok) {
      // Детерминированная, конкретная ошибка — не проглатываем, TileEngine
      // переведёт запись в статус "error", видимый в debug-счётчиках.
      throw new Error(`GIBS tile request failed: HTTP ${response.status} for ${url}`);
    }
    const blob = await response.blob();
    if (signal.aborted) {
      throw new DOMException("Tile request aborted", "AbortError");
    }
    const image = await this.decode(blob);

    return {
      image,
      // РЕАЛЬНЫЕ границы полученного тайла GIBS — могут не совпадать один
      // в один с tileBounds(id) нашей схемы; рендер обязан использовать
      // именно это поле для геометрии (см. tile-provider.ts, TileData.bounds).
      bounds: gibsTileBounds(ref),
      attribution: GIBS_ATTRIBUTION,
      dispose: () => image.close(),
    };
  }
}
