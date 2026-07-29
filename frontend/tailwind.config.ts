import type { Config } from "tailwindcss";

const config: Config = {
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
      },
      fontFamily: {
        sans: ["var(--font-body)", "sans-serif"],
        headline: ["var(--font-headline)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
