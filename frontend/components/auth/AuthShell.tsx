"use client";

import Link from "next/link";
import { MotionConfig, motion } from "framer-motion";
import { Box } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import { LocaleSwitcher, Surface, ThemeToggle } from "@/components/design-system";
import HeroVisual from "@/components/landing/HeroVisual";

/**
 * D3 — Auth shell (replaces the old (auth)/layout.tsx dark-orb+glass-card
 * look). Reuses the exact D2 HeroVisual so Landing → Auth reads as one
 * continuous brand identity rather than a different application (§ brief
 * "you are entering the EduMind universe", not "generic signup page").
 *
 * Desktop: split layout — atmospheric visual side (reused HeroVisual, own
 * brand mark) + focused Surface (solid, not glass — dense form content
 * follows the same glass-vs-solid rule as the rest of Design V2, §26).
 * Mobile: visual side hidden entirely, form becomes the sole surface with
 * its own top bar (back-to-Landing + Locale/Theme).
 */
export default function AuthShell({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-screen flex-col bg-background lg:flex-row">
        {/* visual side — desktop only */}
        <div className="relative hidden overflow-hidden bg-surface lg:flex lg:w-1/2 lg:items-center lg:justify-center">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(55% 55% at 20% 20%, rgb(var(--ds-accent-physics) / 0.18), transparent 60%), radial-gradient(50% 50% at 85% 30%, rgb(var(--ds-accent-chemistry) / 0.16), transparent 60%), radial-gradient(60% 60% at 50% 95%, rgb(var(--ds-accent-geo) / 0.16), transparent 60%)",
            }}
            aria-hidden="true"
          />

          <Link
            href="/"
            className="ds-focus-ring absolute left-6 top-6 z-10 flex items-center gap-2 rounded-ds-control font-headline text-sm font-bold text-text-primary"
          >
            <Box className="text-accent" size={20} />
            {t.auth.common.backToHome}
          </Link>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="relative z-10 flex flex-col items-center gap-8 px-12 text-center"
          >
            <HeroVisual />
            <div>
              <h2 className="text-ds-title text-text-primary">{t.auth.visual.title}</h2>
              <p className="mx-auto mt-2 max-w-sm text-ds-body text-text-secondary">{t.auth.visual.subtitle}</p>
            </div>
          </motion.div>
        </div>

        {/* form side */}
        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-between p-4 sm:p-6 lg:justify-end">
            <Link
              href="/"
              className="ds-focus-ring flex items-center gap-2 rounded-ds-control font-headline text-sm font-bold text-text-primary lg:hidden"
            >
              <Box className="text-accent" size={20} />
              {t.auth.common.backToHome}
            </Link>
            <div className="flex items-center gap-2">
              <LocaleSwitcher />
              <ThemeToggle />
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center px-4 pb-16 sm:px-6">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="w-full max-w-sm"
            >
              <Surface elevated className="p-8">
                {children}
              </Surface>
            </motion.div>
          </div>
        </div>
      </div>
    </MotionConfig>
  );
}
