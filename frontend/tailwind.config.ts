import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // фирменный акцент EduMind 3D — совпадает с "neon-indigo" из дизайн-системы Stitch
        brand: {
          DEFAULT: "#6366F1",
          dark: "#4338CA",
        },
        // вторичные neon-акценты из дизайн-системы Stitch (SimLab/GeoWorld HUD)
        "neon-cyan": "#06b6d4",
        "neon-violet": "#8b5cf6",
        // "глубина" поверхностей тёмной темы — от самого тёмного фона до панелей
        "surface-deep": "#020617",
        "surface-slate": "#0f172a",
        "surface-container": {
          lowest: "#070d1f",
          low: "#151b2d",
          DEFAULT: "#191f31",
          high: "#23293c",
          highest: "#2e3447",
        },
        "glass-border": "rgba(99, 102, 241, 0.3)",

        // ---- Design System V2 (EDUMIND_DESIGN_SYSTEM_V2.md §25-27) ----
        // Semantic, theme-aware tokens backed by CSS custom properties
        // (see app/globals.css :root / .dark). Purely additive: none of
        // the keys above are touched, so every existing page renders
        // byte-identically. Only new components (components/design-system/*)
        // consume these. "glass"/"glass-border" are intentionally NOT
        // registered here (would collide with the legacy `glass-border`
        // key above) — the glass effect is composed instead via the
        // `.ds-glass` utility in globals.css.
        background: "rgb(var(--ds-background) / <alpha-value>)",
        surface: "rgb(var(--ds-surface) / <alpha-value>)",
        "surface-elevated": "rgb(var(--ds-surface-elevated) / <alpha-value>)",
        "text-primary": "rgb(var(--ds-text-primary) / <alpha-value>)",
        "text-secondary": "rgb(var(--ds-text-secondary) / <alpha-value>)",
        "text-muted": "rgb(var(--ds-text-muted) / <alpha-value>)",
        border: "rgb(var(--ds-border) / <alpha-value>)",
        accent: "rgb(var(--ds-accent) / <alpha-value>)",
        success: "rgb(var(--ds-success) / <alpha-value>)",
        warning: "rgb(var(--ds-warning) / <alpha-value>)",
        danger: "rgb(var(--ds-danger) / <alpha-value>)",
        // per-world accents (§27 Accent System) — subtle identity only,
        // never a full alternate palette per module
        "accent-physics": "rgb(var(--ds-accent-physics) / <alpha-value>)",
        "accent-chemistry": "rgb(var(--ds-accent-chemistry) / <alpha-value>)",
        "accent-geo": "rgb(var(--ds-accent-geo) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-body)", "sans-serif"],
        headline: ["var(--font-headline)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      fontSize: {
        "ds-display": ["2.75rem", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "700" }],
        "ds-title": ["1.5rem", { lineHeight: "1.25", letterSpacing: "-0.01em", fontWeight: "600" }],
        "ds-body": ["0.9375rem", { lineHeight: "1.6" }],
        "ds-caption": ["0.75rem", { lineHeight: "1.4", letterSpacing: "0.02em" }],
      },
      borderRadius: {
        "ds-control": "0.625rem",
        "ds-panel": "1.25rem",
      },
      boxShadow: {
        "ds-sm": "0 1px 2px rgb(var(--ds-shadow) / 0.06)",
        "ds-md": "0 8px 24px -6px rgb(var(--ds-shadow) / 0.16)",
        "ds-lg": "0 24px 60px -12px rgb(var(--ds-shadow) / 0.28)",
      },
      transitionTimingFunction: {
        "ds-standard": "cubic-bezier(0.4, 0, 0.2, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
