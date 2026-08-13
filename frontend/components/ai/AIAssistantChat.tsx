"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useLocale } from "@/lib/locale-context";
import AITeacherDock from "@/components/simulation/AITeacherDock";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

interface AIAssistantChatProps {
  simulationId: string;
  sceneStateDescription: string;
}

/**
 * D10 — migrated onto Design V2 (was the last component still on the
 * pre-D1 legacy palette — `bg-brand`, `bg-slate-900/70`, `border-white/15`,
 * `text-slate-*`, `bg-white/10` — deliberately deferred out of D9 to keep
 * that pass reviewable). Reuses the exact same `AITeacherDock` collapsible
 * floating-chrome pattern Chemistry/Electricity's AI Teacher chats already
 * use (D6), with its own copy (`t.aiAssistant.*`) instead of "AI Teacher" —
 * this is a different persona and backend contract (`POST /api/ai/hint`,
 * a single free-text `scene_state`, no AI Context Builder/learning
 * profile), not a copy-paste of AITeacherChat. Request/response handling
 * is byte-identical to before this stage; only presentation changed.
 */
export default function AIAssistantChat({ simulationId, sceneStateDescription }: AIAssistantChatProps) {
  const { t } = useLocale();
  const c = t.aiAssistant;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  async function handleAsk() {
    const userQuestion = question.trim();
    setIsLoading(true);
    setQuestion("");
    setMessages((prev) => [...prev, { role: "user", text: userQuestion || c.defaultQuestion }]);

    // backend ждет один текстовый scene_state — склеиваем описание сцены с вопросом ученика
    const scenePrompt = userQuestion ? `${sceneStateDescription} ${c.studentQuestionPrefix} ${userQuestion}` : sceneStateDescription;

    try {
      const response = await apiFetch<{ hint: string }>("/api/ai/hint", {
        method: "POST",
        body: JSON.stringify({ simulation_id: simulationId, scene_state: scenePrompt }),
      });
      setMessages((prev) => [...prev, { role: "assistant", text: response.hint }]);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : c.unavailable;
      setMessages((prev) => [...prev, { role: "assistant", text: message }]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AITeacherDock triggerLabel={c.trigger} expandAria={c.expand} collapseAria={c.collapse}>
      <div className="ds-glass flex h-96 w-full flex-col rounded-ds-panel shadow-ds-md" data-testid="ai-assistant-chat">
        <div className="flex items-center gap-2 border-b border-border/[0.08] px-4 py-3 text-ds-body font-semibold text-text-primary">
          <Bot size={18} className="text-accent" />
          {c.header}
        </div>

        <div
          ref={scrollRef}
          role="log"
          aria-live="polite"
          className="flex-1 space-y-2 overflow-y-auto p-3"
          data-testid="ai-assistant-history"
        >
          {messages.length === 0 && <p className="text-ds-body text-text-secondary">{c.greeting}</p>}
          {messages.map((message, i) => (
            <div
              key={i}
              className={`rounded-ds-control px-3 py-2 text-ds-body ${
                message.role === "user" ? "ml-6 bg-accent/15 text-text-primary" : "mr-2 bg-text-primary/5 text-text-primary"
              }`}
            >
              {message.text}
            </div>
          ))}
          {isLoading && <p className="text-ds-body text-text-muted">{c.thinking}</p>}
        </div>

        <div className="flex gap-2 border-t border-border/[0.08] p-3">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isLoading) handleAsk();
            }}
            placeholder={c.inputPlaceholder}
            aria-label={c.inputPlaceholder}
            data-testid="ai-assistant-input"
            className="ds-input ds-focus-ring flex-1"
          />
          <button
            onClick={handleAsk}
            disabled={isLoading}
            aria-label={c.sendAria}
            data-testid="ai-assistant-send"
            className="ds-focus-ring rounded-ds-control bg-accent px-3 py-2 text-white transition-all hover:brightness-110 disabled:opacity-50"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </AITeacherDock>
  );
}
