import type { Locale } from "./i18n/locales";
import type { ElectricityLabExperiment } from "./electricity-lab-catalog";

const COPY: Record<string, Record<Locale, { title: string; description: string }>> = {
  "elec-intermediate-series-resistors": {
    ru: { title: "Последовательное соединение резисторов", description: "Собери последовательную цепь с резисторами 47 Ω и 100 Ω и сравни падения напряжения." },
    en: { title: "Resistors in series", description: "Build a series circuit with 47 Ω and 100 Ω resistors and compare their voltage drops." },
    tg: { title: "Пайвасти пайдарпайи муқовиматҳо", description: "Бо муқовиматҳои 47 Ω ва 100 Ω занҷири пайдарпай соз ва пастшавии шиддатро муқоиса кун." },
  },
  "elec-advanced-parallel-resistors": {
    ru: { title: "Параллельное соединение резисторов", description: "Собери параллельные ветви с резисторами 220 Ω и 470 Ω и сравни токи ветвей." },
    en: { title: "Resistors in parallel", description: "Build parallel branches with 220 Ω and 470 Ω resistors and compare branch currents." },
    tg: { title: "Пайвасти мувозии муқовиматҳо", description: "Бо муқовиматҳои 220 Ω ва 470 Ω шохаҳои мувозӣ соз ва ҷараёнҳоро муқоиса кун." },
  },
};

export function localizeElectricityExperiment(experiment: ElectricityLabExperiment, locale: Locale): ElectricityLabExperiment {
  return COPY[experiment.id]?.[locale] ? { ...experiment, ...COPY[experiment.id][locale] } : experiment;
}
