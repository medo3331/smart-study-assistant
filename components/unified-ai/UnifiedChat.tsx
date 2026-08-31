"use client";
/* eslint-disable @next/next/no-img-element -- previewUrl is dynamic blob URL, next/image not suitable */
/* eslint-disable @typescript-eslint/no-explicit-any -- TODO: proper typing requires architecture change, tracked separately */
/**
 * Unified Chat — واجهة واحدة فقط للمستخدم.
 * لا يظهر AgentRouter / OCR / 11 Agents للمستخدم.
 * Upload: 📎 (PDF/text) / 🖼️ (image) → Preview → OCR إذا لزم → Router داخلي → Response.
 * يكبُر الطلب على /api/unified-ai ويدير OCR + Router خلف الكواليس.
 */
import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Send, Paperclip, ImagePlus, X, LoaderCircle, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ChatMsg = { role: "user" | "assistant"; content: string; attachmentName?: string };

type Attachment = {
  file: File;
  previewUrl: string;
  kind: "image" | "pdf" | "text";
};

export function UnifiedChat({ initialContext }: { initialContext?: any }) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "assistant", content: "أهلاً! أنا مساعد Magic. اكتب سؤالك، أو ارفع صورة/ملف — وسأساعدك. لا تحتاج لاختيار وكيل." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
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

    const userMsg: ChatMsg = { role: "user", content: text || "(ملف/صورة مرفق)", attachmentName: attachment?.file.name };
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
      // Pass context language
      if (initialContext && initialContext.language) {
        formData.append("language", initialContext.language);
      } else {
        formData.append("language", "ar");
      }

      const res = await fetch("/api/unified-ai", {
        method: "POST",
        body: formData,  // Use FormData instead of JSON
      });

      const data = await res.json().catch(() => ({}));
      setLoading(false);

      if (!res.ok || !data?.ok) {
        setMessages((m) => [...m, { role: "assistant", content: "حدث خطأ أثناء المعالجة. جرب مرة أخرى." }]);
        return;
      }

      // Show assistant response
      const assistantText = data?.answer || "تم المعالجة عبر Unified AI.";
      const hiddenReason = `(تم اختيار الوكيل الأنسب تلقائيًا خلف الكواليس — لا تحتاج لتحديده)`;

      setMessages((m) => [
        ...m,
        { role: "assistant", content: assistantText + "\n\n" + hiddenReason },
      ]);
      removeAttachment();
    } catch {
      setLoading(false);
      setMessages((m) => [...m, { role: "assistant", content: "حدث خطأ أثناء المعالجة. جرب مرة أخرى." }]);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-5" dir="rtl">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => router.push("/dashboard")} className="text-xs font-medium text-[var(--ink-soft)] hover:text-[var(--red)] transition flex items-center gap-1" aria-label="الرجوع للوحة التحكم">
          ← لوحة التحكم
        </button>
      </div>

      {/* Chat messages */}
      <div className="space-y-3 mb-4 min-h-[240px]">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === "user" ? "bg-paper-3 border border-rule text-ink" : "bg-[var(--red)] text-white"}`}>
              <div className="prose prose-sm max-w-none text-sm leading-relaxed text-ink"><ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown></div>
              {msg.attachmentName && (
                <span className="inline-block mt-2 text-[10px] opacity-80 bg-black/10 rounded px-2 py-0.5">📎 {msg.attachmentName}</span>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-[var(--red)] text-white text-sm flex items-center gap-2">
              <LoaderCircle className="w-4 h-4 animate-spin" /> جارى المعالجة...
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
              <div className="w-full h-full flex items-center justify-center text-xs text-ink-soft">PDF / ملف</div>
            )}
            <button
              onClick={removeAttachment}
              className="absolute top-1 left-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80 text-[10px]"
              aria-label="إزالة المرفق"
            >
              <X size={12} />
            </button>
          </div>
          <div className="text-xs text-ink-soft">
            <p className="font-medium">{attachment.file.name}</p>
            <p>سيتم معالجته عبر OCR إذا كانت صورة/ملف نصي</p>
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-end gap-2 bg-paper border border-rule rounded-2xl px-3 py-2 shadow-sm">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="رفع ملف"
          className="p-2 rounded-xl hover:bg-paper-3 text-ink-soft transition"
        >
          <Paperclip size={20} />
        </button>
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          aria-label="رفع صورة"
          className="p-2 rounded-xl hover:bg-paper-3 text-ink-soft transition"
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
          placeholder="اكتب سؤالك... (صورة أو ملف مرفق يُعالج عبر OCR)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <button
          onClick={send}
          disabled={loading || (!input.trim() && !attachment)}
          aria-label="إرسال"
          className="p-2.5 rounded-xl bg-[var(--red)] text-white hover:brightness-110 disabled:opacity-40 transition"
        >
          <Send size={18} />
        </button>
      </div>

      <div className="flex items-center justify-between mt-3 px-1">
        <p className="text-[11px] text-ink-soft">Magic — مساعد واحد. بلا اختيار وكيل.</p>
        <div className="flex items-center gap-1 text-[11px] text-ink-soft">
          <Sparkles size={12} /> <span>المساعد يعمل</span>
        </div>
      </div>
    </div>
  );
}