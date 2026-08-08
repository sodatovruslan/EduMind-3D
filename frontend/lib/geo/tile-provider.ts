import { tileKey, type TileId } from "./tiling";

// Данные тайла. G2 намеренно генерирует их локально (цвет + подпись), но
// контракт (Promise<TileData>, отмена через AbortSignal) рассчитан на то,
// что G3+ подставит сюда реального провайдера (растровая текстура/URL),
// не меняя ни TileEngine, ни LOD-логику, ни рендер-слой — только реализацию
// requestTile().
export interface TileData {
  color: string;
  label: string;
}

export interface TileProvider {
  /**
   * Запрашивает данные тайла. signal.aborted === true — результат больше не
   * нужен (тайл вышел из желаемого набора/вытеснен из кэша); провайдер
   * обязан как минимум игнорировать/не применять результат после отмены,
   * не обязательно физически прерывать уже начатую работу.
   */
  requestTile(id: TileId, signal: AbortSignal): Promise<TileData>;
}

const PALETTE = ["#38bdf8", "#a78bfa", "#34d399", "#fbbf24", "#f87171", "#60a5fa", "#f472b6", "#4ade80"];

// Детерминированный хэш строки — НЕ Math.random(), чтобы одна и та же
// плитка всегда получала одну и ту же задержку/цвет в тестах и при повторных
// ручных проверках, вместо "плавающего" от запуска к запуску результата.
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export interface DebugTileProviderOptions {
  minDelayMs?: number;
  maxDelayMs?: number;
}

/**
 * Провайдер-заглушка для G2. Имитирует РЕАЛЬНУЮ асинхронную сетевую загрузку
 * (детерминированная задержка вместо Math.random(), честная отмена через
 * AbortSignal) — та же самая архитектура выдержит реального провайдера в
 * G3+, не только выглядит асинхронной для отвода глаз.
 */
export class DebugTileProvider implements TileProvider {
  private readonly minDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(options: DebugTileProviderOptions = {}) {
    this.minDelayMs = options.minDelayMs ?? 40;
    this.maxDelayMs = options.maxDelayMs ?? 220;
  }

  requestTile(id: TileId, signal: AbortSignal): Promise<TileData> {
    const key = tileKey(id);
    const h = hashString(key);
    const span = Math.max(1, this.maxDelayMs - this.minDelayMs);
    const delay = this.minDelayMs + (h % span);

    return new Promise<TileData>((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException("Tile request aborted", "AbortError"));
        return;
      }
      const timer = setTimeout(() => {
        resolve({ color: PALETTE[h % PALETTE.length], label: key });
      }, delay);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new DOMException("Tile request aborted", "AbortError"));
        },
        { once: true }
      );
    });
  }
}
