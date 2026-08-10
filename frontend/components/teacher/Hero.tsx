"use client";

import { useLocale } from "@/lib/locale-context";

/**
 * D7 — Teacher Learning Analytics Center hero. Deliberately just a title +
 * subtitle (no KPI HUD baked in here, unlike the student Hero) — the real
 * class metrics get their own KpiRow section right below so this stays a
 * simple page header, not a second place carrying live data.
 */
export default function Hero() {
  const { t } = useLocale();

  return (
    <section>
      <h1 className="text-ds-display text-text-primary">{t.teacher.pageTitle}</h1>
      <p className="mt-1 text-ds-body text-text-secondary">{t.teacher.pageSubtitle}</p>
    </section>
  );
}
