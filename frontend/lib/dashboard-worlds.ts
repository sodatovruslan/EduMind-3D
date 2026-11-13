import { LANDING_WORLDS, type LandingWorld } from "@/lib/landing-worlds";
import type { LabResult, Simulation } from "@/lib/types";

/**
 * Состояние лаборатории глазами конкретного ученика — всё, что нужно
 * карточке на дашборде, посчитанное из РЕАЛЬНЫХ данных: каталог
 * `GET /api/simulations/` и собственные результаты `GET /api/results/me`.
 * Ничего не выдумываем: процент прогресса — это доля пройденных уроков
 * лаборатории, а не оценка «на глаз».
 *
 * Логика вынесена из WorldSection.tsx сюда, потому что это единственная
 * нетривиальная часть секции: что показать на карточке, какую кнопку
 * нарисовать и в каком порядке расставить лаборатории. Компонент после
 * этого — чистая разметка.
 *
 * Отдельно про «Пройдено». Раньше карточка показывала `worldResults.length`
 * — число СДАННЫХ ПОПЫТОК. У ученика с двумя заходами в один и тот же
 * урок получалось «Пройдено: 2», хотя урок в лаборатории один. Считаем по
 * уникальным `simulation_id`, так что «Пройдено 1 из 1» — правда.
 */

/** Какая кнопка уместна на карточке. */
export type WorldCta = "comingSoon" | "start" | "continue" | "replay";

export interface WorldProgress {
  world: LandingWorld;
  /** Уроки этой лаборатории в порядке появления — так их и проходят. */
  lessons: Simulation[];
  /** Урок, который откроет кнопка: первый непройденный, иначе последний. */
  featured: Simulation | null;
  completedLessons: number;
  totalLessons: number;
  /** Средний балл по всем результатам лаборатории, или null, если баллов нет. */
  avgScore: number | null;
  /** Время последнего результата (epoch ms), или null. */
  lastActivityAt: number | null;
  cta: WorldCta;
}

function moduleOf(world: LandingWorld): Simulation["module"] {
  return world.routeBase.slice(1) as Simulation["module"];
}

export function worldProgress(
  world: LandingWorld,
  simulations: Simulation[] | undefined,
  results: LabResult[] | undefined
): WorldProgress {
  const moduleKey = moduleOf(world);

  const lessons = (simulations ?? [])
    .filter((simulation) => simulation.module === moduleKey)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const worldResults = (results ?? []).filter((result) => result.module === moduleKey);
  const completedIds = new Set(worldResults.map((result) => result.simulation_id));
  const completedLessons = lessons.filter((lesson) => completedIds.has(lesson.id)).length;

  const scored = worldResults.filter((result) => result.score !== null);
  const avgScore =
    scored.length > 0 ? Math.round(scored.reduce((sum, result) => sum + (result.score ?? 0), 0) / scored.length) : null;

  const times = worldResults.map((result) => new Date(result.completed_at).getTime()).filter((time) => Number.isFinite(time));
  const lastActivityAt = times.length > 0 ? Math.max(...times) : null;

  // Кнопка ведёт туда, где ученик остановился, а не в самый свежий урок:
  // первый непройденный; если пройдено всё — в последний, чтобы «Пройти
  // заново» открывало то, что он только что закончил.
  const nextUnfinished = lessons.find((lesson) => !completedIds.has(lesson.id)) ?? null;
  const featured = nextUnfinished ?? lessons[lessons.length - 1] ?? null;

  const cta: WorldCta =
    lessons.length === 0 ? "comingSoon" : worldResults.length === 0 ? "start" : nextUnfinished ? "continue" : "replay";

  return {
    world,
    lessons,
    featured,
    completedLessons,
    totalLessons: lessons.length,
    avgScore,
    lastActivityAt,
    cta,
  };
}

/**
 * Начатое — наверх. Порядок в LANDING_WORLDS зашит жёстко (физика, химия,
 * география), поэтому ученик, который занимается только географией, каждый
 * раз искал свою лабораторию третьей. Сначала лаборатории с активностью
 * (самая свежая первой), затем те, где есть уроки, но ещё не начато, затем
 * пустые. Сортировка стабильная, так что внутри группы исходный порядок
 * сохраняется — карточки не прыгают без причины.
 */
export function sortWorldProgress(entries: WorldProgress[]): WorldProgress[] {
  const rank = (entry: WorldProgress): number => {
    if (entry.lastActivityAt !== null) return 0;
    if (entry.totalLessons > 0) return 1;
    return 2;
  };
  return [...entries].sort((a, b) => rank(a) - rank(b) || (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0));
}

/** Готовые карточки для дашборда: посчитать по каждому миру и упорядочить. */
export function dashboardWorlds(
  simulations: Simulation[] | undefined,
  results: LabResult[] | undefined
): WorldProgress[] {
  return sortWorldProgress(LANDING_WORLDS.map((world) => worldProgress(world, simulations, results)));
}
