"use client";

import { useLocale } from "@/lib/locale-context";

/**
 * T6 — ephemeral typing signal, never persisted (see ws_messaging.py).
 * `aria-live="polite"` announces it once when it appears/disappears,
 * never per keystroke or per incoming message — this component only
 * renders (and only changes its text content) when `isTyping` flips, so
 * screen readers aren't spammed on every regular message.
 */
export default function TypingIndicator({ isTyping, name }: { isTyping: boolean; name: string }) {
  const { t } = useLocale();

  return (
    <div aria-live="polite" className="min-h-[1.25rem] px-3 text-ds-caption text-text-muted">
      {isTyping && t.messaging.typingIndicator(name)}
    </div>
  );
}
