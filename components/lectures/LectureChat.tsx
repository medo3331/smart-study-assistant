"use client";

import { useState } from "react";

export default function LectureChat({ lectureId, contextText }: { lectureId: string; contextText: string }) {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", content: userMsg }]);
    setLoading(true);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, { role: "user", content: userMsg }].map((m) => ({ role: m.role, content: m.content })),
          systemInstruction: `أنت مساعد تعليمي. اشرح وأجب عن أسئلة الطالب بناءً على النص المُراجع للمحاضرة التالية:\n\n${contextText}\n\nأجب بالعربية بوضوح.`,
        }),
      });
      const data = await res.json();
      const answer = data?.choices?.[0]?.message?.content ?? data?.content ?? data?.message ?? "—";
      setMessages((m) => [...m, { role: "assistant", content: answer }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "حدث خطأ." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-[var(--rule)] bg-[var(--app-bg)] p-3 space-y-2">
      <h3 className="text-sm font-bold text-ink">💬 محادثة حول المحاضرة</h3>
      <div className="max-h-64 overflow-auto space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={`rounded-lg p-2 text-sm ${m.role === "user" ? "bg-indigo-500/10 text-ink" : "bg-black/5 text-ink dark:bg-white/10"}`}>
            {m.content}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="اسأل عن المحاضرة…"
          className="flex-1 rounded-lg border border-[var(--rule)] bg-[var(--card-primary)] px-2 py-1 text-sm text-ink"
        />
        <button onClick={send} disabled={loading} className="rounded-lg bg-indigo-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50">
          {loading ? "…" : "إرسال"}
        </button>
      </div>
    </div>
  );
}