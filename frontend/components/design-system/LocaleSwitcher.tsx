"use client";

import { LOCALES, LOCALE_SHORT_LABELS, LOCALE_LABELS } from "@/lib/i18n/locales";
import { useLocale } from "@/lib/locale-context";

/**
 * Design System V2 (D2) — RU/EN/TG language switcher. Reads/writes
 * LocaleProvider (lib/locale-context.tsx); selection persists across
 * sessions. Same visual pattern as ThemeToggle for consistency.
 */
export default function LocaleSwitcher() {
  const { locale, setLocale, t } = useLocale();

  return (
    <div role="radiogroup" aria-label={t.common.language} className="ds-glass inline-flex items-center gap-1 rounded-ds-control p-1">
      {LOCALES.map((code) => {
        const isActive = locale === code;
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={LOCALE_LABELS[code]}
            title={LOCALE_LABELS[code]}
            onClick={() => setLocale(code)}
            className={`ds-focus-ring rounded-ds-control px-2 py-1.5 text-ds-caption font-semibold transition-colors duration-200 ease-ds-standard ${
              isActive ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {LOCALE_SHORT_LABELS[code]}
          </button>
        );
      })}
    </div>
  );
}
