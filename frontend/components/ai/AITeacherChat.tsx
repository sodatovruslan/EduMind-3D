"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Check, Copy, GraduationCap, Send, Trash2 } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import type { LabAIContext } from "@/lib/ai-context-builder";
import type { LearningProfile } from "@/lib/progress-client";
import { useLocale } from "@/lib/locale-context";

/**
 * AI Teacher (Stage 3) — виртуальный преподаватель, а не универсальный
 * чат-бот. Каждое сообщение ученика отправляется на бэкенд ВМЕСТЕ с уже
 * собранным AI Context Builder объектом (LabAIContext) — тем же самым,
 * что видно в панели заданий/физики. AI ничего не считает сам: весь
 * teacher-промпт на бэкенде (app/services/ai_service.py) явно требует
 * опираться только на этот JSON. Память разговора живёт только в этом
 * React-состоянии — она пропадает сама, как только ученик покидает
 * страницу лаборатории (компонент размонтируется).
 *
 * D6.1 — moved from the legacy `.glass-panel`/`slate-*`/`neon-violet`
 * palette onto D1 tokens and onto `useLocale()`/t.electricity.aiChat.*,
 * same treatment as its Chemistry sibling. AI request/response handling,
 * context shape, and the backend contract are untouched.
 */
interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

interface AITeacherChatProps {
  simulationId: string;
  context: LabAIContext;
  // Stage 4, необязательно: уже посчитанный Learning Profile — если есть,
  // отправляется вместе с AI Context Builder, чтобы AI мог говорить про
  // прогресс ("ты уже уверенно собираешь простые цепи"), а не только про
  // текущее состояние схемы
  learningProfile?: LearningProfile | null;
  onMessageSent?: () => void;
}

export default function AITeacherChat({ simulationId, context, learningProfile, onMessageSent }: AITeacherChatProps) {
  const { t } = useLocale();
  const c = t.electricity.aiChat;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  async function sendMessage(text: string) {
    const studentMessage = text.trim();
    if (!studentMessage || isLoading) return;

    const history = messages.slice(-10).map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [...prev, { role: "user", text: studentMessage }]);
    setInput("");
    setIsLoading(true);
    onMessageSent?.();

    try {
      const response = await apiFetch<{ reply: string }>("/api/ai/teacher", {
        method: "POST",
        body: JSON.stringify({
          simulation_id: simulationId,
          student_message: studentMessage,
          context,
          history,
          learning_profile: learningProfile ?? null,
        }),
      });
      setMessages((prev) => [...prev, { role: "assistant", text: response.reply }]);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : c.unavailable;
      setMessages((prev) => [...prev, { role: "assistant", text: message }]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleCopy(text: string, index: number) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex((i) => (i === index ? null : i)), 1500);
    });
  }

  return (
    <div className="ds-glass flex h-[34rem] w-full flex-col rounded-ds-panel shadow-ds-md" data-testid="ai-teacher-chat">
      <div className="flex items-center justify-between border-b border-border/[0.08] px-4 py-3">
        <div className="flex items-center gap-2 text-ds-body font-semibold text-text-primary">
          <GraduationCap size={18} className="text-accent" />
          {c.header}
        </div>
        <button
          onClick={() => setMessages([])}
          disabled={messages.length === 0}
          title={c.clearHistory}
          data-testid="ai-teacher-clear"
          className="ds-focus-ring rounded-ds-control text-text-muted transition-colors hover:text-text-primary disabled:opacity-30"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        className="flex-1 space-y-2 overflow-y-auto p-3"
        data-testid="ai-teacher-history"
      >
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="flex items-start gap-2 text-ds-body text-text-secondary">
              <Bot size={16} className="mt-0.5 shrink-0 text-accent" />
              {c.greeting}
            </p>
            <div className="flex flex-wrap gap-1.5" data-testid="ai-teacher-suggested">
              {c.suggestedQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="ds-focus-ring rounded-full border border-border/[0.12] px-2.5 py-1 text-ds-caption text-text-secondary transition-colors hover:border-accent hover:text-accent"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, i) => (
          <div
            key={i}
            className={`group relative rounded-ds-control px-3 py-2 text-ds-body ${
              message.role === "user" ? "ml-6 bg-accent/15 text-text-primary" : "mr-2 bg-text-primary/5 text-text-primary"
            }`}
          >
            {message.role === "assistant" && (
              <div className="mb-1 flex items-center gap-1 text-ds-caption text-accent">
                <Bot size={12} /> {c.header}
              </div>
            )}
            <p className="whitespace-pre-wrap">{message.text}</p>
            {message.role === "assistant" && (
              <button
                onClick={() => handleCopy(message.text, i)}
                title={c.copy}
                className="ds-focus-ring absolute right-1.5 top-1.5 rounded-ds-control text-text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-text-primary"
              >
                {copiedIndex === i ? <Check size={13} /> : <Copy size={13} />}
              </button>
            )}
          </div>
        ))}
        {isLoading && <p className="text-ds-body text-text-muted">{c.thinking}</p>}
      </div>

      <div className="flex gap-2 border-t border-border/[0.08] p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isLoading) sendMessage(input);
          }}
          placeholder={c.inputPlaceholder}
          data-testid="ai-teacher-input"
          className="ds-input ds-focus-ring flex-1"
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={isLoading || !input.trim()}
          aria-label={c.sendAria}
          data-testid="ai-teacher-send"
          className="ds-focus-ring rounded-ds-control bg-accent px-3 py-2 text-white transition-all hover:brightness-110 disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
