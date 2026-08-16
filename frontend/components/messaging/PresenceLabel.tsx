"use client";

import { useLocale } from "@/lib/locale-context";
import { formatRelativeTime } from "@/lib/messaging-time";

/**
 * T6 — presence text for the conversation header: "online" (with a
 * decorative dot — the TEXT is what actually conveys it, not the color
 * alone) or "last seen X ago". Renders nothing for a counterpart who has
 * never had a presence signal yet (brand-new conversation, no connection
 * seen so far) rather than a misleading "last seen" with no real data.
 */
export default function PresenceLabel({ online, lastSeenAt }: { online: boolean; lastSeenAt: string | null }) {
  const { t, locale } = useLocale();

  if (online) {
    return (
      <span className="flex items-center gap-1.5 text-ds-caption text-success" data-testid="presence-online">
        <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
        {t.messaging.online}
      </span>
    );
  }

  if (lastSeenAt) {
    return (
      <span className="text-ds-caption text-text-muted" data-testid="presence-last-seen">
        {t.messaging.lastSeenAt(formatRelativeTime(lastSeenAt, locale, t))}
      </span>
    );
  }

  return null;
}
