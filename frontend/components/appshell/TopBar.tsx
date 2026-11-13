"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, Menu } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale-context";
import { getNavItems, isNavItemActive } from "@/lib/appshell-nav";
import { useUnreadMessagesCount } from "@/lib/useUnreadMessagesCount";
import { useCanSeeMessages } from "@/lib/useCanSeeMessages";
import { LocaleSwitcher, ThemeToggle } from "@/components/design-system";
import UnreadBadge from "@/components/messaging/UnreadBadge";
import AccountMenu from "./AccountMenu";

/**
 * Единственная навигационная полоса аутентифицированного приложения:
 * бренд + горизонтальные destination'ы слева, язык/тема/аккаунт справа.
 *
 * Пришла на смену связке «вертикальный Rail + заголовочный TopBar» (D4).
 * Причина: `getNavItems` отдаёт максимум 4 пункта, а ученику без учителя —
 * ровно один («Главная»), то есть постоянная колонка в 240px обслуживала
 * одну ссылку и отнимала ширину у того, ради чего приложение существует, —
 * 3D-сцен и карточек лабораторий. Горизонтально эти 4 пункта помещаются
 * без тесноты, а immersive-маршруты (MinimalShell) и так жили без рельса.
 *
 * Внутренняя обёртка повторяет `mx-auto max-w-[90rem]` страниц, чтобы
 * бренд и пункты меню стояли на одной вертикали с <h1> контента, а не
 * уезжали к краю экрана на широких мониторах.
 *
 * Логотип ведёт на лендинг (`/`), а не в кабинет: лендинг открыт и для
 * авторизованных (app/page.tsx не редиректит, CTA там становится «Открыть
 * кабинет»), так что это рабочий путь «посмотреть продукт целиком». Ссылка
 * в кабинет живёт в AccountMenu — она нужна отовсюду, а не только с главной.
 *
 * `items` бывает пустым (ученик без учителя): тогда <nav> не рендерится
 * вовсе, чтобы в дереве доступности не висел пустой navigation-landmark.
 *
 * Мобильная навигация не меняется: тот же MobileDrawer, тот же триггер —
 * на <lg горизонтальный список скрыт.
 */
export default function TopBar({ onOpenMobileMenu }: { onOpenMobileMenu: () => void }) {
  const { user } = useAuth();
  const { t } = useLocale();
  const pathname = usePathname();
  const canSeeMessages = useCanSeeMessages();
  const items = getNavItems(user?.role, canSeeMessages);
  const unreadCount = useUnreadMessagesCount();

  return (
    <header className="sticky top-0 z-30 border-b border-border/[0.08] bg-surface">
      <div className="mx-auto flex h-16 max-w-[90rem] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={(e) => {
            // D9 — some browsers (notably Safari) don't focus a button on
            // click by default, which would make MobileDrawer's "restore
            // focus to whatever opened it" logic land on the wrong element.
            // Focusing explicitly makes that deterministic everywhere.
            e.currentTarget.focus();
            onOpenMobileMenu();
          }}
          aria-label={t.shell.mobile.openMenu}
          className="ds-focus-ring rounded-ds-control p-2 text-text-primary lg:hidden"
        >
          <Menu size={22} />
        </button>

        <Link
          href="/"
          className="ds-focus-ring flex shrink-0 items-center gap-2 rounded-ds-control font-headline text-base font-bold text-text-primary"
        >
          <Box className="text-accent" size={20} />
          EduMind 3D
        </Link>

        {items.length > 0 && (
          <nav aria-label={t.shell.nav.label} className="hidden items-center gap-1 lg:ml-4 lg:flex">
            {items.map(({ key, href, icon: Icon }) => {
              const isActive = isNavItemActive(pathname, href);
              return (
                <Link
                  key={key}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={`ds-focus-ring flex items-center gap-2 rounded-ds-control px-3 py-2 text-ds-body transition-colors ${
                    isActive
                      ? "bg-accent/10 font-medium text-accent"
                      : "text-text-secondary hover:bg-text-primary/5 hover:text-text-primary"
                  }`}
                >
                  <Icon size={18} />
                  {t.shell.nav[key]}
                  {key === "messages" && <UnreadBadge count={unreadCount} />}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="flex-1" />

        <div className="hidden items-center gap-2 sm:flex">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
        <AccountMenu />
      </div>
    </header>
  );
}
