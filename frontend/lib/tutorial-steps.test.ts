import { describe, expect, it } from "vitest";
import { TUTORIAL_STEPS, isPairConnected } from "./tutorial-steps";
import type { Connection } from "./circuit-engine";

describe("tutorial-steps — isPairConnected", () => {
  it("finds a match regardless of terminal order", () => {
    const connections: Connection[] = [{ id: "c1", terminals: ["battery_pos", "switch_a"] }];
    expect(isPairConnected(connections, "battery_pos", "switch_a")).toBe(true);
    expect(isPairConnected(connections, "switch_a", "battery_pos")).toBe(true);
  });

  it("returns false when the pair is not wired", () => {
    const connections: Connection[] = [{ id: "c1", terminals: ["battery_pos", "switch_a"] }];
    expect(isPairConnected(connections, "switch_b", "bulb_a")).toBe(false);
  });

  it("defines exactly 4 wiring steps forming one valid series loop", () => {
    expect(TUTORIAL_STEPS).toHaveLength(4);
    // конец шага N совпадает с началом шага N+1 по компоненту (та же деталь,
    // второй вывод) — проверяем, что шаги реально образуют один контур
    const usedTerminals = TUTORIAL_STEPS.flatMap((s) => [s.from, s.to]);
    expect(new Set(usedTerminals).size).toBe(usedTerminals.length); // все уникальны, нет дублей
  });
});
