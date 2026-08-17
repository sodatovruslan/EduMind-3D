import type { Dictionary } from "@/lib/i18n/dictionaries";
import { INTL_LOCALE_TAG, type Locale } from "@/lib/i18n/locales";

/**
 * Bug fix (found during T8 manual testing): every backend timestamp is
 * serialized from a naive `datetime.utcnow()` — no `Z`/offset suffix
 * (e.g. `"2026-08-17T16:22:52"`). A plain `new Date(iso)` on a
 * timezone-less ISO string is parsed by JS as LOCAL time, not UTC —
 * silently shifting every timestamp in the app by the browser's own UTC
 * offset. For a UTC+5 user that's a 5-hour error, large enough to make
 * T8's ring-timeout math go deeply negative immediately (observed for
 * real: a tight GET /api/calls/{id} retry loop). This normalizes any
 * timezone-less backend timestamp to explicit UTC before parsing —
 * applied everywhere a backend datetime string is turned into a `Date`
 * across messaging AND calls, not patched per call site.
 */
export function parseUtcTimestamp(iso: string): Date {
  const hasTimezone = /[Zz]|[+-]\d{2}:?\d{2}$/.test(iso);
  return new Date(hasTimezone ? iso : `${iso}Z`);
}

/**
 * T6 — locale-aware, human-friendly relative time for message timestamps
 * and last-seen. Thresholds (brief): under a minute -> "just now"; under
 * an hour -> "N min ago"; same calendar day -> "N h ago"; previous
 * calendar day -> "Yesterday"; anything older -> an absolute localized
 * date. `now` is injectable for tests.
 */
export function formatRelativeTime(iso: string, locale: Locale, t: Dictionary, now: Date = new Date()): string {
  const date = parseUtcTimestamp(iso);
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
  return parseUtcTimestamp(iso).toLocaleTimeString(INTL_LOCALE_TAG[locale], { hour: "2-digit", minute: "2-digit" });
}

export function formatFullDateTime(iso: string, locale: Locale): string {
  return parseUtcTimestamp(iso).toLocaleString(INTL_LOCALE_TAG[locale]);
}

/** Date-separator label — grouped by local calendar day (brief §15): Today
 * / Yesterday / an absolute date, never "3 days ago" style. */
export function formatDateSeparator(iso: string, locale: Locale, t: Dictionary, now: Date = new Date()): string {
  const date = parseUtcTimestamp(iso);
  if (isSameCalendarDay(date, now)) return t.messaging.today;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameCalendarDay(date, yesterday)) return t.messaging.yesterday;

  return date.toLocaleDateString(INTL_LOCALE_TAG[locale], { day: "numeric", month: "long", year: "numeric" });
}

export function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
