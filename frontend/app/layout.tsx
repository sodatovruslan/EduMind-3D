import type { Metadata } from "next";
import { Hanken_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";

// next/font хостит шрифты локально при сборке — без внешних запросов
// к Google Fonts в рантайме, та же логика, что и с процедурным HDRI
// (надежность для школ с нестабильным интернетом)
const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin", "cyrillic-ext"],
  variable: "--font-headline",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-body",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "EduMind 3D",
  description: "Интерактивная образовательная WebGL-платформа",
};

// Design System V2 (§25) — no-FOUC theme bootstrap: applies the resolved
// `dark` class to <html> before first paint, reading the same
// localStorage key/logic as lib/theme-context.tsx's ThemeProvider (kept
// in sync manually since this string runs before any React/module code).
// Wrapped in try/catch — a blocked localStorage (e.g. private browsing)
// must never break the page render.
const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var s=localStorage.getItem('edumind:theme');var t=(s==='light'||s==='dark'||s==='system')?s:'system';var r=t==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;if(r==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${hankenGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        <AuthProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
