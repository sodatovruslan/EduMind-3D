import type { Dictionary } from "@/lib/i18n/dictionaries";
import { INTL_LOCALE_TAG, type Locale } from "@/lib/i18n/locales";

/**
 * T6 — locale-aware, human-friendly relative time for message timestamps
 * and last-seen. Thresholds (brief): under a minute -> "just now"; under
 * an hour -> "N min ago"; same calendar day -> "N h ago"; previous
 * calendar day -> "Yesterday"; anything older -> an absolute localized
 * date. `now` is injectable for tests.
 */
export function formatRelativeTime(iso: string, locale: Locale, t: Dictionary, now: Date = new Date()): string {
  const date = new Date(iso);
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return t.messaging.justNow;
  if (diffMinutes < 60) return t.messaging.minutesAgo(diffMinutes);
  if (isSameCalendarDay(date, now)) return t.messaging.hoursAgo(Math.floor(diffMinutes / 60));

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameCalendarDay(date, yesterday)) return t.messaging.yesterday;

  return date.toLocaleDateString(INTL_LOCALE_TAG[locale]);
}

/** Compact per-bubble timestamp (HH:MM) — the full date/time belongs in a
 * `title` attribute for hover, not baked into every bubble (brief §14). */
export function formatBubbleTime(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleTimeString(INTL_LOCALE_TAG[locale], { hour: "2-digit", minute: "2-digit" });
}

export function formatFullDateTime(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleString(INTL_LOCALE_TAG[locale]);
}

/** Date-separator label — grouped by local calendar day (brief §15): Today
 * / Yesterday / an absolute date, never "3 days ago" style. */
export function formatDateSeparator(iso: string, locale: Locale, t: Dictionary, now: Date = new Date()): string {
  const date = new Date(iso);
  if (isSameCalendarDay(date, now)) return t.messaging.today;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameCalendarDay(date, yesterday)) return t.messaging.yesterday;

  return date.toLocaleDateString(INTL_LOCALE_TAG[locale], { day: "numeric", month: "long", year: "numeric" });
}

export function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
