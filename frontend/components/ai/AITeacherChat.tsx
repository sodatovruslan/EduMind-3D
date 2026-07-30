"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Check, Copy, GraduationCap, Send, Trash2 } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import type { LabAIContext } from "@/lib/ai-context-builder";
import type { LearningProfile } from "@/lib/progress-client";

/**
 * AI Teacher (Stage 3) — виртуальный преподаватель, а не универсальный
 * чат-бот. Каждое сообщение ученика отправляется на бэкенд ВМЕСТЕ с уже
 * собранным AI Context Builder объектом (LabAIContext) — тем же самым,
 * что видно в панели заданий/физики. AI ничего не считает сам: весь
 * teacher-промпт на бэкенде (app/services/ai_service.py) явно требует
 * опираться только на этот JSON. Память разговора живёт только в этом
 * React-состоянии — она пропадает сама, как только ученик покидает
 * страницу лаборатории (компонент размонтируется).
 */
interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

const SUGGESTED_QUESTIONS = [
  "Почему лампа не горит?",
  "Что я сделал неправильно?",
  "Как работает резистор?",
  "Почему ток равен нулю?",
  "Как подключить амперметр?",
  "Почему вольтметр подключается параллельно?",
];

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
      const message = err instanceof ApiError ? err.message : "AI Teacher временно недоступен";
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
    <div className="glass-panel flex h-[34rem] w-full flex-col rounded-2xl lg:w-80" data-testid="ai-teacher-chat">
      <div className="flex items-center justify-between border-b border-glass-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <GraduationCap size={18} className="text-neon-violet" />
          AI-преподаватель
        </div>
        <button
          onClick={() => setMessages([])}
          disabled={messages.length === 0}
          title="Очистить историю"
          data-testid="ai-teacher-clear"
          className="text-slate-400 hover:text-slate-200 disabled:opacity-30"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3" data-testid="ai-teacher-history">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="flex items-start gap-2 text-sm text-slate-400">
              <Bot size={16} className="mt-0.5 shrink-0 text-neon-violet" />
              Привет! Я твой AI-преподаватель по электричеству. Спроси меня о текущем задании или выбери один из
              вопросов ниже.
            </p>
            <div className="flex flex-wrap gap-1.5" data-testid="ai-teacher-suggested">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="rounded-full border border-glass-border px-2.5 py-1 text-xs text-slate-300 transition hover:border-neon-violet hover:text-neon-violet"
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
            className={`group relative rounded-md px-3 py-2 text-sm ${
              message.role === "user" ? "ml-6 bg-neon-violet/20 text-slate-100" : "mr-2 bg-white/5 text-slate-200"
            }`}
          >
            {message.role === "assistant" && (
              <div className="mb-1 flex items-center gap-1 text-xs text-neon-violet">
                <Bot size={12} /> AI-преподаватель
              </div>
            )}
            <p className="whitespace-pre-wrap">{message.text}</p>
            {message.role === "assistant" && (
              <button
                onClick={() => handleCopy(message.text, i)}
                title="Скопировать"
                className="absolute right-1.5 top-1.5 text-slate-500 opacity-0 transition group-hover:opacity-100 hover:text-slate-200"
              >
                {copiedIndex === i ? <Check size={13} /> : <Copy size={13} />}
              </button>
            )}
          </div>
        ))}
        {isLoading && <p className="text-sm text-slate-500">Думаю...</p>}
      </div>

      <div className="flex gap-2 border-t border-glass-border p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isLoading) sendMessage(input);
          }}
          placeholder="Спроси про текущее задание..."
          data-testid="ai-teacher-input"
          className="flex-1 rounded-md border border-glass-border bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-neon-violet focus:outline-none"
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={isLoading || !input.trim()}
          data-testid="ai-teacher-send"
          className="rounded-md bg-neon-violet px-3 py-2 text-white hover:brightness-110 disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
