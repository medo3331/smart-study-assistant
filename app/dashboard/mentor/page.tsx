"use client";

/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bot, LoaderCircle, Send, Sparkles, Trash2 } from "lucide-react";
import { PageShell, EmptyState, LoadingSheets } from "../components/PageShell";
import { useAuthUser, formatArabicDate } from "../components/use-page-data";
import { createClient } from "@/lib/supabase/client";

type ChatMessage = { role: "user" | "assistant"; content: string };

type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
};

const WELCOME =
  "أهلاً! أنا ماجيكلي، مساعدك الشخصي. اسألني عن أي درس، أو اطلب شرحاً، اختباراً، أو مراجعة — وأنا هنا لمساعدتك.";

const MAX_MESSAGES = 30;

export default function MentorPage() {
  const { supabase, session } = useAuthUser();

  const [isLoading, setIsLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: WELCOME },
  ]);
  const [input, setInput] = useState("");
  const [memories, setMemories] = useState<Array<{ kind: string; value: string; updated_at: string }>>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [editingMemory, setEditingMemory] = useState<{ kind: string; value: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingMemory, setDeletingMemory] = useState<{ kind: string; value: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    if (session.status !== "ready") return;
    try {
      const { data, error } = await supabase
        .from("chat_conversations")
        .select("id, title, created_at, updated_at")
        .eq("user_id", session.user.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      setConversations((data ?? []).map((c) => ({ ...c, message_count: 0 })));
    } catch (err) {
      console.warn("mentor: could not load conversations", err);
    } finally {
      setIsLoading(false);
    }
  }, [session, supabase]);

  const loadMemories = useCallback(async () => {
    if (session.status !== "ready") return;
    setMemoryLoading(true);
    setMemoryError(null);
    try {
      const response = await fetch("/api/ai/memory");
      if (!response.ok) throw new Error("memory_load_failed");
      const data = await response.json();
      setMemories(data.memories ?? []);
    } catch {
      setMemoryError("تعذر تحميل الذاكرة.");
    } finally {
      setMemoryLoading(false);
    }
  }, [session.status]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  const deleteMemory = async (memory: { kind: string; value: string }) => {
    if (!confirm("هل تريد حذف هذه الذاكرة؟")) return;
    setDeletingMemory(memory);
    try {
      const response = await fetch("/api/ai/memory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: memory.kind, value: memory.value }),
      });
      if (!response.ok) throw new Error("memory_delete_failed");
      setMemories((prev) => prev.filter((m) => !(m.kind === memory.kind && m.value === memory.value)));
    } catch {
      alert("تعذر حذف الذاكرة.");
    } finally {
      setDeletingMemory(null);
    }
  };

  const startEditMemory = (memory: { kind: string; value: string }) => {
    setEditingMemory(memory);
    setEditValue(memory.value);
  };

  const saveEditMemory = async () => {
    if (!editingMemory) return;
    const newValue = editValue.trim();
    if (!newValue) return;
    try {
      const response = await fetch("/api/ai/memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: editingMemory.kind, oldValue: editingMemory.value, newValue }),
      });
      if (!response.ok) throw new Error("memory_update_failed");
      setMemories((prev) =>
        prev.map((m) =>
          m.kind === editingMemory.kind && m.value === editingMemory.value
            ? { ...m, value: newValue, updated_at: new Date().toISOString() }
            : m
        )
      );
      setEditingMemory(null);
      setEditValue("");
    } catch {
      alert("تعذر تعديل الذاكرة.");
    }
  };

  useEffect(() => {
    if (!activeConversationId || session.status !== "ready") return;
    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("chat_messages")
          .select("role, content")
          .eq("conversation_id", activeConversationId)
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: true });
        if (error) throw error;
        const msgs: ChatMessage[] =
          (data ?? []).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })) ?? [];
        if (active) setMessages(msgs.length > 0 ? msgs : [{ role: "assistant", content: WELCOME }]);
      } catch (err) {
        console.warn("mentor: could not load messages", err);
      }
    })();
    return () => { active = false; };
  }, [activeConversationId, session, supabase]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleNewConversation = async () => {
    if (session.status !== "ready") return;
    try {
      const { data, error } = await supabase
        .from("chat_conversations")
        .insert({ user_id: session.user.id, title: "محادثة جديدة" })
        .select("id, title, created_at, updated_at")
        .single();
      if (error) throw error;
      const conv: Conversation = { ...data, message_count: 0 };
      setConversations((prev) => [conv, ...prev]);
      setActiveConversationId(conv.id);
      setMessages([{ role: "assistant", content: WELCOME }]);
      setInput("");
    } catch (err) {
      console.error("mentor: new conversation failed", err);
      alert("ما قدرناش ننشئ محادثة جديدة. حاول تاني.");
    }
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    setMessages([{ role: "assistant", content: WELCOME }]);
    setInput("");
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("هل تريد حذف هذه المحادثة؟")) return;
    try {
      const { error } = await supabase
        .from("chat_conversations")
        .delete()
        .eq("id", id)
        .eq("user_id", session.status === "ready" ? session.user.id : "");
      if (error) throw error;
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setMessages([{ role: "assistant", content: WELCOME }]);
      }
    } catch (err) {
      console.error("mentor: delete failed", err);
      alert("ما قدرناش نحذف المحادثة.");
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = input.trim();
    if (!content || sending) return;

    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.slice(-MAX_MESSAGES),
          mode: undefined,
          conversationId: activeConversationId ?? undefined,
          context: {},
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || "فشل الإرسال");
      }

      const data = await response.json();
      const answer = data.content || data.message || "حدث خطأ في الرد.";

      setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
      if (data.conversationId && !activeConversationId) {
        setActiveConversationId(data.conversationId);
      }
    } catch (err) {
      console.error("mentor: send failed", err);
      alert(err instanceof Error ? err.message : "حصل خطأ أثناء الإرسال، حاول تاني.");
    } finally {
      setSending(false);
    }
  };

  if (session.status === "loading") {
    return (
      <PageShell eyebrow="المعلم الشخصي" title="ماجيكلي">
        <LoadingSheets count={3} />
      </PageShell>
    );
  }

  if (session.status !== "ready") {
    return (
      <PageShell eyebrow="المعلم الشخصي" title="ماجيكلي">
        <EmptyState
          icon="🔐"
          title="لازم تسجل دخول أولاً"
          body="افتح صفحة المعلم الشخصي بعد تسجيل الدخول."
        />
      </PageShell>
    );
  }

  if (isLoading) {
    return (
      <PageShell eyebrow="المعلم الشخصي" title="ماجيكلي">
        <LoadingSheets count={3} />
      </PageShell>
    );
  }

  const activeConversation = conversations.find((c) => c.id === activeConversationId);


  return (
    <PageShell eyebrow="المعلم الشخصي" title="ماجيكلي">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-220px)]">
        <aside className="lg:col-span-3 space-y-4 border border-rule rounded-[var(--r-lg)] bg-paper-2 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-ink">أرشيف الجلسات</h2>
            <button
              onClick={handleNewConversation}
              className="btn btn-marker text-xs shrink-0"
              aria-label="محادثة جديدة"
            >
              <Sparkles size={14} /> جديد
            </button>
          </div>
          {conversations.length === 0 ? (
            <EmptyState icon="💬" title="لا توجد جلسات بعد" body="ابدأ محادثة جديدة وسيتم حفظها هنا تلقائياً." />
          ) : (
            <div className="space-y-2">
              {conversations.map((conv) => (
                <button key={conv.id} onClick={() => handleSelectConversation(conv.id)} className={`flex items-center gap-3 px-3 py-2.5 rounded-[var(--r-md)] text-right transition ${activeConversationId === conv.id ? "bg-marker text-onmarker border border-marker" : "bg-paper text-ink-soft hover:bg-rule border border-transparent"}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{conv.title}</p>
                    <p className="text-[10px] text-ink-soft truncate">{formatArabicDate(conv.updated_at)}</p>
                  </div>
                  <button onClick={(e) => handleDeleteConversation(conv.id, e)} className="shrink-0 opacity-0 group-hover:opacity-100 transition" aria-label="حذف المحادثة"><Trash2 size={14} /></button>
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 rounded-[var(--r-md)] border border-rule bg-paper-2 p-3">
            <p className="text-sm font-semibold text-ink mb-2">ذاكرة التعلم</p>
            {memoryLoading ? (
              <p className="text-xs text-ink-soft">جارٍ تحميل الذاكرة...</p>
            ) : memoryError ? (
              <p className="text-xs text-red-600">{memoryError}</p>
            ) : memories.length === 0 ? (
              <p className="text-xs text-ink-soft">لا توجد ذكريات محفوظة بعد.</p>
            ) : (
              <div className="space-y-2">
                {memories.map((memory) => (
                  <div key={`${memory.kind}-${memory.value}`} className="rounded border border-rule bg-paper p-2">
                    {editingMemory?.kind === memory.kind && editingMemory?.value === memory.value ? (
                      <div className="space-y-2">
                        <input value={editValue} onChange={(e) => setEditValue(e.target.value)} className="w-full rounded border border-rule bg-paper-2 px-2 py-1 text-xs" />
                        <div className="flex gap-2">
                          <button onClick={saveEditMemory} className="text-xs text-marker">حفظ</button>
                          <button onClick={() => setEditingMemory(null)} className="text-xs text-ink-soft">إلغاء</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs font-medium text-ink">{memory.kind}</p>
                        <p className="text-xs text-ink-soft break-words">{memory.value}</p>
                        <div className="mt-1 flex gap-3">
                          <button onClick={() => startEditMemory(memory)} className="text-[10px] text-ink-soft hover:text-ink">تعديل</button>
                          <button onClick={() => deleteMemory(memory)} disabled={deletingMemory?.kind === memory.kind && deletingMemory?.value === memory.value} className="text-[10px] text-red-600 hover:text-red-700 disabled:opacity-50">حذف</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        <main className="lg:col-span-9 flex flex-col border border-rule rounded-[var(--r-lg)] bg-paper">
          <div className="p-4 border-b border-rule flex items-center justify-between bg-paper-2 rounded-t-[var(--r-lg)]">
            <div>
              <p className="text-sm font-semibold text-ink">{activeConversation?.title || "محادثة جديدة"}</p>
              <p className="text-[10px] text-ink-soft">مع ماجيكلي — مساعدك الدراسي الشخصي</p>
            </div>
            <div className="flex items-center gap-2"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-marker text-paper-2 text-[10px]"><Bot size={12} /></span></div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4" ref={messagesEndRef}>
            {messages.map((message, index) => (
              <article key={`${message.role}-${index}`} className={`flex gap-3 ${message.role === "user" ? "justify-start" : "justify-end"}`}>
                {message.role === "assistant" && <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-paper-2"><Bot size={18} /></span>}
                <p className={`max-w-[85%] whitespace-pre-wrap rounded-[var(--r-md)] px-4 py-3 text-sm leading-7 ${message.role === "user" ? "bg-marker text-onmarker self-start" : "border border-rule bg-paper-2 self-end"}`}>{message.content}</p>
              </article>
            ))}
            {sending && (
              <div className="flex justify-end gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-paper-2"><Bot size={18} /></span><p className="border border-rule bg-paper-2 rounded-[var(--r-md)] px-4 py-3"><LoaderCircle className="animate-spin" size={16} /></p></div>
            )}
          </div>
          <form onSubmit={handleSend} className="border-t border-rule bg-paper p-4">
            <div className="mx-auto flex max-w-xl items-center gap-2 rounded-[var(--r-md)] border border-rule bg-paper-2 p-2 shadow-sm">
              <input id="mentor-message" value={input} onChange={(e) => setInput(e.target.value)} placeholder="اكتب سؤالك لماجيكلي…" className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-ink-soft" disabled={sending} />
              <button type="submit" className="btn btn-marker grid h-10 w-10 place-items-center rounded-full p-0" disabled={sending || !input.trim()} aria-label="إرسال السؤال"><Send size={17} /></button>
            </div>
          </form>
        </main>
      </div>
    </PageShell>
  );
}