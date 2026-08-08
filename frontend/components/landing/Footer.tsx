"use client";

import Link from "next/link";
import { Box } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale-context";

const NAV_ANCHORS = [
  { href: "#worlds", key: "worlds" as const },
  { href: "#how-it-works", key: "howItWorks" as const },
  { href: "#students", key: "students" as const },
  { href: "#teachers", key: "teachers" as const },
];

export default function Footer() {
  const { user } = useAuth();
  const { t } = useLocale();

  return (
    <footer className="border-t border-border/10 px-4 py-12 sm:px-6">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 sm:grid-cols-3">
        <div>
          <div className="flex items-center gap-2 font-headline text-lg font-bold text-text-primary">
            <Box className="text-accent" size={20} />
            EduMind 3D
          </div>
          <p className="mt-3 max-w-xs text-ds-body text-text-secondary">{t.footer.description}</p>
        </div>

        <div>
          <p className="text-ds-caption font-semibold uppercase tracking-widest text-text-muted">{t.footer.navTitle}</p>
          <ul className="mt-3 space-y-2">
            {NAV_ANCHORS.map(({ href, key }) => (
              <li key={key}>
                <a href={href} className="ds-focus-ring rounded-ds-control text-ds-body text-text-secondary transition-colors hover:text-text-primary">
                  {t.nav[key]}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-ds-caption font-semibold uppercase tracking-widest text-text-muted">{t.footer.accountTitle}</p>
          <ul className="mt-3 space-y-2">
            {user ? (
              <li>
                <Link href="/dashboard" className="ds-focus-ring rounded-ds-control text-ds-body text-text-secondary transition-colors hover:text-text-primary">
                  {t.nav.openDashboard}
                </Link>
              </li>
            ) : (
              <>
                <li>
                  <Link href="/login" className="ds-focus-ring rounded-ds-control text-ds-body text-text-secondary transition-colors hover:text-text-primary">
                    {t.nav.signIn}
                  </Link>
                </li>
                <li>
                  <Link href="/register" className="ds-focus-ring rounded-ds-control text-ds-body text-text-secondary transition-colors hover:text-text-primary">
                    {t.nav.getStarted}
                  </Link>
                </li>
              </>
            )}
          </ul>
        </div>
      </div>

      <p className="mx-auto mt-10 max-w-6xl text-ds-caption text-text-muted">{t.footer.rights}</p>
    </footer>
  );
}
