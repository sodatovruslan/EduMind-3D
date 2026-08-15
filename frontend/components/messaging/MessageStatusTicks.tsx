"use client";

import { Check, CheckCheck } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import type { MessageStatus } from "@/lib/messaging-client";

/**
 * T6 — the ✓ / ✓✓ / read-styled ✓✓ status indicator for the current
 * user's OWN messages. Color alone never carries the meaning (brief's own
 * accessibility requirement): every state also has a text `aria-label`
 * and a hover `title`, and the visual difference (single vs double tick,
 * plus accent color only once truly read) is never the sole signal.
 */
export default function MessageStatusTicks({ status, className = "" }: { status: MessageStatus; className?: string }) {
  const { t } = useLocale();
  const label = status === "read" ? t.messaging.statusRead : status === "delivered" ? t.messaging.statusDelivered : t.messaging.statusSent;

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex items-center ${status === "read" ? "text-accent" : "text-text-muted"} ${className}`}
    >
      {status === "sent" ? <Check size={13} /> : <CheckCheck size={13} />}
    </span>
  );
}
