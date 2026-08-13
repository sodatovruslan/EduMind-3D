"use client";

import { X } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import type { ConversationParticipant } from "@/lib/messaging-client";
import { GlassPanel } from "@/components/design-system";

export default function NewConversationPicker({
  counterparts,
  onPick,
  onClose,
}: {
  counterparts: ConversationParticipant[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useLocale();
  return (
    <GlassPanel className="mb-3 max-h-56 overflow-y-auto rounded-ds-panel p-2" data-testid="new-conversation-picker">
      <div className="mb-1 flex items-center justify-between px-2">
        <p className="text-ds-caption font-semibold uppercase tracking-widest text-text-muted">{t.messaging.pickCounterpartTitle}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.messaging.backToConversations}
          className="ds-focus-ring rounded-ds-control text-text-muted transition-colors hover:text-text-primary"
        >
          <X size={14} />
        </button>
      </div>
      <ul>
        {counterparts.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onPick(c.id)}
              data-testid={`counterpart-${c.id}`}
              className="ds-focus-ring w-full rounded-ds-control px-2 py-2 text-left text-ds-body text-text-primary transition-colors hover:bg-text-primary/5"
            >
              {c.full_name}
            </button>
          </li>
        ))}
      </ul>
    </GlassPanel>
  );
}
