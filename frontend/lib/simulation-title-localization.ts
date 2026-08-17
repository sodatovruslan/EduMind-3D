import type { Locale } from "@/lib/i18n/locales";

const TITLES: Record<string, Record<Locale, string>> = {
  "Chemistry World: первые эксперименты": {
    ru: "Chemistry World: первые эксперименты",
    en: "Chemistry World: first experiments",
    tg: "Chemistry World: таҷрибаҳои аввалин",
  },
  "Собери электрическую цепь": {
    ru: "Собери электрическую цепь",
    en: "Build an electric circuit",
    tg: "Занҷири барқӣ соз",
  },
  "Строение Земли: кора, мантия, ядро": {
    ru: "Строение Земли: кора, мантия, ядро",
    en: "Earth structure: crust, mantle and core",
    tg: "Сохтори Замин: қишр, мантия ва ядро",
  },
};

export function localizeSimulationTitle(title: string, locale: Locale): string {
  return TITLES[title]?.[locale] ?? title;
}
