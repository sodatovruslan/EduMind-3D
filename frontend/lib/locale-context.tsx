"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/locales";
import { dictionaries, type Dictionary } from "@/lib/i18n/dictionaries";

/**
 * Design System V2 (D2) — RU/EN/TG locale selection for the public Landing
 * and shared public navigation. Same provider/localStorage shape as
 * QualityProvider (lib/quality-context.tsx) / ThemeProvider
 * (lib/theme-context.tsx) for consistency. Mounted globally in
 * app/layout.tsx (additive, like ThemeProvider was for D1) so later stages
 * can start consuming useLocale() on more pages without re-plumbing.
 */
const STORAGE_KEY = "edumind:locale";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Dictionary;
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) setLocaleState(stored);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t: dictionaries[locale] }}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale должен использоваться внутри <LocaleProvider>");
  return ctx;
}
