// NOAA/NCEI Global Significant Volcanic Eruptions Database — общественное
// достояние (US government work), подтверждено эмпирически: реальный GET
// с Origin-заголовком → access-control-allow-origin: *. Эндпоинт —
// СОБЫТИЯ извержений (не голый список вулканов), пагинация по 200/страницу
// (itemsPerPage=1000 отклоняется сервером HTTP 400 — проверено при
// исследовании, 200 — рабочий потолок). Один вулкан может иметь несколько
// исторических извержений — dedupeVolcanoes оставляет по одной,
// представительной (самое позднее известное) записи на вулкан.
export const VOLCANOES_ATTRIBUTION =
  "Volcano data: NOAA National Centers for Environmental Information (NCEI) — Global Significant Volcanic Eruptions Database (public domain)";

const API_BASE = "https://www.ngdc.noaa.gov/hazel/hazard-service/api/v1/volcanoes";
const ITEMS_PER_PAGE = 200;
// Жёсткая защита от неограниченной пагинации — сейчас датасет отдаёт 5
// страниц (~900 записей), 10 — разумный запас, не бесконечный цикл, если
// сервер когда-нибудь станет отдавать намного больше.
const MAX_PAGES = 10;

export interface VolcanoApiRecord {
  volcanoLocationId: number;
  year: number | null;
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  elevation: number | null;
  morphology: string | null;
  deathsTotal: number | null;
}

interface VolcanoApiPage {
  items: VolcanoApiRecord[];
  page: number;
  totalPages: number;
}

export interface VolcanoRecord {
  id: number;
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  elevation: number | null;
  morphology: string | null;
  lastEruptionYear: number | null;
  deathsTotal: number | null;
}

/** Оставляет по одной записи на реальный вулкан — самое позднее известное значимое извержение как представительная запись. */
export function dedupeVolcanoes(records: VolcanoApiRecord[]): VolcanoRecord[] {
  const byLocation = new Map<number, VolcanoApiRecord>();
  for (const record of records) {
    const existing = byLocation.get(record.volcanoLocationId);
    if (!existing || (record.year ?? -Infinity) > (existing.year ?? -Infinity)) {
      byLocation.set(record.volcanoLocationId, record);
    }
  }
  return Array.from(byLocation.values()).map((r) => ({
    id: r.volcanoLocationId,
    name: r.name,
    country: r.country,
    latitude: r.latitude,
    longitude: r.longitude,
    elevation: r.elevation,
    morphology: r.morphology,
    lastEruptionYear: r.year,
    deathsTotal: r.deathsTotal,
  }));
}

/**
 * Пагинированная загрузка + дедуп + кэш-навсегда + дедупликация
 * параллельных вызовов — та же идея, что VectorDatasetLoader (G5), но
 * оформлена отдельным классом: тут несколько HTTP-запросов на один
 * логический "load()", а не один запрос по ключу.
 */
export class VolcanoProvider {
  private cached: VolcanoRecord[] | null = null;
  private inFlight: Promise<VolcanoRecord[]> | null = null;
  private controller: AbortController | null = null;
  private readonly fetchImpl: typeof fetch;

  constructor(fetchImpl?: typeof fetch) {
    // The browser's fetch must be called with `this` being the window:
    // stored on an object and called as `this.fetchImpl(...)` it rejects with
    // "Illegal invocation" and no request is ever sent — hence the wrapper.
    this.fetchImpl = fetchImpl ?? ((input, init) => fetch(input, init));
  }

  load(): Promise<VolcanoRecord[]> {
    if (this.cached) return Promise.resolve(this.cached);
    if (this.inFlight) return this.inFlight;

    this.controller = new AbortController();
    const signal = this.controller.signal;

    this.inFlight = (async () => {
      const all: VolcanoApiRecord[] = [];
      let page = 1;
      let totalPages = 1;
      while (page <= totalPages && page <= MAX_PAGES) {
        const response = await this.fetchImpl(`${API_BASE}?page=${page}&itemsPerPage=${ITEMS_PER_PAGE}`, { signal });
        if (!response.ok) {
          throw new Error(`Volcano data request failed: HTTP ${response.status} (page ${page})`);
        }
        const data = (await response.json()) as VolcanoApiPage;
        all.push(...data.items);
        totalPages = data.totalPages;
        page++;
      }
      const result = dedupeVolcanoes(all);
      this.cached = result;
      return result;
    })();

    // .finally() возвращает ОТДЕЛЬНЫЙ производный промис, который сам
    // отклоняется той же причиной, если отклоняется исходный — если его не
    // перехватить, это "необработанное отклонение", даже когда вызывающий
    // код корректно обрабатывает промис, реально возвращённый из load().
    this.inFlight.finally(() => {
      this.inFlight = null;
    }).catch(() => {});

    return this.inFlight;
  }

  dispose(): void {
    this.controller?.abort();
    this.inFlight = null;
  }
}
