import { describe, it, expect } from "vitest";
import { dashboardWorlds, sortWorldProgress, worldProgress, type WorldProgress } from "./dashboard-worlds";
import { LANDING_WORLDS } from "./landing-worlds";
import type { LabResult, Simulation } from "./types";

// Что карточка лаборатории показывает ученику. Все числа здесь должны
// выводиться из реальных данных — каталога уроков и собственных
// результатов; ничего «на глаз».

const ELECTRICITY = LANDING_WORLDS.find((w) => w.key === "electricity")!;
const GEO = LANDING_WORLDS.find((w) => w.key === "geo")!;

function lesson(id: string, module: Simulation["module"], createdAt: string, title = id): Simulation {
  return { id, title, module, visibility: "public", subject: "x", config: {}, difficulty: 1, created_at: createdAt };
}

function result(simulationId: string, module: Simulation["module"], score: number | null, completedAt: string): LabResult {
  return {
    id: `r-${simulationId}-${completedAt}`,
    user_id: "u1",
    simulation_id: simulationId,
    simulation_title: simulationId,
    module,
    actions_log: [],
    score,
    feedback: null,
    duration_seconds: 100,
    completed_at: completedAt,
  };
}

describe("worldProgress — сколько уроков пройдено", () => {
  it("считает уроки по уникальным симуляциям, а не по числу попыток", () => {
    const lessons = [lesson("sim-elec", "electricity_lab", "2026-01-01")];
    const results = [
      result("sim-elec", "electricity_lab", 80, "2026-02-01T10:00:00Z"),
      result("sim-elec", "electricity_lab", 90, "2026-02-03T10:00:00Z"),
    ];
    const progress = worldProgress(ELECTRICITY, lessons, results);

    expect(progress.completedLessons).toBe(1);
    expect(progress.totalLessons).toBe(1);
    expect(progress.avgScore).toBe(85);
    expect(progress.lastActivityAt).toBe(new Date("2026-02-03T10:00:00Z").getTime());
  });

  it("не считает чужие лаборатории", () => {
    const lessons = [lesson("sim-elec", "electricity_lab", "2026-01-01"), lesson("sim-geo", "geo3d", "2026-01-01")];
    const results = [result("sim-geo", "geo3d", 50, "2026-02-01T10:00:00Z")];

    expect(worldProgress(ELECTRICITY, lessons, results).completedLessons).toBe(0);
    expect(worldProgress(GEO, lessons, results).completedLessons).toBe(1);
  });

  it("средний балл игнорирует результаты без оценки, и равен null, когда оценок нет совсем", () => {
    const lessons = [lesson("a", "geo3d", "2026-01-01"), lesson("b", "geo3d", "2026-01-02")];
    const scored = worldProgress(GEO, lessons, [
      result("a", "geo3d", null, "2026-02-01T10:00:00Z"),
      result("b", "geo3d", 60, "2026-02-02T10:00:00Z"),
    ]);
    expect(scored.avgScore).toBe(60);

    const unscored = worldProgress(GEO, lessons, [result("a", "geo3d", null, "2026-02-01T10:00:00Z")]);
    expect(unscored.avgScore).toBeNull();
    expect(unscored.lastActivityAt).not.toBeNull();
  });

  it("переживает пустой каталог и отсутствие результатов", () => {
    const empty = worldProgress(GEO, undefined, undefined);
    expect(empty.totalLessons).toBe(0);
    expect(empty.completedLessons).toBe(0);
    expect(empty.featured).toBeNull();
    expect(empty.avgScore).toBeNull();
    expect(empty.lastActivityAt).toBeNull();
    expect(empty.cta).toBe("comingSoon");
  });
});

describe("worldProgress — куда ведёт кнопка и как она подписана", () => {
  const lessons = [
    lesson("first", "geo3d", "2026-01-01"),
    lesson("second", "geo3d", "2026-01-05"),
    lesson("third", "geo3d", "2026-01-10"),
  ];

  it("без результатов зовёт начать с самого первого урока", () => {
    const progress = worldProgress(GEO, lessons, []);
    expect(progress.cta).toBe("start");
    expect(progress.featured?.id).toBe("first");
  });

  it("продолжает с первого непройденного, а не с самого свежего по дате", () => {
    const progress = worldProgress(GEO, lessons, [result("first", "geo3d", 70, "2026-02-01T10:00:00Z")]);
    expect(progress.cta).toBe("continue");
    expect(progress.featured?.id).toBe("second");
  });

  it("когда пройдено всё — предлагает пройти заново последний урок", () => {
    const progress = worldProgress(
      GEO,
      lessons,
      lessons.map((l) => result(l.id, "geo3d", 90, "2026-02-01T10:00:00Z"))
    );
    expect(progress.cta).toBe("replay");
    expect(progress.featured?.id).toBe("third");
    expect(progress.completedLessons).toBe(3);
  });

  it("уроки отдаются в порядке появления, независимо от порядка в каталоге", () => {
    const shuffled = [lessons[2], lessons[0], lessons[1]];
    expect(worldProgress(GEO, shuffled, []).lessons.map((l) => l.id)).toEqual(["first", "second", "third"]);
  });
});

describe("sortWorldProgress — начатое наверх", () => {
  const entry = (key: WorldProgress["world"]["key"], lastActivityAt: number | null, totalLessons: number): WorldProgress => ({
    world: LANDING_WORLDS.find((w) => w.key === key)!,
    lessons: [],
    featured: null,
    completedLessons: 0,
    totalLessons,
    avgScore: null,
    lastActivityAt,
    cta: "start",
  });

  it("сначала лаборатории с активностью — самая свежая первой", () => {
    const sorted = sortWorldProgress([
      entry("electricity", 100, 1),
      entry("chemistry", null, 1),
      entry("geo", 500, 1),
    ]);
    expect(sorted.map((e) => e.world.key)).toEqual(["geo", "electricity", "chemistry"]);
  });

  it("пустые лаборатории уходят в конец, а внутри группы порядок не меняется", () => {
    const sorted = sortWorldProgress([entry("electricity", null, 0), entry("chemistry", null, 1), entry("geo", null, 1)]);
    expect(sorted.map((e) => e.world.key)).toEqual(["chemistry", "geo", "electricity"]);
  });
});

describe("dashboardWorlds", () => {
  it("возвращает все три лаборатории, посчитанные и упорядоченные", () => {
    const lessons = [
      lesson("sim-elec", "electricity_lab", "2026-01-01"),
      lesson("sim-chem", "chemistry_world", "2026-01-01"),
      lesson("sim-geo", "geo3d", "2026-01-01"),
    ];
    const entries = dashboardWorlds(lessons, [result("sim-geo", "geo3d", 50, "2026-02-01T10:00:00Z")]);

    expect(entries).toHaveLength(LANDING_WORLDS.length);
    expect(entries[0].world.key).toBe("geo");
    expect(entries[0].cta).toBe("replay");
    expect(entries.slice(1).every((e) => e.cta === "start")).toBe(true);
  });
});
