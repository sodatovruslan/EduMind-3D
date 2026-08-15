import { describe, expect, it } from "vitest";
import { formatDateSeparator, formatRelativeTime } from "./messaging-time";
import { ru } from "./i18n/dictionaries/ru";
import { en } from "./i18n/dictionaries/en";

// Built from LOCAL date components (not UTC "Z" strings) so calendar-day
// math is self-consistent regardless of which timezone the test runner's
// machine is actually in — formatRelativeTime groups by LOCAL calendar
// day on purpose (brief §15), so the test has to respect that too.
function local(y: number, m: number, d: number, h: number, min: number, s = 0): string {
  return new Date(y, m, d, h, min, s).toISOString();
}

const NOW = new Date(2026, 0, 10, 12, 0);

describe("formatRelativeTime — T6 thresholds", () => {
  it("shows 'just now' under a minute", () => {
    expect(formatRelativeTime(local(2026, 0, 10, 11, 59, 30), "en", en, NOW)).toBe("just now");
  });

  it("shows minutes for under an hour", () => {
    expect(formatRelativeTime(local(2026, 0, 10, 11, 45), "en", en, NOW)).toBe("15 min ago");
  });

  it("shows hours for later the same calendar day", () => {
    expect(formatRelativeTime(local(2026, 0, 10, 9, 0), "en", en, NOW)).toBe("3 h ago");
  });

  it("shows 'Yesterday' for the previous calendar day even if <24h ago", () => {
    // 11pm the previous local day is <24h before noon today, but a
    // DIFFERENT calendar day — must say Yesterday, not "13 h ago".
    expect(formatRelativeTime(local(2026, 0, 9, 23, 0), "en", en, NOW)).toBe("Yesterday");
  });

  it("falls back to an absolute date for anything older than yesterday", () => {
    const result = formatRelativeTime(local(2026, 0, 5, 12, 0), "en", en, NOW);
    expect(result).not.toBe("Yesterday");
    expect(result).toMatch(/2026|Jan/);
  });

  it("applies correct Russian pluralization at the minute/hour boundaries", () => {
    expect(formatRelativeTime(local(2026, 0, 10, 11, 59), "ru", ru, NOW)).toBe("1 минуту назад");
    expect(formatRelativeTime(local(2026, 0, 10, 11, 58), "ru", ru, NOW)).toBe("2 минуты назад");
    expect(formatRelativeTime(local(2026, 0, 10, 11, 50), "ru", ru, NOW)).toBe("10 минут назад");
  });
});

describe("formatDateSeparator — T6 calendar-day grouping", () => {
  it("labels today's messages 'Today', not a relative duration", () => {
    expect(formatDateSeparator(local(2026, 0, 10, 8, 0), "en", en, NOW)).toBe("Today");
  });

  it("labels yesterday's messages 'Yesterday'", () => {
    expect(formatDateSeparator(local(2026, 0, 9, 8, 0), "en", en, NOW)).toBe("Yesterday");
  });

  it("labels older messages with an absolute date, not '3 days ago'", () => {
    const result = formatDateSeparator(local(2026, 0, 5, 8, 0), "en", en, NOW);
    expect(result).not.toBe("Yesterday");
    expect(result).not.toBe("Today");
  });
});
