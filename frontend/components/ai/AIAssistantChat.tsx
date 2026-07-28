"use client";

import { useState } from "react";
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

// плавающий чат с ИИ-лаборантом — рендерится поверх 3D-канваса в каждой сцене
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

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="absolute bottom-4 right-4 z-10 flex items-center gap-2 rounded-full bg-brand px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-brand-dark"
      >
        <Bot size={18} />
        AI-лаборант
      </button>
    );
  }

  return (
    <div className="absolute bottom-4 right-4 z-10 flex h-96 w-80 flex-col rounded-lg border border-gray-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Bot size={18} className="text-brand" />
          AI-лаборант
        </div>
        <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400">
            Спроси подсказку по текущему шагу — я подскажу, не выдавая прямой ответ.
          </p>
        )}
        {messages.map((message, i) => (
          <div
            key={i}
            className={`rounded-md px-3 py-2 text-sm ${
              message.role === "user" ? "ml-6 bg-brand/10 text-gray-900" : "mr-6 bg-gray-100 text-gray-700"
            }`}
          >
            {message.text}
          </div>
        ))}
        {isLoading && <p className="text-sm text-gray-400">Думаю...</p>}
      </div>

      <div className="flex gap-2 border-t border-gray-200 p-3">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isLoading) handleAsk();
          }}
          placeholder="Спросить про текущий шаг..."
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        <button
          onClick={handleAsk}
          disabled={isLoading}
          className="rounded-md bg-brand px-3 py-2 text-white hover:bg-brand-dark disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
