"use client";

import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale-context";
import { ACCENT_BG_CLASS, ACCENT_TEXT_CLASS, LANDING_WORLDS, type LandingWorld, worldCopy } from "@/lib/landing-worlds";
import { ButtonLink, Surface } from "@/components/design-system";
import type { Dictionary } from "@/lib/i18n/dictionaries";

function WorldCard({ world, t, ctaHref }: { world: LandingWorld; t: Dictionary; ctaHref: string }) {
  const copy = worldCopy(t, world.key);
  const Icon = world.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.4 }}
    >
      <Surface elevated className="group flex h-full flex-col overflow-hidden p-0 transition-transform duration-300 ease-ds-standard hover:-translate-y-1">
        {/* accent header strip — gives each world its own visual identity instead of an identical rectangle */}
        <div className={`relative h-28 overflow-hidden bg-[radial-gradient(circle_at_20%_20%,currentColor,transparent_55%)] ${ACCENT_TEXT_CLASS[world.accent]} opacity-90`}>
          <div className="absolute inset-0 bg-gradient-to-t from-surface-elevated to-transparent" />
          <Icon size={28} className={`absolute bottom-3 left-5 ${ACCENT_TEXT_CLASS[world.accent]}`} />
        </div>

        <div className="flex flex-1 flex-col p-6">
          <p className={`text-ds-caption font-semibold uppercase tracking-widest ${ACCENT_TEXT_CLASS[world.accent]}`}>{copy.tagline}</p>
          <h3 className="mt-1 text-ds-title text-text-primary">{copy.name}</h3>
          <p className="mt-3 flex-1 text-ds-body text-text-secondary">{copy.description}</p>

          <ButtonLink href={ctaHref} variant="secondary" className="mt-6 self-start">
            <span className={`mr-1 h-1.5 w-1.5 rounded-full ${ACCENT_BG_CLASS[world.accent]}`} />
            {t.worlds.cta}
          </ButtonLink>
        </div>
      </Surface>
    </motion.div>
  );
}

export default function WorldsShowcase() {
  const { user } = useAuth();
  const { t } = useLocale();
  // ни один мир не имеет прямого публичного маршрута с конкретным [id] —
  // конкретную симуляцию выбирают из каталога после входа, поэтому CTA
  // ведет в продуктовый флоу целиком, а не гадает ID (см. §20 D2-заметок)
  const ctaHref = user ? "/dashboard" : "/register";

  return (
    <section id="worlds" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <span className="text-ds-caption font-semibold uppercase tracking-widest text-accent">{t.worlds.eyebrow}</span>
        <h2 className="mt-3 text-ds-display text-text-primary sm:text-4xl">{t.worlds.title}</h2>
        <p className="mt-4 text-ds-body text-text-secondary">{t.worlds.subtitle}</p>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
        {LANDING_WORLDS.map((world) => (
          <WorldCard key={world.key} world={world} t={t} ctaHref={ctaHref} />
        ))}
      </div>
    </section>
  );
}
