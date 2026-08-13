"use client";

import { useRef, useState } from "react";
import { Send } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import { ApiError } from "@/lib/api";

const MAX_LENGTH = 4000;

/**
 * T5 — text-only composer. Enter sends, Shift+Enter inserts a newline
 * (brief §21's explicit Enter/Shift+Enter semantics). No attachments, no
 * markdown — deliberately out of scope for this stage.
 */
export default function MessageComposer({ onSend }: { onSend: (content: string) => Promise<void> }) {
  const { t } = useLocale();
  const [value, setValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const trimmed = value.trim();
  const isTooLong = value.length > MAX_LENGTH;
  const canSend = trimmed.length > 0 && !isTooLong && !isSending;

  async function handleSend() {
    if (!canSend) return;
    setIsSending(true);
    setError(null);
    try {
      await onSend(trimmed);
      setValue("");
      textareaRef.current?.focus();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.messaging.loadError);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="border-t border-border/[0.08] p-3">
      <div className="flex items-end gap-2">
        <label className="flex-1">
          <span className="sr-only">{t.messaging.composerAria}</span>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={t.messaging.composerPlaceholder}
            rows={1}
            disabled={isSending}
            data-testid="message-composer-input"
            className="ds-input ds-focus-ring max-h-32 min-h-[2.5rem] w-full resize-none"
          />
        </label>
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          aria-label={t.messaging.sendAria}
          data-testid="message-composer-send"
          className="ds-focus-ring shrink-0 rounded-ds-control bg-accent p-2.5 text-white transition-all hover:brightness-110 disabled:opacity-50"
        >
          <Send size={18} />
        </button>
      </div>
      {isTooLong && (
        <p role="alert" className="mt-1 text-ds-caption text-danger">
          {t.messaging.messageTooLong}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-ds-caption text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
