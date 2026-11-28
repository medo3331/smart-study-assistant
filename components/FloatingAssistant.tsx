"use client";

// components/FloatingAssistant.tsx
//
// 🤖 Magic في كل الموقع — الفقاعة العائمة السريعة (Quick Bubble).
//
// مش مجرد لينك للشات: Magic (الشخصية الكرتونية) بيفتح نافذة صغيرة في نفس
// الصفحة — تسأله أي حاجة سريعة وهو عارف انت فين (بيبعت الـ pathname كسياق)،
// ويرد سطرين عمليين يساعدوك تستخدم الموقع/تذاكر. لو الموضوع محتاج شغل أعمق
// (ملفات، امتحانات، أدوات) بيحولك للشات الكامل بزر واحد.
//
// ⚡ نفس الـ API الموحد (/api/unified-ai) — نفس أدوات Magic Agent والكريديت
//    بيتحسب من السيرفر زي الشات بالظبط.

import { usePathname, useRouter } from "next/navigation";
import { X, SendHorizontal, MessageCircle } from "lucide-react";
import { useRef, useState } from "react";
import MagicAvatar from "@/components/MagicAvatar";
import { AgentArtifacts } from "@/components/unified-ai/AgentArtifacts";
import type { AgentArtifact } from "@/lib/agent/actions";

const pageHint = (pathname: string): string => {
  if (pathname.startsWith("/lesson/")) return "في نقطة مش واضحة في الدرس؟";
  if (pathname.startsWith("/dashboard")) return "عشان نراجع خطتك النهارده؟";
  if (pathname.startsWith("/assessment")) return "محتاج مساعدة في بناء الخطة؟";
  if (pathname.startsWith("/exams")) return "محتاج مساعدة في الامتحانات؟";
  if (pathname.startsWith("/notes")) return "مساعدة في نوتاتك؟";
  if (pathname.startsWith("/missions")) return "نرتب مهامك النهارده؟";
  if (pathname.startsWith("/store")) return "سؤال عن الباقات أو الرصيد؟";
  return "محتاج مساعدة في مذاكرتك؟";
};

interface QuickMsg {
  role: "user" | "assistant";
  content: string;
  creditsUsed?: number;
  artifacts?: AgentArtifact[];
}

export function FloatingAssistant() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<QuickMsg[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  if (pathname === "/chat") return null;

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);
    setMessages((m) => [...m, { role: "user", content: text }]);
    // 📜 لوولّا الكلام كتر، آخر رسالة تبقى ظاهرة
    setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }), 50);
    try {
      const formData = new FormData();
      formData.append("prompt", text);
      formData.append("context", JSON.stringify({ page: pathname, language: "ar", quick: true }));
      formData.append("language", "ar");
      const res = await fetch("/api/unified-ai", { method: "POST", body: formData });
      const data = await res.json().catch(() => null);
      const answer = typeof data?.answer === "string" && data.answer ? data.answer : "حصلت مشكلة مؤقتة — جرب تاني.";
      const artifacts = Array.isArray(data?.artifacts) ? (data.artifacts as AgentArtifact[]) : undefined;
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: answer,
          ...(typeof data?.creditsUsed === "number" ? { creditsUsed: data.creditsUsed } : {}),
          ...(artifacts ? { artifacts } : {}),
        },
      ]);
      setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }), 50);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "مشكلة في الاتصال — جرب تاني." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed start-4 bottom-4 z-40 sm:start-6" dir="rtl">
      {open && (
        <section
          className="sheet-card card-lift mb-3 flex w-[min(92vw,340px)] flex-col overflow-hidden rounded-2xl border border-rule bg-paper shadow-xl"
          aria-labelledby="floating-assistant-title"
        >
          {/* الهيدر — شخصية Magic */}
          <div
            className="flex items-center gap-2 px-3 py-2.5 text-white"
            style={{ background: "linear-gradient(90deg, #7C3AED, #4F46E5)" }}
          >
            <MagicAvatar state={loading ? "thinking" : "speaking"} size="sm" />
            <div className="flex-1">
              <h2 id="floating-assistant-title" className="text-sm font-black leading-tight">
                Magic 🤖
              </h2>
              <p className="text-[10px] opacity-85">{loading ? "بيفكر..." : pageHint(pathname)}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1 hover:bg-white/15" aria-label="إغلاق ماجيك">
              <X size={15} />
            </button>
          </div>

          {/* الرسايل */}
          <div ref={listRef} className="max-h-[280px] min-h-[90px] space-y-2 overflow-y-auto px-3 py-3">
            {messages.length === 0 && (
              <p className="text-xs leading-relaxed text-ink-soft">
                أهلاً! أنا Magic — اسألني أي حاجة من هنا على السريع: إزاي تستخدم الموقع، تنظّم وقتك، أو تفهم حاجة في مذاكرتك ⚡
              </p>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={msg.role === "user" ? "flex justify-start" : "flex justify-end"}>
                <div
                  className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "border border-rule bg-paper-3 text-ink"
                      : "border border-[var(--rule)] bg-[var(--card-primary)] text-ink"
                  }`}
                >
                  {msg.content}
                  {msg.artifacts && msg.artifacts.length > 0 && <AgentArtifacts artifacts={msg.artifacts} />}
                  {typeof msg.creditsUsed === "number" && (
                    <span className="mt-1 block text-[9px] text-ink-soft">⚡ {msg.creditsUsed} credit</span>
                  )}
                </div>
              </div>
            ))}
            {loading && <p className="text-center text-[10px] text-ink-soft">Magic بيرد...</p>}
          </div>

          {/* الإدخال */}
          <div className="flex items-center gap-1.5 border-t border-rule px-2.5 py-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="اكتب سؤالك السريع..."
              className="min-w-0 flex-1 rounded-full border border-rule bg-paper px-3 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
              aria-label="سؤال سريع لماجيك"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={loading || !input.trim()}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white transition hover:opacity-90 disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #7C3AED, #4F46E5)" }}
              aria-label="إرسال"
            >
              <SendHorizontal size={14} />
            </button>
          </div>

          {/* التحويل للشات الكامل */}
          <button
            type="button"
            onClick={() => router.push("/chat")}
            className="flex items-center justify-center gap-1.5 border-t border-rule bg-paper-3 py-2 text-[11px] font-bold text-ink-soft transition hover:bg-paper"
          >
            <MessageCircle size={13} /> موضوع أكبر؟ افتح الشات الكامل
          </button>
        </section>
      )}

      {/* الزر العائم — شخصية Magic نفسها */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative grid h-14 w-14 place-items-center rounded-full bg-paper shadow-[0_8px_26px_rgba(124,58,237,0.45)] ring-2 ring-[#7C3AED]/40 transition hover:scale-105 motion-safe:animate-[pulse_4s_ease-in-out_infinite]"
        aria-label="افتح ماجيك — المساعد السريع"
        aria-expanded={open}
      >
        <MagicAvatar state={open ? "speaking" : "idle"} size="md" />
        {!open && (
          <span className="absolute -end-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-paper bg-emerald-500" aria-hidden />
        )}
      </button>
    </div>
  );
}
