"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePreference } from "@/lib/theme-context";

/**
 * Design System V2 §25/§27 — Light/Dark/System switcher. Reads/writes
 * ThemeProvider (lib/theme-context.tsx); selection persists across
 * sessions and "System" stays live-subscribed to the OS preference.
 */
const OPTIONS: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Светлая", icon: Sun },
  { value: "dark", label: "Тёмная", icon: Moon },
  { value: "system", label: "Системная", icon: Monitor },
];

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Тема оформления"
      className="ds-glass inline-flex items-center gap-1 rounded-ds-control p-1"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const isActive = theme === value;
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
