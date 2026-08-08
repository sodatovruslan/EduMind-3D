/**
 * Design System V2 — lightweight i18n (D2). Scoped for now to the public
 * Landing + shared public navigation (see EDUMIND_DESIGN_SYSTEM_V2.md D2
 * notes); later stages can migrate more pages onto the same
 * LocaleProvider/dictionary shape without rewriting this file.
 */
export const LOCALES = ["ru", "en", "tg"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ru";

export const LOCALE_LABELS: Record<Locale, string> = {
  ru: "Русский",
  en: "English",
  tg: "Тоҷикӣ",
};

// короткие коды для переключателя языка в navbar (RU / EN / TG)
export const LOCALE_SHORT_LABELS: Record<Locale, string> = {
  ru: "RU",
  en: "EN",
  tg: "TG",
};

export function isLocale(value: string | null): value is Locale {
  return value !== null && (LOCALES as readonly string[]).includes(value);
}
