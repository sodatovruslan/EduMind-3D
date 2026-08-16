"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Box, Menu, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale-context";
import { ButtonLink, GlassPanel, LocaleSwitcher, ThemeToggle } from "@/components/design-system";

/**
 * D2 Landing — floating glass navbar. Distinct from the legacy authenticated
 * shell (components/ui/Navbar.tsx + Sidebar.tsx), which stays untouched and
 * unused on the public route (see EDUMIND_DESIGN_SYSTEM_V2.md §7/§8/D2).
 */
const NAV_ANCHORS = [
  { href: "#worlds", key: "worlds" as const },
  { href: "#how-it-works", key: "howItWorks" as const },
  { href: "#students", key: "students" as const },
  { href: "#teachers", key: "teachers" as const },
];

export default function LandingNavbar() {
  const { user } = useAuth();
  const { t } = useLocale();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6">
      <GlassPanel className="mx-auto flex max-w-6xl items-center justify-between gap-4 rounded-ds-panel px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-headline text-lg font-bold tracking-tight text-text-primary">
          <Box className="text-accent" size={22} />
          EduMind 3D
        </Link>

        <nav className="hidden items-center gap-6 lg:flex">
          {NAV_ANCHORS.map(({ href, key }) => (
            <a key={key} href={href} className="ds-focus-ring rounded-ds-control text-ds-body text-text-secondary transition-colors hover:text-text-primary">
              {t.nav[key]}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <LocaleSwitcher />
          <ThemeToggle />
          {user ? (
            <ButtonLink href="/dashboard" variant="primary" className="px-4">
              {t.nav.openDashboard}
            </ButtonLink>
          ) : (
            <>
              <Link href="/login" className="ds-focus-ring rounded-ds-control px-3 py-2 text-ds-body text-text-secondary transition-colors hover:text-text-primary">
                {t.nav.signIn}
              </Link>
              <ButtonLink href="/register" variant="primary" className="px-4">
                {t.nav.getStarted}
              </ButtonLink>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? t.nav.close : t.nav.menu}
          aria-expanded={mobileOpen}
          className="ds-focus-ring rounded-ds-control p-2 text-text-primary lg:hidden"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </GlassPanel>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="mx-auto mt-2 max-w-6xl lg:hidden"
          >
            <GlassPanel className="flex flex-col gap-1 rounded-ds-panel p-4">
              {NAV_ANCHORS.map(({ href, key }) => (
                <a
                  key={key}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className="ds-focus-ring rounded-ds-control px-2 py-2 text-ds-body text-text-secondary transition-colors hover:text-text-primary"
                >
                  {t.nav[key]}
                </a>
              ))}

              <div className="my-2 flex items-center gap-3">
                <LocaleSwitcher />
                <ThemeToggle />
              </div>

              {user ? (
                <ButtonLink href="/dashboard" variant="primary" onClick={() => setMobileOpen(false)} className="text-center">
                  {t.nav.openDashboard}
                </ButtonLink>
              ) : (
                <div className="flex flex-col gap-2">
                  <ButtonLink href="/login" variant="secondary" onClick={() => setMobileOpen(false)} className="text-center">
                    {t.nav.signIn}
                  </ButtonLink>
                  <ButtonLink href="/register" variant="primary" onClick={() => setMobileOpen(false)} className="text-center">
                    {t.nav.getStarted}
                  </ButtonLink>
                </div>
              )}
            </GlassPanel>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
