"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Send, X } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

interface AIAssistantChatProps {
  simulationId: string;
  sceneStateDescription: string;
}

// плавающий стеклянный чат с ИИ-лаборантом — рендерится поверх 3D-канваса в каждой сцене
export default function AIAssistantChat({ simulationId, sceneStateDescription }: AIAssistantChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleAsk() {
    const userQuestion = question.trim();
    setIsLoading(true);
    setQuestion("");
    setMessages((prev) => [
      ...prev,
      { role: "user", text: userQuestion || "Дай подсказку по текущему состоянию" },
    ]);

    // backend ждет один текстовый scene_state — склеиваем описание сцены с вопросом ученика
    const scenePrompt = userQuestion ? `${sceneStateDescription} Вопрос ученика: ${userQuestion}` : sceneStateDescription;

    try {
      const response = await apiFetch<{ hint: string }>("/api/ai/hint", {
        method: "POST",
        body: JSON.stringify({ simulation_id: simulationId, scene_state: scenePrompt }),
      });
      setMessages((prev) => [...prev, { role: "assistant", text: response.hint }]);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "ИИ-ассистент временно недоступен";
      setMessages((prev) => [...prev, { role: "assistant", text: message }]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="absolute bottom-4 right-4 z-10">
      <AnimatePresence mode="wait">
        {!isOpen && (
          <motion.button
            key="chat-toggle"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-2 rounded-full bg-brand px-4 py-3 text-sm font-medium text-white shadow-lg shadow-brand/40 hover:bg-brand-dark"
          >
            <Bot size={18} />
            AI-лаборант
          </motion.button>
        )}

        {isOpen && (
          <motion.div
            key="chat-panel"
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.95 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="flex h-96 w-80 flex-col rounded-xl border border-white/15 bg-slate-900/70 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <Bot size={18} className="text-brand" />
                AI-лаборант
              </div>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {messages.length === 0 && (
                <p className="text-sm text-slate-400">
                  Спроси подсказку по текущему шагу — я подскажу, не выдавая прямой ответ.
                </p>
              )}
              {messages.map((message, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  className={`rounded-md px-3 py-2 text-sm ${
                    message.role === "user" ? "ml-6 bg-brand/20 text-slate-100" : "mr-6 bg-white/10 text-slate-200"
                  }`}
                >
                  {message.text}
                </motion.div>
              ))}
              {isLoading && <p className="text-sm text-slate-500">Думаю...</p>}
            </div>

            <div className="flex gap-2 border-t border-white/10 p-3">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isLoading) handleAsk();
                }}
                placeholder="Спросить про текущий шаг..."
                className="flex-1 rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand focus:outline-none"
              />
              <button
                onClick={handleAsk}
                disabled={isLoading}
                className="rounded-md bg-brand px-3 py-2 text-white hover:bg-brand-dark disabled:opacity-50"
              >
                <Send size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
