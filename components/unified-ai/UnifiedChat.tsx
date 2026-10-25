"use client";
/* eslint-disable @next/next/no-img-element -- previewUrl is dynamic blob URL, next/image not suitable */
/* eslint-disable @typescript-eslint/no-explicit-any -- TODO: proper typing requires architecture change, tracked separately */
/**
 * Unified Chat                              *         AgentRouter / OCR / 11 Agents            * Upload: ?? (PDF/text) / ??? (image) ? Preview ? OCR         ? Router         Response.
 *                  api/unified-ai       OCR + Router              
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Send, Paperclip, ImagePlus, X, LoaderCircle, Sparkles, Crown, ShoppingBag, Clock, MessageCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { SITE_LINKS } from "@/lib/site-links";
import { getSupportPhone, buildWhatsAppReport, buildWhatsAppUrl } from "@/lib/unified-ai/whatsapp-report";

function supportWhatsappHref(code?: string, detail?: string) {
  const phone = getSupportPhone();
  if (!phone) return "";
  const msg = buildWhatsAppReport({
    errorCode: code || "UNKNOWN",
    sanitizedSummary: detail ? detail.slice(0, 200) : undefined,
    timestamp: new Date().toISOString(),
  });
  return buildWhatsAppUrl(phone, msg);
}

type ChatMsg = { role: "user" | "assistant"; content: string; attachmentName?: string };

type Attachment = {
  file: File;
  previewUrl: string;
  kind: "image" | "pdf" | "text";
};

type LessonContext = {
  title?: string;
  subject?: string;
  content?: string;
  description?: string;
};

export function UnifiedChat({ initialContext, lesson }: { initialContext?: any; lesson?: LessonContext }) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "assistant", content: "Hello! I am your AI study assistant. How can I help you today?", },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState<Array<{ id: string; title: string; updated_at: string }>>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth >= 768) setSidebarOpen(true);
  }, []);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [studyMode, setStudyMode] = useState<"explain" | "quiz" | "summarize" | "review">("explain");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [rateLimitInfo, setRateLimitInfo] = useState<{
    error: string;
    message?: string;
    actions?: { label: string; href: string; external?: boolean }[];
    retryAfterHours?: number;
    retryAfter?: number;
    limit?: number;
    used?: number;
    kind?: "credits" | "limit" | "access" | "technical";
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>, kind: "file" | "image") => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setAttachment({ file: f, previewUrl: url, kind: kind === "image" ? (f.type.startsWith("image/") ? "image" : "pdf") : "text" });
    e.target.value = "";
  };

  const removeAttachment = useCallback(() => {
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
  }, [attachment]);

  const loadConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      const res = await fetch("/api/chat/conversations");
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) setConversations(data.conversations ?? []);
    } catch {}
    finally { setLoadingConversations(false); }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const newChat = useCallback(() => {
    setMessages([{ role: "assistant", content: "ط£ظ‡ظ„ط§ظ‹! ط£ظ†ط§ ظ…ط³ط§ط¹ط¯ Magic. ط§ظƒطھط¨ ط³ط¤ط§ظ„ظƒطŒ ط£ظˆ ط§ط±ظپط¹ طµظˆط±ط©/ظ…ظ„ظپ â€” ظˆط³ط£ط³ط§ط¹ط¯ظƒ." }]);
    setConversationId(null);
    setInput("");
    removeAttachment();
  }, [removeAttachment]);

  const openConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/chat/conversations/${id}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        setConversationId(id);
        const msgs = (data.messages ?? []).map((m: any) => ({ role: m.role, content: m.content }));
        setMessages(msgs.length ? msgs : [{ role: "assistant", content: "ظ„ط§ طھظˆط¬ط¯ ط±ط³ط§ط¦ظ„." }]);
      }
    } catch {}
  }, []);

  const renameConversation = useCallback(async (id: string) => {
    if (!renameValue.trim()) { setRenamingId(null); return; }
    await fetch(`/api/chat/conversations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: renameValue }) });
    setRenamingId(null);
    loadConversations();
  }, [renameValue, loadConversations]);

  const deleteConversation = useCallback(async (id: string) => {
    if (!confirm("ط­ط°ظپ ظ‡ط°ظ‡ ط§ظ„ظ…ط­ط§ط¯ط«ط©طں")) return;
    await fetch(`/api/chat/conversations/${id}`, { method: "DELETE" });
    if (conversationId === id) newChat();
    loadConversations();
  }, [conversationId, newChat, loadConversations]);
  const send = async () => {
    const text = input.trim();
    if (!text && !attachment) return;

    const userMsg: ChatMsg = { role: "user", content: text || "(   /          ", attachmentName: attachment?.file.name };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // Build FormData for /api/unified-ai (supports prompt + file/photo)
      const formData = new FormData();
      formData.append("prompt", text);
      if (attachment) {
        if (attachment.kind === "image") {
          formData.append("imageInput", attachment.file, attachment.file.name);
        } else {
          formData.append("file", attachment.file, attachment.file.name);
        }
      }
      // Pass context language + lesson context (                )
      const ctx: Record<string, unknown> = {};
      if (initialContext && typeof initialContext === "object") {
        Object.assign(ctx, initialContext);
      }
      if (!ctx.language) ctx.language = "ar";
      //                +              (         /api/chat              )
      if (conversationId) ctx.conversationId = conversationId;
      if (studyMode && studyMode !== "explain") ctx.mode = studyMode;
      //                                             API    hidden system prompt
      if (lesson && (lesson.title || lesson.content || lesson.description)) {
        ctx.lesson = {
          title: lesson.title || "",
          subject: lesson.subject || "",
          content: lesson.content || lesson.description || "",
          description: lesson.description || "",
        };
      }
      formData.append("context", JSON.stringify(ctx));
      formData.append("language", (ctx.language as string) || "ar");

      const res = await fetch("/api/unified-ai", {
        method: "POST",
        body: formData,  // Use FormData instead of JSON
      });

      const data = await res.json().catch(() => ({}));
      setLoading(false);

      if (!res.ok || !data?.ok) {
        const code =
          (data?.code as string | undefined) ||
          (data?.error?.code as string | undefined) ||
          "";
        //                                       m?ltiples                :
         // reasonAr (   /api/chat)  message (             error.message  error
         const rawError =
          (data?.message as string | undefined) ||
          (typeof data?.error === "string" ? data.error : data?.error?.message) ||
          (res.status === 429
            ? "                                                    .                            ."
            : "        ");
        const supportHref = supportWhatsappHref(code || String(res.status), rawError);
        const supportAction = { label: "                        ", href: supportHref, external: true };

        // ??      AI Credits     (402)              ??
        if (res.status === 402 || code === "INSUFFICIENT_CREDITS") {
          const info = {
            error: "Insufficient AI Credits.",
            message: "You do not have enough credits for this request. Please visit the store to purchase more credits.",
            actions: [
              { label: "Buy Credits", href: "/store" },
              supportAction,
            ],
            kind: "credits" as const,
          };
          setRateLimitInfo(info);
          setMessages((m) => [...m, { role: "assistant", content: `${info.error}\n\n${info.message}` }]);
          return;
        }

        // ??               (403)              ??
        if (res.status === 403 || code === "MODEL_ACCESS_REQUIRED") {
          const info = {
            error: rawError || "Model access required.",
            message: "You need to upgrade your plan to access this model. Please visit the pricing page.",
            actions: [
              { label: "Upgrade Plan", href: "/pricing" },
              supportAction,
            ],
            kind: "access" as const,
          };
          setRateLimitInfo(info);
          setMessages((m) => [...m, { role: "assistant", content: `${info.error}\n\n${info.message}` }]);
          return;
        }

        // ?? Rate Limit        (429) ??
        if (res.status === 429 || code === "RATE_LIMIT_EXCEEDED" || code === "GUEST_RATE_LIMIT") {
          const info = {
            error: rawError,
            message: data?.message || "                                                                                                    ",
            actions: (data?.actions as { label: string; href: string }[]) || [
              { label: "                          ", href: "/pricing" },
              { label: "Buy Credits", href: "/store" },
              supportAction,
            ],
            retryAfterHours: data?.retryAfterHours as number | undefined,
            retryAfter: data?.retryAfter as number | undefined,
            limit: data?.limit as number | undefined,
            used: data?.used as number | undefined,
            kind: "limit" as const,
          };
          setRateLimitInfo(info);
          //                                                   setMessages((m) => [...m, { role: "assistant", content: `${info.error}\n\n${info.message}` }]);
          return;
        }

        // ??         (500/502/503    PROVIDER_ERROR/RESERVE_FAILED/INTERNAL_ERROR) ??
        const incidentId = (data?.incidentId as string | undefined) || "";
        const supportPhone = getSupportPhone();
        const waMessage = buildWhatsAppReport({
          incidentId,
          errorCode: code || "UNKNOWN_INTERNAL_ERROR",
          httpStatus: res.status,
          timestamp: new Date().toISOString(),
        });
        const technicalInfo = {
          error: "ط­طµظ„ ط¹ط·ظ„ ظپظ†ظٹ",
          message: `ط­ط¯ط«طھ ظ…ط´ظƒظ„ط© ط£ط«ظ†ط§ط، ظ…ط¹ط§ظ„ط¬ط© ط·ظ„ط¨ظƒ. ظƒظˆط¯ ط§ظ„ط¹ط·ظ„: ${code}${incidentId ? ` | ظ…ط¹ط±ظ‘ظپ ط§ظ„ط¨ظ„ط§ط؛: ${incidentId}` : ""}`,
          actions: supportPhone
            ? [{ label: "ط§ظ„ط¥ط¨ظ„ط§ط؛ ط¹ط¨ط± ظˆط§طھط³ط§ط¨", href: buildWhatsAppUrl(supportPhone, waMessage), external: true }]
            : [],
          kind: "technical" as const,
        };
        setRateLimitInfo(technicalInfo);
        return;
      }

      //                                         
      if (typeof data?.conversationId === "string" && data.conversationId) {
        setConversationId(data.conversationId);
        loadConversations();
      }

       // Show assistant response
       const assistantText = data?.answer || "Unified AI.";
      setMessages((m) => [
        ...m,
        { role: "assistant", content: assistantText },
      ]);
      removeAttachment();
    } catch {
      setLoading(false);
      const supportPhone = getSupportPhone();
      const waMessage = buildWhatsAppReport({
        errorCode: "NETWORK_ERROR",
        timestamp: new Date().toISOString(),
      });
      setRateLimitInfo({
        error: "Network Error.",
        message: "Unable to connect to the server. Please check your internet connection.",
        actions: supportPhone
          ? [{ label: "Contact Support", href: buildWhatsAppUrl(supportPhone, waMessage), external: true }]
          : [],
        kind: "technical",
      });
      // Restore draft for retry; keep attachment intact.
      setInput(text);

    }
  };

  return (
    <div className="flex h-screen max-h-screen">
      <aside className={`${sidebarOpen ? "block translate-x-0" : "hidden -translate-x-full"} fixed md:static z-40 top-0 right-0 h-full w-72 bg-[var(--card)] border-l border-[var(--border)] p-3 transition-transform`}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm">ط§ظ„ظ…ط­ط§ط¯ط«ط§طھ</h2>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1" aria-label="ط¥ط؛ظ„ط§ظ‚">âœ•</button>
        </div>
        <button onClick={newChat} className="w-full mb-3 px-3 py-2 rounded-xl bg-[var(--accent)] text-[var(--on-marker)] text-sm font-bold">+ ظ…ط­ط§ط¯ط«ط© ط¬ط¯ظٹط¯ط©</button>
        <div className="overflow-y-auto h-[calc(100%-80px)] space-y-1">
          {loadingConversations && <p className="text-xs text-ink-soft">ط¬ط§ط±ظچ ط§ظ„طھط­ظ…ظٹظ„...</p>}
          {conversations.map((c) => (
            <div key={c.id} className={`group rounded-xl px-2 py-2 text-sm cursor-pointer ${conversationId === c.id ? "bg-[var(--accent)]/10" : "hover:bg-black/5"}`}>
              {renamingId === c.id ? (
                <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onBlur={() => renameConversation(c.id)} onKeyDown={(e) => e.key === "Enter" && renameConversation(c.id)} className="w-full text-xs border rounded px-1" autoFocus />
              ) : (
                <div onClick={() => openConversation(c.id)} className="flex items-center justify-between gap-1">
                  <span className="truncate flex-1">{c.title}</span>
                  <span className="opacity-0 group-hover:opacity-100 flex gap-1">
                    <button onClick={(e) => { e.stopPropagation(); setRenamingId(c.id); setRenameValue(c.title); }} className="text-[10px]" aria-label="ط¥ط¹ط§ط¯ط© طھط³ظ…ظٹط©">âœژ</button>
                    <button onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); }} className="text-[10px]" aria-label="ط­ط°ظپ">ًں—‘</button>
                  </span>
                </div>
              )}
              <p className="text-[10px] text-ink-soft mt-0.5">{new Date(c.updated_at).toLocaleString("ar")}</p>
            </div>
          ))}
          {!loadingConversations && conversations.length === 0 && <p className="text-xs text-ink-soft">ظ„ط§ طھظˆط¬ط¯ ظ…ط­ط§ط¯ط«ط§طھ ط³ط§ط¨ظ‚ط©.</p>}
        </div>
      </aside>
      <div className="flex-1 overflow-y-auto">
        <button onClick={() => setSidebarOpen((v) => !v)} className="m-2 px-2 py-1 border rounded" aria-label="إظهار/إخفاء المحادثات">☰</button>
        <div className="max-w-3xl mx-auto px-4 py-5" dir="rtl">
      <div className="flex items-center justify-between gap-2 mb-3">
        <button onClick={() => router.push("/dashboard")} className="text-xs font-medium text-[var(--ink-soft)] hover:text-[var(--accent)] transition flex items-center gap-1" aria-label="                   ">
          ?            
        </button>
        <button
          onClick={() => {
             setMessages([{ role: "assistant", content: "Hello! How can I help you?" }]);
            setConversationId(null);
            setRateLimitInfo(null);
          }}
          className="text-xs font-medium text-[var(--ink-soft)] hover:text-[var(--accent)] transition"
          aria-label="            "
        >
          ?             
        </button>
      </div>

      {/*                (                                    ) */}
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Study Modes">
        {([
           { id: "explain", label: "Explain" },
           { id: "quiz", label: "Quiz" },
           { id: "summarize", label: "Summarize" },
           { id: "review", label: "Review" },
        ] as const).map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setStudyMode(m.id)}
            aria-pressed={studyMode === m.id}
            className={`text-xs font-bold px-3 py-1.5 rounded-full border transition ${
              studyMode === m.id
                ? "bg-[var(--accent)] text-[var(--on-marker)] border-transparent"
                : "border-rule bg-paper text-ink-soft hover:bg-paper-3"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Chat messages */}
      <div className="space-y-3 mb-4 min-h-[240px]">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === "user" ? "bg-paper-3 border border-rule text-ink" : "bg-[var(--card-primary)] border border-[var(--rule)] text-ink shadow-sm"}`}>
              {msg.role === "user" ? (
                <div className="prose prose-sm max-w-none text-sm leading-relaxed text-ink"><ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown></div>
              ) : (
                <MarkdownRenderer>{msg.content}</MarkdownRenderer>
              )}
              {msg.attachmentName && (
                <span className="inline-block mt-2 text-[10px] opacity-80 bg-black/10 rounded px-2 py-0.5">?? {msg.attachmentName}</span>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-[var(--accent)] text-[var(--on-marker)] text-sm flex items-center gap-2">
              <LoaderCircle className="w-4 h-4 animate-spin" />              ...
            </div>
          </div>
        )}
      </div>

      {/* Attachment preview (visible, user controls) */}
      {attachment && (
        <div className="flex items-center gap-2 mb-3">
          <div className="relative rounded-lg overflow-hidden border border-rule w-24 h-24 bg-paper-3 shrink-0">
            {attachment.kind === "image" ? (
              <img src={attachment.previewUrl} alt="preview" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-ink-soft">PDF /    </div>
            )}
            <button
              onClick={removeAttachment}
              className="absolute top-1 left-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80 text-[10px]"
               aria-label="Remove attachment"
            >
              <X size={12} />
            </button>
          </div>
          <div className="text-xs">
            <p className="font-medium">{attachment.file.name}</p>
            <p>OCR processing...</p>
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-end gap-2 bg-paper border border-rule rounded-2xl px-3 py-2 shadow-sm">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="       "
          className="p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl hover:bg-paper-3 text-ink-soft transition"
        >
          <Paperclip size={20} />
        </button>
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          aria-label="        "
          className="p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl hover:bg-paper-3 text-ink-soft transition"
        >
          <ImagePlus size={20} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md,.csv,.json"
          className="hidden"
          onChange={(e) => handleFilePick(e, "file")}
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFilePick(e, "image")}
        />
        <textarea
          dir="rtl"
          rows={1}
          className="flex-1 bg-transparent text-sm font-body resize-none outline-none py-2 min-h-[36px] max-h-[120px]"
          placeholder="           .. (                            OCR)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <button
          onClick={send}
          disabled={loading || (!input.trim() && !attachment)}
           aria-label="Send message"
        >
          <Send size={18} />
        </button>
      </div>

      <div className="flex items-center justify-between mt-3 px-1">
         <p className="text-[11px] text-ink-soft">Magic</p>
        <div className="flex items-center gap-1 text-[11px] text-ink-soft">
          <Sparkles size={12} /> <span>Magic</span>
        </div>
      </div>

      {rateLimitInfo && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 dark:bg-amber-950/30 dark:border-amber-800 p-4 shadow-sm" role="alert" dir="rtl">
          <div className="flex items-start gap-3">
            <div className="shrink-0 mt-0.5 rounded-full bg-amber-100 dark:bg-amber-900 p-2">
              <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-900 dark:text-amber-100 leading-relaxed">{rateLimitInfo.error}</p>
              {rateLimitInfo.message && (
                <p className="text-xs text-amber-800 dark:text-amber-200 mt-1.5 leading-relaxed">{rateLimitInfo.message}</p>
              )}
              {rateLimitInfo.retryAfterHours && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-2 flex items-center gap-1">
                  <Clock size={12} />
                                               {rateLimitInfo.retryAfterHours}                         {rateLimitInfo.retryAfter ? ` (       {Math.ceil(rateLimitInfo.retryAfter / 60)}      )` : ""}
                </p>
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                {(rateLimitInfo.actions || []).map((a) =>
                  a.external || a.href.startsWith("https://") ? (
                    <a
                      key={a.href + a.label}
                      href={a.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#25D366] text-white text-xs font-bold px-4 py-2 hover:brightness-110 transition"
                    >
                      <MessageCircle size={14} />
                      {a.label}
                    </a>
                  ) : (
                    <Link
                      key={a.href + a.label}
                      href={a.href}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] text-[var(--on-marker)] text-xs font-bold px-4 py-2 hover:brightness-110 transition"
                    >
                      {a.label.includes("        ") ? <Crown size={14} /> : <ShoppingBag size={14} />}
                      {a.label}
                    </Link>
                  )
                )}
              </div>
            </div>
            <button
              onClick={() => setRateLimitInfo(null)}
              className="shrink-0 p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-amber-700 dark:text-amber-300"
              aria-label="     "
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
      </div>
    </div>
  );
}
