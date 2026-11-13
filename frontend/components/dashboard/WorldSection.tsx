"use client";

import useSWR from "swr";
import { motion } from "framer-motion";
import { useLocale } from "@/lib/locale-context";
import { ACCENT_BG_CLASS, ACCENT_TEXT_CLASS, worldCopy } from "@/lib/landing-worlds";
import { dashboardWorlds, type WorldProgress } from "@/lib/dashboard-worlds";
import { getMyResults } from "@/lib/results-client";
import type { Simulation } from "@/lib/types";
import { ButtonLink, Skeleton, Surface } from "@/components/design-system";
import { INTL_LOCALE_TAG } from "@/lib/i18n/locales";

/**
 * Лаборатории ученика на дашборде — рабочая панель, а не витрина.
 *
 * Раньше эта секция была копией лендинговой WorldsShowcase: тот же текст
 * из `t.worlds.items` (тэглайн «ВРАЩАЙ, ПРИБЛИЖАЙ, ИЗУЧАЙ» + продающее
 * описание), только с приписанной снизу статистикой. Для посетителя сайта
 * это нужный текст, для вошедшего ученика — шум: он уже купился, он пришёл
 * заниматься. Рекламная копия осталась там, где работает, — на лендинге;
 * здесь карточка показывает то, ради чего на неё нажимают:
 *
 *   • название УРОКА крупно (раньше было мелким серым «Доступно: …»);
 *   • полосу пройденных уроков лаборатории — по реальным результатам;
 *   • средний балл и дату последнего захода, если они есть;
 *   • одну кнопку, подписанную по состоянию: Начать / Продолжить /
 *     Пройти заново / Скоро — вместо одинакового «Войти» везде.
 *
 * Кнопка ведёт в первый НЕПРОЙДЕННЫЙ урок лаборатории, а не в самый
 * свежий по дате создания, и лаборатории с активностью идут первыми —
 * см. lib/dashboard-worlds.ts, там же вся арифметика и её тесты.
 *
 * Как и прежде: маршруты только на реальные симуляции, никаких
 * придуманных процентов, никакого WebGL в карточке.
 */
const CTA_LABEL = {
  start: "startCta",
  continue: "continueCta",
  replay: "replayCta",
  comingSoon: "comingSoon",
} as const;

function WorldPortal({ entry, isLoading, index }: { entry: WorldProgress; isLoading: boolean; index: number }) {
  const { t, locale } = useLocale();
  const copy = worldCopy(t, entry.world.key);
  const Icon = entry.world.icon;
  const { featured, completedLessons, totalLessons, avgScore, lastActivityAt, cta } = entry;

  const progressPct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
  const lastActivity = lastActivityAt !== null ? new Date(lastActivityAt).toLocaleDateString(INTL_LOCALE_TAG[locale]) : null;
  const w = t.dashboard.worlds;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.35, delay: index * 0.08 }}
    >
      <Surface
        elevated
        className="group relative flex h-full flex-col overflow-hidden transition-transform duration-300 ease-ds-standard hover:-translate-y-1"
      >
        {/* atmospheric header — depth via two layered gradient blobs, not a flat colored box */}
        <div className={`relative h-28 overflow-hidden ${ACCENT_TEXT_CLASS[entry.world.accent]}`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,currentColor,transparent_50%)] opacity-40" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_75%,currentColor,transparent_45%)] opacity-25" />
          <div className="absolute inset-0 bg-gradient-to-t from-surface-elevated via-transparent to-transparent" />
          <Icon size={34} strokeWidth={1.5} className="absolute bottom-4 left-5 opacity-90 transition-transform duration-300 group-hover:scale-110" />
        </div>

        <div className="flex flex-1 flex-col p-6">
          {/* Название лаборатории — подпись, заголовок карточки — сам урок:
              на него и нажимают, а имя мира и так узнаётся по цвету и иконке. */}
          <p className={`text-ds-caption font-semibold uppercase tracking-widest ${ACCENT_TEXT_CLASS[entry.world.accent]}`}>
            {copy.name}
          </p>

          {isLoading ? (
            <div className="mt-3 flex-1 space-y-3">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-1.5 w-full" />
              <Skeleton className="h-4 w-32" />
            </div>
          ) : featured ? (
            <>
              <h3 className="mt-2 flex-1 text-ds-title text-text-primary">{featured.title}</h3>

              <div
                className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-text-primary/10"
                role="progressbar"
                aria-valuenow={progressPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={w.progressAria}
              >
                <div
                  className={`h-full rounded-full transition-all ${ACCENT_BG_CLASS[entry.world.accent]}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-ds-caption text-text-muted">
                <span className="font-medium text-text-secondary">
                  {w.lessonsProgress.replace("{done}", String(completedLessons)).replace("{total}", String(totalLessons))}
                </span>
                {avgScore !== null && (
                  <span>
                    {w.avgScoreLabel}: <span className="font-medium text-text-secondary">{avgScore}</span>
                  </span>
                )}
                {lastActivity && (
                  <span>
                    {w.lastActivityLabel}: <span className="font-medium text-text-secondary">{lastActivity}</span>
                  </span>
                )}
              </div>
            </>
          ) : (
            <h3 className="mt-2 flex-1 text-ds-body text-text-muted">{w.empty}</h3>
          )}

          <ButtonLink
            href={featured ? `/${featured.module}/${featured.id}` : "#worlds"}
            variant="primary"
            aria-disabled={!featured}
            className={`mt-5 self-start ${!featured ? "pointer-events-none opacity-50" : ""}`}
          >
            {w[CTA_LABEL[cta]]}
          </ButtonLink>
        </div>
      </Surface>
    </motion.div>
  );
}

export default function WorldSection({ simulations, isLoading }: { simulations: Simulation[] | undefined; isLoading: boolean }) {
  const { t } = useLocale();
  // Same "results-me" SWR key RecentResults already uses — SWR dedupes by
  // key, so this never fires a second network request for the same data.
  const { data: results } = useSWR("results-me", getMyResults);
  const entries = dashboardWorlds(simulations, results);

  return (
    <section id="worlds">
      {/* D5.2 — this section's header is deliberately centered (unlike the
          other section headings on this page) to give "Explore the Worlds"
          the centerpiece weight the brief asks for; card content below
          stays left-aligned for readability, per the same brief's explicit
          warning against blindly centering every piece of text. */}
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-ds-title text-text-primary">{t.dashboard.worlds.title}</h2>
        <p className="mt-1 text-ds-body text-text-secondary">{t.dashboard.worlds.subtitle}</p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        {entries.map((entry, index) => (
          <WorldPortal key={entry.world.key} entry={entry} isLoading={isLoading} index={index} />
        ))}
      </div>
    </section>
  );
}
