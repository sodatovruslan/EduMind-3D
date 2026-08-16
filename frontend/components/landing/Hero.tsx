"use client";

import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale-context";
import { ButtonLink } from "@/components/design-system";
import HeroVisual from "./HeroVisual";

export default function Hero() {
  const { user } = useAuth();
  const { t } = useLocale();

  return (
    <section className="relative overflow-hidden pb-20 pt-36 sm:pt-44">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center lg:text-left"
        >
          <span className="text-ds-caption font-semibold uppercase tracking-widest text-accent">{t.hero.eyebrow}</span>
          <h1 className="mt-4 text-ds-display text-text-primary sm:text-5xl">
            {t.hero.headlineLine1}
            <br />
            {t.hero.headlineLine2}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-ds-body text-text-secondary lg:mx-0">{t.hero.subcopy}</p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <ButtonLink href={user ? "/dashboard" : "/register"} variant="primary" className="w-full sm:w-auto">
              {user ? t.nav.openDashboard : t.hero.ctaPrimary}
            </ButtonLink>
            <ButtonLink href="#worlds" variant="secondary" className="w-full sm:w-auto">
              {t.hero.ctaSecondary}
            </ButtonLink>
          </div>

          <p className="mt-6 text-ds-caption uppercase tracking-widest text-text-muted">{t.hero.subjectsLine}</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.1 }}>
          <HeroVisual />
        </motion.div>
      </div>
    </section>
  );
}
