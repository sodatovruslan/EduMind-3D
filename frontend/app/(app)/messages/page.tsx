"use client";

import { useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useLocale } from "@/lib/locale-context";
import ConversationList from "@/components/messaging/ConversationList";
import ConversationView from "@/components/messaging/ConversationView";

export default function MessagesPage() {
  return (
    <ProtectedRoute allowedRoles={["student", "teacher"]}>
      <MessagesShell />
    </ProtectedRoute>
  );
}

/**
 * T5 — Student <-> Teacher human messaging (NOT the AI Teacher/AI
 * Assistant chat living inside the labs). Desktop: conversation list +
 * active conversation side by side. Below `lg:`, only one is visible at a
 * time — selecting a conversation swaps the list out for the conversation
 * view with a back control, the same mobile pattern the Teacher Center
 * (D7) already established for its own directory/detail split.
 */
function MessagesShell() {
  const { t } = useLocale();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] min-h-[28rem] max-w-[90rem] flex-col gap-4">
      <div>
        <h1 className="text-ds-display text-text-primary">{t.messaging.title}</h1>
        <p className="mt-1 text-ds-body text-text-secondary">{t.messaging.subtitle}</p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[22rem_1fr]">
        <div data-testid="conversation-list-pane" className={selectedId ? "hidden lg:block" : "block"}>
          <ConversationList selectedId={selectedId} onSelect={setSelectedId} className="h-full" />
        </div>
        <div data-testid="conversation-view-pane" className={selectedId ? "block" : "hidden lg:block"}>
          <ConversationView conversationId={selectedId} onBack={() => setSelectedId(null)} />
        </div>
      </div>
    </div>
  );
}
