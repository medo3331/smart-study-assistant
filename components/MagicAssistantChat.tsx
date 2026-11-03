import React, { useState } from "react";
import { buildAssistantPrompt } from "@/lib/magic-assistant/prompt";

interface MagicAssistantChatProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MagicAssistantChat({ isOpen, onClose }: MagicAssistantChatProps) {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/magic-assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });

      const data = await res.json();

      if (data.ok && data.response?.text) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.response.text }]);
      } else {
        setMessages((prev) => prev.concat({ role: "assistant", content: "عذراً، المرشد مشغول حالياً. جرب تاني." }));
      }
    } catch (e) {
      console.error("[magic-assistant] fetch error", e);
      setMessages((prev) => prev.concat({ role: "assistant", content: "عذراً، المرشد مشغول حالياً. جرب تاني." }));
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed bottom-6 left-6 right-6 z-50 max-w-md mx-auto"
        aria-modal="true"
      >
      <div
        className="bg-paper rounded-[var(--r-sm)] shadow-lg border border-rule p-5 transform transition-transform scale-100"
      >
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-semibold text-ink">Magic Assistant</h4>
          <button
            onClick={onClose}
            className="text-text-soft hover:opacity-70 text-sm"
            aria-label="إغلاق"
          >
            ✕
          </button>
        </div>

        <div className="h-96 overflow-y-auto space-y-2" aria-label="محادثة">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-[var(--r-sm)] ${
                msg.role === "user" ? "bg-emerald-100 self-end" : "bg-paper self-start"
              }`}
            >
              <p className="text-sm {msg.role === "user" ? "text-emink" : "text-ink"}">
                {msg.content}
              </p>
            </div>
          ))}

          {!messages.length ? (
            <p className="text-text-soft text-center py-4">ابدأ بكتابة سؤال أو اضغط على أحد الاقتراحات</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="اكتب سؤالك هنا..."
          className="flex-1 bg-paper border border-rule rounded-[var(--r-sm)] px-3 py-2 text-xs text-ink placeholder:text-text-soft focus:outline-none focus:border-rule-strong"
          aria-label="كتابة رسالة"
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim()}
          className="px-4 py-2 bg-emerald-600 text-white rounded-[var(--r-sm)] hover:bg-emerald-700 transition"
          aria-label="إرسال"
        >
          أرسل
        </button>
      </div>
    </>
  );
}