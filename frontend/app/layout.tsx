import type { Metadata } from "next";
import { Hanken_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${hankenGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
