"use client";

import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale-context";
import { ButtonLink } from "@/components/design-system";

export default function FinalCta() {
  const { user } = useAuth();
  const { t } = useLocale();

  return (
    <section className="relative overflow-hidden px-4 py-24 sm:px-6">
      {/* atmospheric transition referencing the three subject accents — restrained, not a solid glowing block */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-full opacity-60"
        style={{
          background:
            "radial-gradient(60% 60% at 20% 30%, rgb(var(--ds-accent-physics) / 0.12), transparent 70%), radial-gradient(50% 50% at 80% 40%, rgb(var(--ds-accent-chemistry) / 0.12), transparent 70%), radial-gradient(55% 55% at 50% 85%, rgb(var(--ds-accent-geo) / 0.12), transparent 70%)",
        }}
        aria-hidden="true"
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.45 }}
        className="mx-auto max-w-2xl text-center"
      >
        <h2 className="text-ds-display text-text-primary sm:text-4xl">{t.finalCta.title}</h2>
        <p className="mt-4 text-ds-body text-text-secondary">{t.finalCta.subtitle}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <ButtonLink href={user ? "/dashboard" : "/register"} variant="primary" className="w-full sm:w-auto">
            {user ? t.nav.openDashboard : t.finalCta.ctaPrimary}
          </ButtonLink>
          <ButtonLink href="#worlds" variant="secondary" className="w-full sm:w-auto">
            {t.finalCta.ctaSecondary}
          </ButtonLink>
        </div>
      </motion.div>
    </section>
  );
}
