"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Box, LogOut, User as UserIcon, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale-context";
import { getNavItems } from "@/lib/appshell-nav";
import { LocaleSwitcher, Surface, ThemeToggle } from "@/components/design-system";

/**
 * D4 — mobile navigation (drawer/sheet pattern, not a shrunk desktop rail,
 * per the brief). Solid Surface (not glass) — it's dense, text-labelled
 * navigation, same glass-vs-solid rule as everywhere else in Design V2.
 * Closes on: backdrop click, Escape, or navigating. Blocks background
 * scroll/interaction while open.
 */
export default function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth();
  const { t } = useLocale();
  const pathname = usePathname();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const items = getNavItems(user?.role);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            aria-hidden="true"
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
          />

          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            role="dialog"
            aria-modal="true"
            aria-label={t.shell.mobile.openMenu}
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw]"
          >
            <Surface elevated className="flex h-full flex-col rounded-none border-y-0 border-l-0 p-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2 font-headline text-base font-bold text-text-primary">
                  <Box className="text-accent" size={20} />
                  EduMind 3D
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={onClose}
                  aria-label={t.shell.mobile.closeMenu}
                  className="ds-focus-ring rounded-ds-control p-2 text-text-primary"
                >
                  <X size={20} />
                </button>
              </div>

              <nav className="flex-1 space-y-1">
                {items.map(({ key, href, icon: Icon }) => {
                  const isActive = pathname?.startsWith(href) ?? false;
                  return (
                    <Link
                      key={key}
                      href={href}
                      onClick={onClose}
                      aria-current={isActive ? "page" : undefined}
                      className={`ds-focus-ring flex items-center gap-3 rounded-ds-control px-3 py-2.5 text-ds-body transition-colors ${
                        isActive ? "bg-accent/10 font-medium text-accent" : "text-text-secondary hover:bg-text-primary/5 hover:text-text-primary"
                      }`}
                    >
                      <Icon size={20} />
                      {t.shell.nav[key]}
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-4 space-y-3 border-t border-border/[0.08] pt-4">
                <div className="flex items-center gap-2">
                  <LocaleSwitcher />
                  <ThemeToggle />
                </div>

                {user && (
                  <>
                    <Link
                      href="/profile"
                      onClick={onClose}
                      className="ds-focus-ring flex items-center gap-2 rounded-ds-control px-3 py-2.5 text-ds-body text-text-secondary transition-colors hover:bg-text-primary/5 hover:text-text-primary"
                    >
                      <UserIcon size={18} />
                      {t.shell.account.profile}
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        logout();
                      }}
                      className="ds-focus-ring flex w-full items-center gap-2 rounded-ds-control px-3 py-2.5 text-left text-ds-body text-danger transition-colors hover:bg-danger/10"
                    >
                      <LogOut size={18} />
                      {t.shell.account.logout}
                    </button>
                  </>
                )}
              </div>
            </Surface>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
