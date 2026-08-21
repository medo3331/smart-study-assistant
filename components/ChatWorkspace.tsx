"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, Bot, ClipboardCheck, LoaderCircle, Send, Sparkles, Target } from "lucide-react";
import { MicButton } from "@/components/MicButton";

type ChatMessage = { role: "user" | "assistant"; content: string };
type SuggestedAgent = "marketing" | "research" | "content";
type ChatContext = {
  name: string;
  subject: string;
  configId: string | null;
  lesson: { id: string; day: number; topic: string } | null;
  progress: { completed: number; total: number };
};

const WELCOME = "أهلاً! أنا هنا عشان نكمّل خطتك أو نفهم أي نقطة واقفة معاك.";

export function ChatWorkspace() {
  const router = useRouter();
  const [context, setContext] = useState<ChatContext | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: WELCOME }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextError, setContextError] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [suggestedAgent, setSuggestedAgent] = useState<SuggestedAgent | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/chat/context")
      .then(async (response) => {
        if (!response.ok) throw new Error("context unavailable");
        return response.json() as Promise<ChatContext>;
      })
      .then((data) => active && setContext(data))
      .catch(() => active && setContextError(true));
    return () => { active = false; };
  }, []);

  const actions = useMemo(() => [
    context?.lesson && {
      label: `كمّل ${context.lesson.topic}`,
      description: "افتح الدرس الحالي",
      icon: BookOpen,
      onClick: () => router.push(`/lesson/${context.lesson!.id}`),
    },
    context?.lesson && {
      label: "اختبرني في الدرس",
      description: "ابدأ سؤالًا واحدًا بالتدريج",
      icon: ClipboardCheck,
      onClick: () => void send("اختبرني في الدرس الحالي بسؤال واحد في كل مرة.", "quiz"),
    },
    {
      label: "راجع اللي ذاكرته",
      description: "مراجعة سريعة لأهم النقاط",
      icon: Target,
      onClick: () => contextError
        ? router.push("/login?next=/chat")
        : void send("راجع معايا أهم النقاط اللي ذاكرتها، وابدأ بالأكثر عرضة للّبس.", "review"),
    },
  ].filter(Boolean) as Array<{ label: string; description: string; icon: typeof BookOpen; onClick: () => void }> , [context]);

  async function send(text = input, mode?: "quiz" | "review") {
    const content = text.trim();
    if (!content || loading) return;
    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages(nextMessages);
    setSuggestedAgent(null);
    setInput("");
    setLoading(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          mode,
          conversationId: conversationId ?? undefined,
          context: context ? {
            configId: context.configId ?? undefined,
            lessonDay: context.lesson?.day,
            subject: context.subject,
            lesson: context.lesson?.topic,
          } : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || "حصلت مشكلة في إرسال الرسالة.");
      const reply = data?.choices?.[0]?.message?.content;
      if (!reply) throw new Error("الرد وصل ناقص. جرّب تاني.");
      setMessages((previous) => [...previous, { role: "assistant", content: reply }]);
      if (typeof data.conversationId === "string") setConversationId(data.conversationId);
      if (data.suggestedAgent === "marketing" || data.suggestedAgent === "research" || data.suggestedAgent === "content") {
        setSuggestedAgent(data.suggestedAgent);
      }
    } catch (error) {
      setMessages((previous) => [...previous, { role: "assistant", content: error instanceof Error ? error.message : "حصلت مشكلة. جرّب تاني." }]);
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send();
  }

  return (
    <main className="min-h-screen bg-paper text-ink" dir="rtl">
      <header className="border-b border-rule bg-paper/95 px-4 py-4 backdrop-blur sm:px-7">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link href="/dashboard" className="btn btn-quiet text-sm"><ArrowRight size={16} /> الداشبورد</Link>
          <div className="text-center"><p className="font-display text-xl font-extrabold">ماجيكلي <span className="text-marker">✦</span></p><p className="text-xs text-ink-soft">مساعدك الذكي للمذاكرة</p></div>
          <Link href="/dashboard" className="grid h-10 w-10 place-items-center rounded-full border border-rule bg-paper-2" aria-label="حسابك">👤</Link>
        </div>
      </header>

      <div className="mx-auto grid min-h-[calc(100vh-5.25rem)] max-w-6xl lg:grid-cols-[1fr_17rem]">
        <section className="flex min-h-0 flex-col border-rule lg:border-e">
          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-8 sm:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="mb-2 text-3xl" aria-hidden>✨</p>
              <h1 className="h2">{context?.name ? `أهلاً يا ${context.name} 👋` : "أهلاً بيك 👋"}</h1>
              <p className="mt-2 text-sm text-ink-soft">{context?.lesson ? "نكمل خطتك ولا نشتغل على حاجة معينة؟" : "حابب نشتغل على إيه النهارده؟"}</p>
            </div>

            {contextError && <p className="notice notice-error max-w-2xl mx-auto text-sm">سجّل دخولك عشان المساعد يقدر يربط السؤال بخطتك. <Link href="/login?next=/chat" className="underline font-bold">تسجيل الدخول</Link></p>}
            {context?.subject && <p className="mx-auto max-w-2xl text-center text-xs text-ink-soft">{context.subject} · {context.progress.completed}/{context.progress.total} دروس مكتملة</p>}

            {messages.length === 1 && (
              <div className="mx-auto grid max-w-2xl gap-3 sm:grid-cols-3">
                {actions.map(({ label, description, icon: Icon, onClick }) => (
                  <button key={label} type="button" onClick={onClick} className="sheet-card card-lift p-4 text-right transition hover:border-ink-soft">
                    <Icon size={20} className="mb-5 text-marker" aria-hidden />
                    <p className="font-bold text-sm">{label}</p><p className="mt-1 text-xs text-ink-soft">{description}</p>
                  </button>
                ))}
              </div>
            )}

            <div className="mx-auto max-w-2xl space-y-4 pb-6">
              {messages.map((message, index) => (
                <article key={`${message.role}-${index}`} className={`flex gap-3 ${message.role === "user" ? "justify-start" : "justify-end"}`}>
                  {message.role === "assistant" && <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-paper-2"><Bot size={18} /></span>}
                  <p className={`max-w-[85%] whitespace-pre-wrap rounded-[var(--r-md)] px-4 py-3 text-sm leading-7 ${message.role === "user" ? "bg-marker text-onmarker" : "border border-rule bg-paper-2"}`}>{message.content}</p>
                </article>
              ))}
              {suggestedAgent && !loading && (
                <div className="mx-auto max-w-2xl border border-rule bg-paper-2 rounded-[var(--r-md)] p-3 text-sm flex items-center justify-between gap-3">
                  <p className="text-ink-soft">المطلوب ده مناسب لـ {suggestedAgent === "marketing" ? "Marketing" : suggestedAgent === "research" ? "Research" : "Content"} Agent.</p>
                  <Link href={`/dashboard/agents?agent=${suggestedAgent}`} className="btn btn-quiet text-xs shrink-0">ابدأ</Link>
                </div>
              )}
              {loading && <div className="flex justify-end gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-paper-2"><Bot size={18} /></span><p className="border border-rule bg-paper-2 rounded-[var(--r-md)] px-4 py-3"><LoaderCircle className="animate-spin" size={18} /></p></div>}
            </div>
          </div>

          <form onSubmit={submit} className="border-t border-rule bg-paper p-4 sm:px-8">
            <div className="mx-auto flex max-w-2xl items-center gap-2 rounded-[var(--r-md)] border border-rule bg-paper-2 p-2 shadow-sm">
              <MicButton variant="square" disabled={loading} onText={setInput} />
              <label className="sr-only" htmlFor="chat-message">اكتب سؤالك</label>
              <input id="chat-message" value={input} onChange={(event) => setInput(event.target.value)} placeholder="اكتب سؤالك هنا…" className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-ink-soft" disabled={loading} />
              <button type="submit" className="btn btn-marker grid h-10 w-10 place-items-center rounded-full p-0" disabled={loading || !input.trim()} aria-label="إرسال السؤال"><Send size={17} /></button>
            </div>
          </form>
        </section>

        <aside className="hidden bg-paper-2 p-5 lg:block">
          <button type="button" onClick={() => { setMessages([{ role: "assistant", content: WELCOME }]); setConversationId(null); setSuggestedAgent(null); }} className="btn btn-marker w-full"><Sparkles size={16} /> محادثة جديدة</button>
          <div className="mt-8 border-t border-rule pt-5"><p className="tag mb-3">أدوات الدراسة</p><div className="space-y-2 text-sm text-ink-soft"><p>📄 تلخيص الملفات</p><p>🧠 إنشاء الاختبارات</p><p>📖 شرح الدروس</p><p>🗓️ خطة المذاكرة</p></div></div>
        </aside>
      </div>
    </main>
  );
}
