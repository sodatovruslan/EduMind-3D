"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme, type ThemePreference } from "@/lib/theme-context";
import { useLocale } from "@/lib/locale-context";

/**
 * Light/Dark switcher. Until the user picks one, the theme follows the OS
 * (ThemeProvider defaults to "system"); the button for the theme currently
 * shown is highlighted.
 */
const OPTIONS: Array<{ value: ThemePreference; labelKey: "themeLight" | "themeDark"; icon: typeof Sun }> = [
  { value: "light", labelKey: "themeLight", icon: Sun },
  { value: "dark", labelKey: "themeDark", icon: Moon },
];

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useLocale();

  return (
    <div
      role="radiogroup"
      aria-label={t.common.theme}
      className="ds-glass inline-flex items-center gap-1 rounded-ds-control p-1"
    >
      {OPTIONS.map(({ value, labelKey, icon: Icon }) => {
        const isActive = resolvedTheme === value;
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
