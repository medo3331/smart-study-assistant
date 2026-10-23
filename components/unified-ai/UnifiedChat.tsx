"use client";
/* eslint-disable @next/next/no-img-element -- previewUrl is dynamic blob URL, next/image not suitable */
/* eslint-disable @typescript-eslint/no-explicit-any -- TODO: proper typing requires architecture change, tracked separately */
/**
 * Unified Chat                              *         AgentRouter / OCR / 11 Agents            * Upload: ?? (PDF/text) / ??? (image) ? Preview ? OCR         ? Router         Response.
 *                  api/unified-ai       OCR + Router              
 */
import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Send, Paperclip, ImagePlus, X, LoaderCircle, Sparkles, Crown, ShoppingBag, Clock, MessageCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { SITE_LINKS } from "@/lib/site-links";

function supportWhatsappHref(code?: string, detail?: string) {
  const base = SITE_LINKS.whatsapp || "https://wa.me/201204556797";
  const text = `                                    code ? ` (${code})` : ""}${detail ? `: ${detail}` : ""}`;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}text=${encodeURIComponent(text)}`;
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
    { role: "assistant", content: "     !           Magic.                         /                                        },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [studyMode, setStudyMode] = useState<"explain" | "quiz" | "summarize" | "review">("explain");
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
        formData.append("file", attachment.file, attachment.file.name);
        // Also mark imageInput for OCR path
        if (attachment.kind === "image") {
          formData.append("imageInput", attachment.file, attachment.file.name);
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
        // reasonAr (   /api/chat)  message (             error.message  error             const rawError =
          (data?.reasonAr as string | undefined) ||
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
            error: "     AI Credits          ,
            message: "                                                                                                         ",
            actions: [
              { label: "               , href: "/store" },
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
            error: rawError || "                        ",
            message: "                                                                                     ,
            actions: [
              { label: "                          ", href: "/pricing" },
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
              { label: "               , href: "/store" },
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
        const technicalInfo = {
          error: "             ",
          message: `                            ${code ? ` (${code})` : ""}.                                                           `,
          actions: [supportAction],
          kind: "technical" as const,
        };
        setRateLimitInfo(technicalInfo);
        setMessages((m) => [...m, { role: "assistant", content: `${technicalInfo.error}\n\n${technicalInfo.message}` }]);
        return;
      }

      //                     rate limit               setRateLimitInfo(null);

      //                                         
      if (typeof data?.conversationId === "string" && data.conversationId) {
        setConversationId(data.conversationId);
      }

      // Show assistant response                                 const assistantText = data?.answer || "                Unified AI.";

      setMessages((m) => [
        ...m,
        { role: "assistant", content: assistantText },
      ]);
      removeAttachment();
    } catch {
      setLoading(false);
      const supportHref = supportWhatsappHref("NETWORK", "                    ");
      setRateLimitInfo({
        error: "              ,
        message: "                                                              ",
        actions: [{ label: "                        ", href: supportHref, external: true }],
        kind: "technical",
      });
      setMessages((m) => [...m, { role: "assistant", content: "                                           " }]);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-5" dir="rtl">
      <div className="flex items-center justify-between gap-2 mb-3">
        <button onClick={() => router.push("/dashboard")} className="text-xs font-medium text-[var(--ink-soft)] hover:text-[var(--accent)] transition flex items-center gap-1" aria-label="                   ">
          ?            
        </button>
        <button
          onClick={() => {
            setMessages([{ role: "assistant", content: "     !           Magic.                         /                                        }]);
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
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="             >
        {([
          { id: "explain", label: "        },
          { id: "quiz", label: "         },
          { id: "summarize", label: "       },
          { id: "review", label: "        },
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
              aria-label="             
            >
              <X size={12} />
            </button>
          </div>
          <div className="text-xs text-ink-soft">
            <p className="font-medium">{attachment.file.name}</p>
            <p>                 OCR              /       </p>
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
          aria-label="                 className="p-2.5 rounded-xl bg-[var(--accent)] text-[var(--on-marker)] hover:brightness-110 disabled:opacity-40 transition"
        >
          <Send size={18} />
        </button>
      </div>

      <div className="flex items-center justify-between mt-3 px-1">
        <p className="text-[11px] text-ink-soft">Magic                 p>
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
  );
}
