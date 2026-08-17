"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePreference } from "@/lib/theme-context";
import { useLocale } from "@/lib/locale-context";

/**
 * Design System V2 §25/§27 — Light/Dark/System switcher. Reads/writes
 * ThemeProvider (lib/theme-context.tsx); selection persists across
 * sessions and "System" stays live-subscribed to the OS preference.
 */
const OPTIONS: Array<{ value: ThemePreference; labelKey: "themeLight" | "themeDark" | "themeSystem"; icon: typeof Sun }> = [
  { value: "light", labelKey: "themeLight", icon: Sun },
  { value: "dark", labelKey: "themeDark", icon: Moon },
  { value: "system", labelKey: "themeSystem", icon: Monitor },
];

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useLocale();

  return (
    <div
      role="radiogroup"
      aria-label={t.common.theme}
      className="ds-glass inline-flex items-center gap-1 rounded-ds-control p-1"
    >
      {OPTIONS.map(({ value, labelKey, icon: Icon }) => {
        const isActive = theme === value;
        const label = t.common[labelKey];
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={`ds-focus-ring flex items-center justify-center rounded-ds-control p-2 transition-colors duration-200 ease-ds-standard ${
              isActive ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <Icon size={16} />
          </button>
        );
      })}
    </div>
  );
}
