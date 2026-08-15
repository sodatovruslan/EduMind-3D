"use client";

import { useLocale } from "@/lib/locale-context";

/**
 * T6 — unread-count pill built entirely from existing Design V2 tokens
 * (rounded-full + bg-accent + text-white + the ds-caption scale — the same
 * vocabulary as e.g. ExperimentCatalogBrowser's pill chips), not a new
 * component system. Design V2 itself is frozen (D10) — this only adds a
 * functional state, no new visual language. The visible glyph is just the
 * number; the full count is in `aria-label` for screen readers.
 */
export default function UnreadBadge({ count, className = "" }: { count: number; className?: string }) {
  const { t } = useLocale();
  if (count <= 0) return null;

  return (
    <span
      role="status"
      aria-label={t.messaging.unreadBadgeLabel(count)}
      data-testid="unread-badge"
      className={`inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[0.6875rem] font-semibold leading-none text-white ${className}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
