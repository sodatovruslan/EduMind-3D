import { describe, expect, it } from "vitest";
import { TileCache, type TileCacheEntry } from "./tile-cache";

function entry(status: TileCacheEntry<string>["status"] = "ready", data: string | null = "x"): TileCacheEntry<string> {
  return { status, data, controller: new AbortController() };
}

describe("GeoWorld G2 — TileCache: ограниченный кэш с LRU-вытеснением", () => {
  it("set/get/has/isReady/size ведут себя предсказуемо", () => {
    const cache = new TileCache<string>(10);
    expect(cache.has("0/0/0")).toBe(false);
    cache.set("0/0/0", entry("ready", "hello"));
    expect(cache.has("0/0/0")).toBe(true);
    expect(cache.isReady("0/0/0")).toBe(true);
    expect(cache.get("0/0/0")?.data).toBe("hello");
    expect(cache.size()).toBe(1);
  });

  it("isReady === false для статусов requested/loading/error", () => {
    const cache = new TileCache<string>(10);
    cache.set("a", entry("requested", null));
    cache.set("b", entry("loading", null));
    cache.set("c", entry("error", null));
    expect(cache.isReady("a")).toBe(false);
    expect(cache.isReady("b")).toBe(false);
    expect(cache.isReady("c")).toBe(false);
  });

  it("рост ограничен maxSize — вставка сверх лимита вытесняет самую старую запись", () => {
    const cache = new TileCache<string>(3);
    cache.set("1", entry());
    cache.set("2", entry());
    cache.set("3", entry());
    expect(cache.size()).toBe(3);
    cache.set("4", entry());
    expect(cache.size()).toBe(3); // размер остаётся ограниченным
    expect(cache.has("1")).toBe(false); // самая старая запись вытеснена
    expect(cache.has("4")).toBe(true);
  });

  it("get() поднимает запись в 'недавно использованные' — она переживает следующее вытеснение", () => {
    const cache = new TileCache<string>(3);
    cache.set("1", entry());
    cache.set("2", entry());
    cache.set("3", entry());
    cache.get("1"); // "1" теперь самая свежая, "2" — самая старая
    cache.set("4", entry());
    expect(cache.has("1")).toBe(true);
    expect(cache.has("2")).toBe(false);
  });

  it("вытеснение записи в статусе loading/requested отменяет её AbortController — нет утечки висящих запросов", () => {
    const cache = new TileCache<string>(1);
    const inFlight = entry("loading", null);
    cache.set("1", inFlight);
    expect(inFlight.controller.signal.aborted).toBe(false);
    cache.set("2", entry("ready", "done")); // "1" вытесняется этой вставкой
    expect(inFlight.controller.signal.aborted).toBe(true);
    expect(cache.has("1")).toBe(false);
  });

  it("не отменяет controller у готовой (ready) записи при её вытеснении — она уже отработала", () => {
    const cache = new TileCache<string>(1);
    const done = entry("ready", "done");
    cache.set("1", done);
    cache.set("2", entry("ready", "done2"));
    expect(done.controller.signal.aborted).toBe(false);
  });
});
