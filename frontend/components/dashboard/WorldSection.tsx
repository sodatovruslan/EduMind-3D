"use client";

import { motion } from "framer-motion";
import { useLocale } from "@/lib/locale-context";
import { ACCENT_TEXT_CLASS, LANDING_WORLDS, worldCopy } from "@/lib/landing-worlds";
import type { Simulation } from "@/lib/types";
import { ButtonLink, Skeleton, Surface } from "@/components/design-system";

/**
 * D5.1 — "Explore the worlds", reworked as a major visual section (the D5
 * version grouped real simulations under small stacked text headers, which
 * read as a database listing rather than "portals into three worlds" —
 * see EDUMIND_DESIGN_SYSTEM_V2.md D5.1 notes). Still reuses
 * lib/landing-worlds.ts (same 3 promoted worlds/accents as the D2 Landing,
 * SimLab excluded) and still only ever routes to REAL simulations — no
 * fabricated screenshots, no mounted WebGL, just a richer CSS/SVG-driven
 * card matching the Landing's WorldsShowcase visual language.
 */
function WorldPortal({
  world,
  simulations,
  isLoading,
  index,
}: {
  world: (typeof LANDING_WORLDS)[number];
  simulations: Simulation[] | undefined;
  isLoading: boolean;
  index: number;
}) {
  const { t } = useLocale();
  const copy = worldCopy(t, world.key);
  const Icon = world.icon;
  const moduleKey = world.routeBase.slice(1) as Simulation["module"];
  const worldSimulations = simulations?.filter((s) => s.module === moduleKey) ?? [];
  // "featured" — самая свежая реальная симуляция этого модуля; лишних
  // придумывать не нужно — если их несколько, честно показываем счётчик
  const featured = [...worldSimulations].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  const extraCount = Math.max(0, worldSimulations.length - 1);

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
        <div className={`relative h-40 overflow-hidden ${ACCENT_TEXT_CLASS[world.accent]}`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,currentColor,transparent_50%)] opacity-40" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_75%,currentColor,transparent_45%)] opacity-25" />
          <div className="absolute inset-0 bg-gradient-to-t from-surface-elevated via-transparent to-transparent" />
          <Icon size={40} strokeWidth={1.5} className="absolute bottom-4 left-5 opacity-90 transition-transform duration-300 group-hover:scale-110" />
        </div>

        <div className="flex flex-1 flex-col p-6">
          <p className={`text-ds-caption font-semibold uppercase tracking-widest ${ACCENT_TEXT_CLASS[world.accent]}`}>{copy.tagline}</p>
          <h3 className="mt-1 text-ds-title text-text-primary">{copy.name}</h3>
          <p className="mt-2 flex-1 text-ds-body text-text-secondary">{copy.description}</p>

          <div className="mt-4 text-ds-caption text-text-muted">
            {isLoading ? (
              <Skeleton className="h-4 w-32" />
            ) : featured ? (
              <>
                {t.dashboard.worlds.availableLabel}: <span className="font-medium text-text-secondary">{featured.title}</span>
                {extraCount > 0 && ` +${extraCount}`}
              </>
            ) : (
              t.dashboard.worlds.empty
            )}
          </div>

          <ButtonLink
            href={featured ? `/${featured.module}/${featured.id}` : "#worlds"}
            variant="primary"
            aria-disabled={!featured}
            className={`mt-4 self-start ${!featured ? "pointer-events-none opacity-50" : ""}`}
          >
            {featured ? t.dashboard.worlds.enterCta : t.dashboard.worlds.comingSoon}
          </ButtonLink>
        </div>
      </Surface>
    </motion.div>
  );
}

export default function WorldSection({ simulations, isLoading }: { simulations: Simulation[] | undefined; isLoading: boolean }) {
  const { t } = useLocale();

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
        {LANDING_WORLDS.map((world, index) => (
          <WorldPortal key={world.key} world={world} simulations={simulations} isLoading={isLoading} index={index} />
        ))}
      </div>
    </section>
  );
}
