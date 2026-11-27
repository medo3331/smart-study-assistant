"use client";
/* eslint-disable react-hooks/set-state-in-effect -- syncing conversations and URL-selected chat with external state */
/* eslint-disable @next/next/no-img-element -- previewUrl is dynamic blob URL, next/image not suitable */
/* eslint-disable @typescript-eslint/no-explicit-any -- TODO: proper typing requires architecture change, tracked separately */
/**
 * Unified Chat                              *         AgentRouter / OCR / 11 Agents            * Upload: ?? (PDF/text) / ??? (image) ? Preview ? OCR         ? Router         Response.
 *                  api/unified-ai       OCR + Router              
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Send, Paperclip, ImagePlus, X, LoaderCircle, Sparkles, Crown, ShoppingBag, Clock, MessageCircle, Square, Pencil, Trash2, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ExplanationView } from "@/components/unified-ai/ExplanationView";
import { ChatSlides, type ChatSlide } from "@/components/unified-ai/ChatSlides";
import { FeatureGuide } from "@/components/FeatureGuide";
import { guides } from "@/lib/guides";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { SITE_LINKS } from "@/lib/site-links";
import { getSupportPhone, buildWhatsAppReport, buildWhatsAppUrl } from "@/lib/unified-ai/whatsapp-report";
import { CREDIT_COSTS } from "@/lib/ai/credit-pricing";
import { PERSONAS, isValidPersona, type AiPersonaId } from "@/lib/magic/personas";
import { extractPlanDraft, stripPlanFence } from "@/lib/agent/plan-draft";
import { PlanApproveCard } from "./PlanApproveCard";
// 🎨 chips أساليب الشرح — قيم معروفة مسبقًا تطابق EXPLANATION_STYLES في السيرفر.
const STYLE_CHIPS = [
  { id: "simpler", label: "🪄 أبسط" },
  { id: "example", label: "🧪 بمثال" },
  { id: "analogy", label: "🎯 بتشبيه" },
  { id: "steps", label: "🪜 خطوة بخطوة" },
  { id: "english", label: "🌍 بالإنجليزي" },
] as const;
// 📡 أقصى عدد أجزاء التكملة — نفس القيمة اللي في الواجهة لعرض التكلفة القصوى للطالب.
const MAX_CONTINUATION_PARTS = 4;

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

type ChatMsg = {
  role: "user" | "assistant";
  content: string;
  attachmentName?: string;
  /** ⚡ استهلاك الطلب — من السيرفر (مصدر التكلفة الوحيد). */
  creditsUsed?: number;
  /** 🎭 الشخصية التي أجابت — من Persona Orchestrator. */
  persona?: string;
  /** 📖 عنوان المصدر المرتبط بالإجابة (workspace/lecture) — citation بسيط. */
  sourceTitle?: string;
  /** إجراءات مقترحة (مثال: زر «افتح مولّد الامتحان»). */
  actions?: { label: string; href: string; external?: boolean }[];
};

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

export function UnifiedChat({
  initialContext,
  lesson,
  initialConversationId,
}: {
  initialContext?: any;
  lesson?: LessonContext;
  initialConversationId?: string;
}) {
  const router = useRouter();
  const { locale } = useLanguage();
  const isAr = locale === "ar";
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "assistant", content: "أهلاً! أنا مساعد Magicly الذكي 🧠 — اسألني عن أي حاجة في مذاكرتك، أو ارفع ملف/صورة وهشرحها لك. تقدر تطلب: شرح، تلخيص، اختبار سريع، أو خطة مراجعة.", },
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
  // 📊 شرائح الشات — لوحة واحدة مفتوحة في المرة (index = رقم رسالة المساعد).
  const [slidesPanel, setSlidesPanel] = useState<{ index: number; loading: boolean; topic?: string; slides?: ChatSlide[] } | null>(null);
  // 🔊 الشرح الصوتي — مقاطع Orpheus بتتشغّل بالترتيب، والزر بيبوّظ الكل.
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const audioRefs = useRef<HTMLAudioElement[]>([]);
  const speakTokenRef = useRef(0);
  const browserSpeakingRef = useRef(false);
  // 🔇 رسالة فشل الصوت — بتظهر لما TTS السيرفر وصوت المتصفح الاتنين يفشلوا.
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  // 📚 مكتبتي — ملفات مساحة العمل المرتبطة بالمساعد (نفس مصدر /api/files).
  const [libraryFiles, setLibraryFiles] = useState<Array<{ id: string; original_name?: string | null; file_name?: string | null; file_size?: number | null }>>([]);
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [libraryError, setLibraryError] = useState(false);
  // 🎧 التسجيلات الصوتية المحفوظة — نفس المكتبة، مصدر `lectures`.
  const [libraryRecordings, setLibraryRecordings] = useState<Array<{ id: string; title: string; duration_seconds: number | null }>>([]);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/files");
        if (!res.ok) { setLibraryError(true); return; }
        const d = await res.json().catch(() => ({}));
        if (Array.isArray(d?.files)) setLibraryFiles(d.files);
      } catch { setLibraryError(true); }
      try {
        const res = await fetch("/api/recordings");
        if (res.ok) {
          const d = await res.json().catch(() => null);
          if (Array.isArray(d?.recordings)) setLibraryRecordings(d.recordings);
        }
      } catch {}
    })();
  }, []);
  // ⚡ شفافية الـ credits — الرصيد من السيرفر (مصدر التكلفة الوحيد)، والكلاينت عارض بس.
  const [creditUsage, setCreditUsage] = useState<{ used: number; limit: number } | null>(null);
  const loadCreditUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/usage");
      if (!res.ok) { setCreditUsage(null); return; }
      const d = await res.json().catch(() => null);
      if (d?.ok && d?.daily && typeof d.daily.used === "number" && typeof d.daily.limit === "number") {
        setCreditUsage({ used: d.daily.used, limit: d.daily.limit });
      } else setCreditUsage(null);
    } catch { setCreditUsage(null); }
  }, []);
  useEffect(() => { void loadCreditUsage(); }, [loadCreditUsage]);
  // 🎨 أسلوب الشرح المختار — بيحقن كتعليمات تعليمية في السيرفر.
  const [styleModifier, setStyleModifier] = useState<string | null>(null);
  // 🎭 اختيار الشخصية — "auto" = الـ Orchestrator يختار في الخلفية (الافتراضي).
  const [personaChoice, setPersonaChoice] = useState<"auto" | AiPersonaId>("auto");
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
  // 📡 التوصيل التدريجي — الشرح الطويل بيتولّد على أجزاء متتالية وجزء جزء ورا بعض.
  const [continuing, setContinuing] = useState(false);
  const continueAbortRef = useRef(false);

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
    setMessages([{ role: "assistant", content: "أهلاً! أنا مساعد Magicly الذكي 🧠 — اسألني عن أي حاجة في مذاكرتك، أو ارفع ملف/صورة وهشرحها لك." }]);
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
        setMessages(msgs.length ? msgs : [{ role: "assistant", content: "لا توجد رسائل." }]);
      }
    } catch {}
  }, []);

  // فتح محادثة قديمة من رابط Workspace: /chat?conversation=<id>
  useEffect(() => {
    if (!initialConversationId) return;
    void openConversation(initialConversationId);
  }, [initialConversationId, openConversation]);

  const renameConversation = useCallback(async (id: string) => {
    if (!renameValue.trim()) { setRenamingId(null); return; }
    await fetch(`/api/chat/conversations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: renameValue }) });
    setRenamingId(null);
    loadConversations();
  }, [renameValue, loadConversations]);

  const deleteConversation = useCallback(async (id: string) => {
    if (!confirm("حذف هذه المحادثة؟")) return;
    await fetch(`/api/chat/conversations/${id}`, { method: "DELETE" });
    if (conversationId === id) newChat();
    loadConversations();
  }, [conversationId, newChat, loadConversations]);

  const stopSpeech = useCallback(() => {
    audioRefs.current.forEach((a) => a.pause());
    audioRefs.current = [];
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    browserSpeakingRef.current = false;
    setSpeakingIdx(null);
  }, []);

  // 🔊 استماع للشرح — /api/voice/speak بيرجّع إما ملف صوتي (ElevenLabs) أو
  //    JSON {segments} (Groq Orpheus — حد 200 حرف/طلب) وبنشغّل المقاطع بالترتيب.
  const speakAnswer = useCallback(async (index: number, answer: string) => {
    if (speakingIdx === index) { stopSpeech(); return; }
    stopSpeech();
    const token = ++speakTokenRef.current;
    setSpeakingIdx(index);
    setVoiceNotice(null);
    // 🔇 بديل المتصفح — بيشتغل لو TTS السيرفر فشل (ElevenLabs/Groq) بدل الصمت التام.
    const speakBrowser = () => {
      if (speakTokenRef.current !== token) return;
      if (typeof window === "undefined" || !window.speechSynthesis) {
        setVoiceNotice("خدمة الصوت غير متاحة حالياً — جرّب تاني، ولو المشكلة استمرت أبلغ الدعم.");
        setSpeakingIdx(null);
        return;
      }
      const clean = answer.replace(/[#*_>|~]/g, " ").replace(/\s+/g, " ").trim().slice(0, 1200);
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = "ar-EG";
      u.onend = () => { browserSpeakingRef.current = false; if (speakTokenRef.current === token) setSpeakingIdx(null); };
      u.onerror = () => { browserSpeakingRef.current = false; if (speakTokenRef.current === token) setSpeakingIdx(null); };
      browserSpeakingRef.current = true;
      window.speechSynthesis.speak(u);
    };
    try {
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: answer }),
      });
      if (!res.ok) throw new Error("tts-failed");
      const ct = res.headers.get("content-type") || "";
      const play = async (src: Blob | string) => {
        if (speakTokenRef.current !== token) return;
        const url = typeof src === "string"
          ? src
          : URL.createObjectURL(src);
        const audio = new Audio(url);
        audioRefs.current.push(audio);
        await new Promise<void>((resolve) => {
          audio.onended = () => resolve();
          audio.onerror = () => resolve();
          // ⏹ الإيقاف اليدوي (pause) لازم يفض الحلقة المعلّقة — من غيره الـ await يفضل مستني للأبد.
          audio.onpause = () => resolve();
          void audio.play().catch(() => resolve());
        });
        if (typeof src !== "string") URL.revokeObjectURL(url);
      };
      if (ct.includes("application/json")) {
        const data = (await res.json()) as { segments?: string[] };
        for (const seg of data.segments ?? []) {
          if (speakTokenRef.current !== token) return;
          const bytes = Uint8Array.from(atob(seg), (c) => c.charCodeAt(0));
          await play(new Blob([bytes], { type: "audio/wav" }));
        }
      } else {
        await play(await res.blob());
      }
    } catch {
      speakBrowser();
    } finally {
      // لو صوت المتصفح شغّال، الإيقاف بيتظبط من onend/onerror — من غيرها هينقطع فوراً.
      if (speakTokenRef.current === token && !browserSpeakingRef.current) setSpeakingIdx(null);
    }
    }, [speakingIdx, stopSpeech]);

  // 📊 شرائح من جواب المساعد — نفس خط /dashboard/slides بس جوه الشات.
  const generateSlides = useCallback(async (index: number, answer: string) => {
    if (slidesPanel?.index === index && !slidesPanel.loading) { setSlidesPanel(null); return; }
    setSlidesPanel({ index, loading: true });
    const topic = (
      answer.match(/^#{1,6}\s*(.+)$/m)?.[1] ||
      answer.split("\n").find((l) => l.trim()) ||
      "شرح"
    ).replace(/[*#>_]/g, "").trim().slice(0, 150);
    try {
      const res = await fetch("/api/generate-slides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, source: answer.slice(0, 6000) }),
      });
      const data = await res.json().catch(() => ({}));
      const slides = (data?.data?.slides ?? []) as ChatSlide[];
      setSlidesPanel(res.ok && Array.isArray(slides) && slides.length > 0 ? { index, loading: false, topic, slides } : { index, loading: false, slides: [] });
    } catch {
      setSlidesPanel({ index, loading: false, slides: [] });
    }
  }, [slidesPanel]);

  /**
   * 📡 استكمال تلقائي — لما السيرفر يرجّع `hasMore` بنطلب باقي الأجزاء واحد ورا
   *    التاني وكل جزء بيظهر كرسالة مستقلة (جزء جزء ورا بعض). كل طلب صغير وسريع
   *    فمش بيضرب حدود TPM ولا مهلة الدالة — ده حل مشكلة rate limit في الشرح الطويل.
   */
  const runContinuation = async (baseForm: FormData, firstPart: string) => {
    setContinuing(true);
    continueAbortRef.current = false;
    const MAX_PARTS = 4;
    let accumulated = firstPart;
    try {
      for (let part = 2; part <= MAX_PARTS; part++) {
        if (continueAbortRef.current) break;
        setLoading(true);
        const form = new FormData();
        for (const [k, v] of baseForm.entries()) form.append(k, v);
        form.append("continuationPart", String(part));
        form.append("previousTail", accumulated.slice(-1200));
        let data: { ok?: boolean; answer?: string; hasMore?: boolean; creditsUsed?: number } = {};
        try {
          const res = await fetch("/api/unified-ai", { method: "POST", body: form });
          data = await res.json().catch(() => ({}));
        } catch {
          break;
        } finally {
          setLoading(false);
        }
        if (!data?.ok || !data.answer) break;
        accumulated += `\n\n${data.answer}`;
        setMessages((m) => [...m, {
          role: "assistant",
          content: data.answer as string,
          ...(typeof data.creditsUsed === "number" ? { creditsUsed: data.creditsUsed } : {}),
        }]);
        if (!data.hasMore) break;
      }
    } finally {
      setLoading(false);
      setContinuing(false);
      void loadCreditUsage();
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text && !attachment) return;

    const userMsg: ChatMsg = { role: "user", content: text || "📎 مرفق", attachmentName: attachment?.file.name };
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
      if (!ctx.language) ctx.language = locale || "ar";
      //                +              (         /api/chat              )
      if (conversationId) ctx.conversationId = conversationId;
      if (studyMode && studyMode !== "explain") ctx.mode = studyMode;
      if (styleModifier) ctx.style = styleModifier;
      // 🎭 الشخصية المختارة يدويًا لها الأولوية على التوجيه الآلي.
      if (personaChoice !== "auto") ctx.persona = personaChoice;
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
            ? "وصلت الحد الأقصى للطلبات المتاحة حالياً. جرّب تاني بعد شوية أو طوّر باقتك."
            : "حدث خطأ غير متوقع. جرّب تاني.");
        const supportHref = supportWhatsappHref(code || String(res.status), rawError);
        const supportAction = { label: "التواصل مع الدعم عبر واتساب", href: supportHref, external: true };

        // ??      AI Credits     (402)              ??
        if (res.status === 402 || code === "INSUFFICIENT_CREDITS") {
          const info = {
            error: isAr ? "رصيدك من الكريدت غير كافٍ" : "Insufficient AI Credits.",
            message: isAr
              ? "رصيدك الحالي لا يكفي لتنفيذ هذا الطلب. يمكنك زيارة المتجر لشراء كريدت إضافي"
              : "You do not have enough credits for this request. Please visit the store to purchase more credits.",
            actions: [
              { label: isAr ? "شراء كريدت" : "Buy Credits", href: "/store" },
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
            message: "محتاج ترقية باقتك للوصول للموديل ده. زور صفحة الباقات.",
            actions: [
              { label: "ترقية الباقة", href: "/pricing" },
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
            message: data?.message || "خد نفسك وقفة قصيرة وجرّب تاني — أو قسّم طلبك لأجزاء أصغر.",
            actions: (data?.actions as { label: string; href: string }[]) || [
              { label: "ترقية الباقة", href: "/pricing" },
              { label: "شراء كريدت", href: "/store" },
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
          error: "حصل عطل فني مؤقت",
          message: `حدثت مشكلة أثناء معالجة طلبك. كود العطل: ${code}${incidentId ? ` | معرّف البلاغ: ${incidentId}` : ""}`,
          actions: supportPhone
            ? [{ label: "الإبلاغ عبر واتساب", href: buildWhatsAppUrl(supportPhone, waMessage), external: true }]
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
      // ⚡ إجراءات من السيرفر (مثال: طلب امتحان مكتمل ⇒ رابط المولّد).
      const replyActions = Array.isArray(data?.actions)
        ? (data.actions as { label: string; href: string; external?: boolean }[])
        : undefined;
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: assistantText,
          ...(typeof data?.creditsUsed === "number" ? { creditsUsed: data.creditsUsed } : {}),
          ...(isValidPersona(data?.metadata?.persona) ? { persona: data.metadata.persona } : {}),
          ...(typeof data?.sourceTitle === "string" && data.sourceTitle ? { sourceTitle: data.sourceTitle } : {}),
          ...(replyActions ? { actions: replyActions } : {}),
        },
      ]);
      removeAttachment();
      void loadCreditUsage();
      // 📡 لو الجزء الأول لوّم بـ [[متابعة]] — نطلب الباقي تلقائيًا جزء جزء.
      if (data?.hasMore && typeof data.answer === "string" && data.answer) {
        await runContinuation(formData, data.answer);
      }
    } catch {
      setLoading(false);
      const supportPhone = getSupportPhone();
      const waMessage = buildWhatsAppReport({
        errorCode: "NETWORK_ERROR",
        timestamp: new Date().toISOString(),
      });
      setRateLimitInfo({
        error: isAr ? "مشكلة في الاتصال" : "Network Error.",
        message: isAr ? "مش قادر أوصل للسيرفر. اتأكد من اتصالك بالإنترنت وجرّب تاني." : "Unable to connect to the server.",
        actions: supportPhone
          ? [{ label: isAr ? "التواصل مع الدعم عبر واتساب" : "Contact Support", href: buildWhatsAppUrl(supportPhone, waMessage), external: true }]
          : [],
        kind: "technical",
      });
      // Restore draft for retry; keep attachment intact.
      setInput(text);

    }
  };

  return (
    /* ⚠️ الارتفاع = الشاشة **ناقص** الشريط العلوي (`--nav-h`).
       السبب: الشريط `sticky` — يعني **بياخد مكان من الـ flow** (مش
       `fixed` اللي بيقعد فوق المحتوى). فلو الشات كان `h-screen` (100vh)
       والـ nav فوقه بـ 56px، الصفحة بتعمل scrollbar (56px زيادة) **و**
       الشات جوه بيعمل scrollbar تاني → scrollbar مزدوج، وآخر 56px من
       الشات (شريط الكتابة) بتتحت الـ fold.

       `100dvh` مش `100vh`: على الموبايل `vh` بيحسب مع شريط المتصفح،
       فالمحتوى بيختفي تحته. `dvh` بيتحسب مع الشريط وهو ظاهر.

       ⚠️ `--nav-h` (3.5rem) = ارتفاع الشريط العلوي — معرّف في
       `app/globals.css`. الصفحتان اللي فيها الشات (`/chat` و
       `/lesson/[dayId]`) الاتنين عندهم الشريط فوقهم. */
    <div className="flex h-[calc(100dvh_-_var(--nav-h))] max-h-[calc(100dvh_-_var(--nav-h))]">
      {/* ⚠️ الـ aside على الموبايل `fixed` — لازم يبدأ **تحت** الشريط
          العلوي (`--nav-h`) وإلا غطّاه. وعلى الديسكتوب `md:static` فيصير
          جوّه الـ flex عادي. */}
      <aside className={`${sidebarOpen ? "block translate-x-0" : "hidden -translate-x-full"} fixed md:static z-40 top-[var(--nav-h)] right-0 h-[calc(100%-var(--nav-h))] w-72 bg-[var(--card)] border-l border-[var(--border)] p-3 transition-transform flex flex-col`}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm">المحادثات المحفوظة</h2>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1" aria-label="إغلاق"><X size={14} /></button>
        </div>
        <button onClick={newChat} className="w-full mb-3 px-3 py-2 rounded-xl bg-[var(--accent)] text-[var(--on-marker)] text-sm font-bold">+ محادثة جديدة</button>
        {/* 📚 مكتبتي — ربط مساحة العمل بالمساعد: ملفات الطالب الجاهزة للسؤال */}
        <div className="mb-3 border border-[var(--border)] rounded-xl p-2">
          <button onClick={() => setLibraryOpen((v) => !v)} className="w-full flex items-center justify-between text-xs font-bold text-ink">
            <span className="flex items-center gap-1.5"><FileText size={13} /> 📚 مكتبتي — ملفات مساحة العمل</span>
            <span className="text-[10px] text-ink-soft">{libraryOpen ? "▲" : "▼"}</span>
          </button>
          {libraryOpen && (
            <div className="mt-2 max-h-44 overflow-y-auto space-y-0.5">
              {libraryFiles.length === 0 && (
                <p className="text-[11px] text-ink-soft leading-relaxed px-1 py-1">
                  {libraryError
                    ? "سجّل دخولك عشان تشوف ملفاتك هنا."
                    : "مفيش ملفات لسه — ارفع ملفاتك في مساحة العمل وهتظهر هنا، والمساعد هيجاوبك منها."}
                </p>
              )}
              {libraryFiles.map((f) => {
                const name = f.original_name || f.file_name || "ملف";
                return (
                  <button
                    key={f.id}
                    onClick={() => { setInput(`اشرح لي الملف «${name}» اللي رفعته في مساحة العمل`); setSidebarOpen(false); }}
                    className="w-full text-right rounded-lg px-2 py-1.5 text-xs hover:bg-black/5 transition flex items-center gap-1.5"
                    title={`اسأل عن: ${name}`}
                  >
                    <FileText size={12} className="shrink-0 text-ink-soft" />
                    <span className="truncate flex-1">{name}</span>
                    {typeof f.file_size === "number" && <span className="text-[9px] text-ink-soft shrink-0">{Math.max(1, Math.round(f.file_size / 1024))} KB</span>}
                  </button>
                );
              })}
              {libraryRecordings.map((rec) => (
                <button
                  key={rec.id}
                  onClick={() => { setInput(`اشرح لي المحاضرة الصوتية «${rec.title}» — وقفز على أهم اللحظات فيها`); setSidebarOpen(false); }}
                  className="w-full text-right rounded-lg px-2 py-1.5 text-xs hover:bg-black/5 transition flex items-center gap-1.5"
                  title={`اسأل عن: ${rec.title}`}
                >
                  <span className="shrink-0" aria-hidden>🎧</span>
                  <span className="truncate flex-1">{rec.title}</span>
                  {typeof rec.duration_seconds === "number" && (
                    <span className="text-[9px] text-ink-soft shrink-0 ltr-num">{Math.max(1, Math.round(rec.duration_seconds / 60))} د</span>
                  )}
                </button>
              ))}
              <Link href="/dashboard/workspace" className="block text-[11px] text-[var(--accent)] hover:underline px-2 pt-1">＋ ارفع ملف جديد في مساحة العمل →</Link>
            </div>
          )}
        </div>
        <div className="overflow-y-auto flex-1 min-h-0 space-y-1">
          {loadingConversations && <p className="text-xs text-ink-soft">جارٍ التحميل...</p>}
          {conversations.map((c) => (
            <div key={c.id} className={`group rounded-xl px-2 py-2 text-sm cursor-pointer ${conversationId === c.id ? "bg-[var(--accent)]/10" : "hover:bg-black/5"}`}>
              {renamingId === c.id ? (
                <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onBlur={() => renameConversation(c.id)} onKeyDown={(e) => e.key === "Enter" && renameConversation(c.id)} className="w-full text-xs border rounded px-1" autoFocus />
              ) : (
                <div onClick={() => openConversation(c.id)} className="flex items-center justify-between gap-1">
                  <span className="truncate flex-1">{c.title}</span>
                  <span className="opacity-0 group-hover:opacity-100 flex gap-1">
                    <button onClick={(e) => { e.stopPropagation(); setRenamingId(c.id); setRenameValue(c.title); }} className="text-[10px]" aria-label="إعادة تسمية"><Pencil size={12} /></button>
                    <button onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); }} className="text-[10px]" aria-label="حذف"><Trash2 size={12} /></button>
                  </span>
                </div>
              )}
              <p className="text-[10px] text-ink-soft mt-0.5">{new Date(c.updated_at).toLocaleString("ar")}</p>
            </div>
          ))}
          {!loadingConversations && conversations.length === 0 && <p className="text-xs text-ink-soft leading-relaxed">ابدأ أول محادثة — هتتخزن هنا تلقائياً وتقدر ترجع لها في أي وقت.</p>}
        </div>
      </aside>
      {/* ⚠️ عمود المحتوى: صفّان في CSS grid —
          (1) `minmax(0,1fr)` = منطقة الرسائل (اللي بتسكرول)
          (2) `auto`            = شريط الكتابة (مثبّت، بيتحسب على مقاسه)

          الـ `minmax(0,…)` ضرورية: من غيرها الـ row بيكبر على محتوى
          الرسائل والـ composer بينزل تحت الـ fold.

          الـ composer **مش** جوه الـ scroller: لو كان جواها كان لازم
          تعمل scroll لحد ما توصله، فكان بيختفي تحت الـ fold. */}
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto]">
        {/* منطقة الرسائل — هي اللي بتسكرول */}
        <div className="min-h-0 overflow-y-auto">
        <button onClick={() => setSidebarOpen((v) => !v)} className="m-2 px-2 py-1 border rounded" aria-label="إظهار/إخفاء المحادثات">☰</button>
        <div className="max-w-3xl md:max-w-4xl xl:max-w-5xl mx-auto px-4 py-5" dir="rtl">
      {/* 📌 دليل الاستخدام — أول حاجة في العمود، قبل المحادثة نفسها.
          هنا بالذات محتاجه: أربع أوضاع (`Explain` / `Quiz` / `Summarize` /
          `Review`) مكتوبة بالإنجليزي ومن غير شرح، فالمستخدم الجديد
          مش هيعرف يختار. */}
      <FeatureGuide {...guides.chat} storageKey="guide:chat" />

      <div className="flex items-center justify-between gap-2 mb-3">
        <button onClick={() => router.push("/dashboard")} className="text-xs font-medium text-[var(--ink-soft)] hover:text-[var(--accent)] transition flex items-center gap-1" aria-label="العودة إلى لوحة التحكم">
          ← لوحة التحكم
        </button>
        <button onClick={newChat} className="text-xs font-medium text-[var(--ink-soft)] hover:text-[var(--accent)] transition" aria-label="بدء محادثة جديدة">
          + محادثة جديدة
        </button>
      </div>

      {/*                (                                    ) */}
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="أوضاع الدراسة">
        {([
           { id: "explain", label: "شرح" },
           { id: "quiz", label: "اختبار سريع" },
           { id: "summarize", label: "تلخيص" },
           { id: "review", label: "مراجعة" },
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
        {messages.map((msg, i) => {
        const planDraft = msg.role === "assistant" ? extractPlanDraft(msg.content) : null;
        return (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === "user" ? "bg-paper-3 border border-rule text-ink" : "bg-[var(--card-primary)] border border-[var(--rule)] text-ink shadow-sm"}`}>
              {msg.role === "user" ? (
                <div className="prose prose-sm max-w-none text-sm leading-relaxed text-ink"><ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown></div>
              ) : (
                <>
                  <ExplanationView content={planDraft ? stripPlanFence(msg.content) : msg.content} />
                  {planDraft && <PlanApproveCard draft={planDraft.draft} />}
                </>
              )}
              {msg.attachmentName && (
                <span className="inline-block mt-2 text-[10px] opacity-80 bg-black/10 rounded px-2 py-0.5">📎 {msg.attachmentName}</span>
              )}
              {(msg.sourceTitle || typeof msg.creditsUsed === "number" || (msg.persona && msg.persona !== "magic")) && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-ink-soft">
                  {msg.persona && msg.persona !== "magic" && isValidPersona(msg.persona) && (
                    <span className="rounded-full bg-black/5 px-2 py-0.5">
                      {PERSONAS[msg.persona].emoji} {PERSONAS[msg.persona].name}
                    </span>
                  )}
                  {msg.sourceTitle && (
                    <span className="rounded-full bg-black/5 px-2 py-0.5">📖 المصدر: {msg.sourceTitle}</span>
                  )}
                  {typeof msg.creditsUsed === "number" && (
                    <span className="rounded-full bg-black/5 px-2 py-0.5">⚡ {msg.creditsUsed} credit</span>
                  )}
                </div>
              )}
              {(msg.actions?.length ?? 0) > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {(msg.actions ?? []).map((action) =>
                    action.href.startsWith("#") ? (
                      <button
                        key={action.href + action.label}
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-extrabold text-[var(--on-marker)] transition hover:brightness-110"
                      >
                        {action.label}
                      </button>
                    ) : action.external ? (
                      <a
                        key={action.href}
                        href={action.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-extrabold text-[var(--on-marker)] transition hover:brightness-110"
                      >
                        {action.label}
                      </a>
                    ) : (
                      <a
                        key={action.href}
                        href={action.href}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-extrabold text-[var(--on-marker)] transition hover:brightness-110"
                      >
                        {action.label}
                      </a>
                    )
                  )}
                </div>
              )}
              {/* 📊/🔊 أدوات الشرح — بس للأجوبة الطويلة (مش رسالة الترحيب) */}
              {msg.role === "assistant" && msg.content.length > 120 && (
                <>
                  <div className="mt-2 flex flex-wrap gap-2 border-t border-[var(--rule)] pt-2">
                    <button type="button" onClick={() => generateSlides(i, msg.content)} className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-[var(--rule)] text-ink-soft hover:bg-paper-3 transition">
                      {slidesPanel?.index === i && slidesPanel.loading ? "⏳ جاري التوليد…" : slidesPanel?.index === i ? "✕ إخفاء الشرائح" : "📊 شرائح"}
                    </button>
                    <button type="button" onClick={() => speakAnswer(i, msg.content)} className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-[var(--rule)] text-ink-soft hover:bg-paper-3 transition">
                      {speakingIdx === i ? "⏹ إيقاف" : "🔊 استمع"}
                    </button>
                  </div>
                  {slidesPanel?.index === i && slidesPanel.loading && (
                    <p className="mt-1 text-[11px] text-ink-soft">جاري توليد الشرائح من الشرح…</p>
                  )}
                  {slidesPanel?.index === i && !slidesPanel.loading && (slidesPanel.slides?.length ?? 0) === 0 && (
                    <p className="mt-1 text-[11px] text-rose-600">تعذر توليد الشرائح — جرب تاني.</p>
                  )}
                  {slidesPanel?.index === i && (slidesPanel.slides?.length ?? 0) > 0 && (
                    <ChatSlides topic={slidesPanel.topic ?? ""} slides={slidesPanel.slides!} />
                  )}
                </>
              )}
            </div>
          </div>
        );
        })}
        {loading && (
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-[var(--accent)] text-[var(--on-marker)] text-sm flex items-center gap-2">
              <LoaderCircle className="w-4 h-4 animate-spin" /> جارٍ التفكير…
            </div>
          </div>
        )}
      </div>
        </div>{/* ← قفل max-w-3xl (نهاية منطقة الرسائل) */}
      </div>{/* ← قفل الـ scroller */}

      {/* ═══════════════════════════════════════════════════════════════
          شريط الكتابة (composer) — **مثبّت** تحت منطقة الرسائل.

          ⚠️ كان جوه الـ scroller، فكان بيختفي تحت الـ fold والصفحة
             بتعمل scrollbar مزدوج (الصفحة + الـ scroller). دلوقتي هو
             sibling للـ scroller جوّه grid، فبيفضل ظاهر مهما
             الـ messages scroll.

             الخلفية `bg-paper` ضرورية: من غيرها الـ messages بتظهر
             من ورا الشريط لما بتسكرول.
          ═══════════════════════════════════════════════════════════════ */}
      <div className="border-t border-rule bg-paper">
        <div className="mx-auto max-w-3xl md:max-w-4xl xl:max-w-5xl px-4 py-3" dir="rtl">

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
               aria-label="Remove attachment"
            >
              <X size={12} />
            </button>
          </div>
          <div className="text-xs">
            <p className="font-medium">{attachment.file.name}</p>
            <p>المساعد هيقرأ محتواه تلقائياً</p>
          </div>
        </div>
      )}

      {voiceNotice && (
        <p className="mb-2 text-[11px] text-rose-600" role="alert">🔇 {voiceNotice}</p>
      )}

      {/* 🧠 اختيار الشخصية — Auto افتراضيًا والـ Orchestrator يختار في الخلفية */}
      <div className="flex flex-wrap gap-1.5 mb-2" role="group" aria-label="الشخصية">
        {(["auto", "tutor", "play", "coach"] as const).map((id) => {
          const active = personaChoice === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setPersonaChoice(id)}
              aria-pressed={active}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full border transition ${
                active
                  ? "bg-[var(--accent)] text-[var(--on-marker)] border-transparent"
                  : "border-rule bg-paper text-ink-soft hover:bg-paper-3"
              }`}
            >
              {id === "auto" ? "⚡ Auto" : `${PERSONAS[id].emoji} ${PERSONAS[id].name}`}
            </button>
          );
        })}
      </div>

      {/* 🎨 أساليب الشرح — شرح تفاعلي بأكثر من طريقة (زي المدرس الشطور) */}
      <div className="flex flex-wrap gap-1.5 mb-2" role="group" aria-label="أسلوب الشرح">
        {STYLE_CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setStyleModifier((v) => (v === c.id ? null : c.id))}
            aria-pressed={styleModifier === c.id}
            className={`text-[11px] font-bold px-2.5 py-1 rounded-full border transition ${
              styleModifier === c.id
                ? "bg-[var(--accent)] text-[var(--on-marker)] border-transparent"
                : "border-rule bg-paper text-ink-soft hover:bg-paper-3"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Input bar */}
      <div className="flex items-end gap-2 bg-paper border border-rule rounded-2xl px-3 py-2 shadow-sm">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="إرفاق ملف"
          className="p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl hover:bg-paper-3 text-ink-soft transition"
        >
          <Paperclip size={20} />
        </button>
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          aria-label="إرفاق صورة"
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
          /* ⚠️ الـ hook ده لسكربت الفحص (`npm run check:navbar`) — بيختار
             شريط الكتابة **بالاسم** مش «أول textarea في الصفحة». من غيره
             السكربت كان بيلقط textarea محرّر التفريغ في صفحة المحاضرات
             وبيحسب ارتفاع غلط. */
          data-navsmoke="chat-composer"
          className="flex-1 bg-transparent text-sm font-body resize-none outline-none py-2 min-h-[36px] max-h-[120px]"
          placeholder="اسأل أي حاجة.. أو ارفع ملف/صورة (PDF والصور بتتقري تلقائياً)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        {continuing && (
          <button
            onClick={() => { continueAbortRef.current = true; }}
            aria-label="إيقاف استكمال الشرح"
            title="إيقاف استكمال الشرح"
            className="p-2 rounded-full border border-[var(--border)] text-[var(--ink-soft)] hover:text-[var(--accent)] transition"
          >
            <Square size={16} />
          </button>
        )}
        <button
          onClick={send}
          disabled={loading || continuing || (!input.trim() && !attachment)}
           aria-label="Send message"
        >
          <Send size={18} />
        </button>
      </div>

      <div className="flex items-center justify-between mt-3 px-1">
         <p className="text-[11px] text-ink-soft">
          {creditUsage
            ? `⚡ رصيد اليوم: ${creditUsage.used}/${creditUsage.limit} credit — الطلب = ${CREDIT_COSTS["unified-ai"]} · الشرائح = ${CREDIT_COSTS["generate-slides"]} · الشرح الطويل يكمّل تلقائيًا على أجزاء (حتى ${MAX_CONTINUATION_PARTS})`
            : `⚡ الطلب = ${CREDIT_COSTS["unified-ai"]} credit · الشرائح = ${CREDIT_COSTS["generate-slides"]} credits · الشرح الطويل يكمّل تلقائيًا على أجزاء`}
        </p>
        <div className="flex items-center gap-1 text-[11px] text-ink-soft">
          <Sparkles size={12} /> <span>Magicly</span>
        </div>
      </div>

      {rateLimitInfo && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 dark:bg-amber-950/30 dark:border-amber-800 p-4 shadow-sm" role="alert" dir={isAr ? "rtl" : "ltr"}>
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
                                               تقدر تجرب تاني بعد {rateLimitInfo.retryAfterHours} ساعة تقريباً{rateLimitInfo.retryAfter ? ` (حوالي ${Math.ceil(rateLimitInfo.retryAfter / 60)} دقيقة)` : ""}
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
                      {a.label.includes("ترقية") ? <Crown size={14} /> : <ShoppingBag size={14} />}
                      {a.label}
                    </Link>
                  )
                )}
              </div>
            </div>
            <button
              onClick={() => setRateLimitInfo(null)}
              className="shrink-0 p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-amber-700 dark:text-amber-300"
              aria-label="إغلاق"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
        </div>{/* ← قفل inner composer (max-w-3xl) */}
      </div>{/* ← قفل شريط الكتابة */}
    </div>{/* ← قفل عمود grid (scroller + composer) */}
  </div>
  );
}
