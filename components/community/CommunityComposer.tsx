"use client";

// ===========================================================================
// MAGICLY — Community C7: كومبوزر المنشورات المُعاد تصميمه + Magic AI
// ---------------------------------------------------------------------------
// - صف مختصر «ايه اللي في بالك؟» يتمدد لكاتب منشور كامل
// - أنواع المنشور كرقاقات (chips) بأيقونات بدل قائمة select
// - ✨ Magic AI: تحسين الصياغة · وسّع فكرتك · اقتراح هاشتاجات
//   (عبر /api/community/ai-assist — rate limited سيرفر سايد)
// - عداد أحرف، رفع صورة، خيارات استطلاع، اختيار من يشوف المنشور
// ===========================================================================

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Sparkles, Send, X, BarChart3 } from "lucide-react";
import { postErrorAr } from "@/lib/community/types";

const KINDS: { id: string; label: string; emoji: string }[] = [
  { id: "text", label: "منشور", emoji: "📝" },
  { id: "achievement", label: "إنجاز دراسي", emoji: "🎓" },
  { id: "question", label: "سؤال أكاديمي", emoji: "❓" },
  { id: "tip", label: "معلومة مفيدة", emoji: "💡" },
  { id: "summary", label: "ملخص أو مصدر", emoji: "📚" },
  { id: "challenge", label: "تحدي", emoji: "🏆" },
  { id: "poll", label: "استطلاع رأي", emoji: "📊" },
];

const VISIBILITIES = [
  { id: "public", label: "🌍 عام" },
  { id: "friends", label: "👥 الأصدقاء" },
  { id: "private", label: "🔒 خاص بي" },
];

const AI_ACTIONS: { id: "improve" | "expand" | "hashtags"; label: string; hint: string }[] = [
  { id: "improve", label: "حَسّن الصياغة", hint: "يحسّن نصك بنفس المعنى" },
  { id: "expand", label: "وسّع فكرتك", hint: "يحول فكرة قصيرة لمنشور جاهز" },
  { id: "hashtags", label: "اقترح هاشتاجات", hint: "يضيف هاشتاجات مناسبة" },
];

const MAX_LEN = 2000;

export default function CommunityComposer({
  displayName,
  onPublished,
}: {
  displayName?: string | null;
  onPublished?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("text");
  const [visibility, setVisibility] = useState("public");
  const [body, setBody] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // لينكات التحديات: /community?hashtag=X → نفتح الكومبوزر والهاشتاج جاهز
  useEffect(() => {
    const tag = new URLSearchParams(window.location.search).get("hashtag");
    if (tag) {
      setKind("challenge");
      setBody(`#${tag} `);
      setOpen(true);
      // ننضّف اللينك عشان الريفريش ميعيدش الحشو
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  // Magic AI
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const firstName = (displayName || "").trim().split(/\s+/)[0] || "";

  const autoGrow = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
    }
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/community/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.success) setImage(data.url);
      else setError(data.error || "تعذّر رفع الصورة.");
    } catch {
      setError("مشكلة شبكة أثناء رفع الصورة.");
    } finally {
      setUploading(false);
    }
  };

  const runMagic = async (mode: "improve" | "expand" | "hashtags") => {
    const text = body.trim();
    if (!text) {
      setAiNote("اكتب فكرتك أولًا وبعدين جرب Magic AI.");
      return;
    }
    setAiBusy(mode);
    setAiNote(null);
    try {
      const res = await fetch("/api/community/ai-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, text }),
      });
      const data = await res.json();
      if (data.success && typeof data.text === "string") {
        setBody(data.text);
        setAiOpen(false);
        requestAnimationFrame(autoGrow);
      } else {
        setAiNote(data.error || "المساعد مش متاح حاليًا.");
      }
    } catch {
      setAiNote("مشكلة شبكة — حاول تاني.");
    } finally {
      setAiBusy(null);
    }
  };

  const publish = async () => {
    const text = body.trim();
    if (!text || publishing) return;
    setPublishing(true);
    setError(null);
    try {
      const options = kind === "poll" ? pollOptions.map((o) => o.trim()).filter(Boolean) : undefined;
      const res = await fetch("/api/community/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, body: text, visibility, imageUrl: image, options }),
      });
      const data = await res.json();
      if (data.success) {
        setBody("");
        setImage(null);
        setKind("text");
        setPollOptions(["", ""]);
        setOpen(false);
        setAiNote(null);
        onPublished?.();
      } else {
        setError(postErrorAr(data.code, data.error || "تعذّر النشر."));
      }
    } catch {
      setError("مشكلة شبكة — حاول تاني.");
    } finally {
      setPublishing(false);
    }
  };

  const inputCls = "w-full rounded-xl border border-rule bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-marker";

  // الحالة المطوية: صف واحد بيشعل الكومبوزر
  if (!open) {
    return (
      <div className="rounded-2xl border border-rule bg-paper-2 p-4">
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-start transition hover:bg-paper"
          aria-expanded={false}
          aria-label="اكتب منشورًا جديدًا"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-marker/10 text-marker">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="flex-1 truncate text-sm text-ink-soft">
            ايه اللي في بالك{firstName ? ` يا ${firstName}` : ""}؟ شارك إنجازك، اسأل، أو اكتب معلومة تفيد زمايلك…
          </span>
          <span className="shrink-0 rounded-full bg-marker/10 px-3 py-1 text-xs font-bold text-marker">
            ✨ Magic
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-rule bg-paper-2 p-4">
      {/* رقاقات النوع */}
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="نوع المنشور">
        {KINDS.map((k) => (
          <button
            key={k.id}
            onClick={() => setKind(k.id)}
            aria-pressed={kind === k.id}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition ${
              kind === k.id
                ? "bg-marker text-white"
                : "border border-rule bg-paper text-ink-soft hover:border-marker/50"
            }`}
          >
            <span aria-hidden>{k.emoji}</span>
            {k.label}
          </button>
        ))}
      </div>

      {/* النص */}
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          autoGrow();
        }}
        placeholder={
          kind === "question"
            ? "سؤالك إيه؟ اكتبه بالتفصيل عشان زمايلك يقدروا يساعدوك… (#هاشتاج و@MAG-XXX-XXXX مدعومين)"
            : kind === "achievement"
              ? "مبروك مسبقًا! اكتب إنجازك — ايه اللي حققته وإزاي وصلته…"
              : "اكتب منشورك… (#هاشتاج و@MAG-XXX-XXXX مدعومين)"
        }
        className={`${inputCls} min-h-24 resize-none overflow-hidden`}
        maxLength={MAX_LEN}
        aria-label="منشور جديد"
      />

      {/* Magic AI */}
      <div className="relative mt-2">
        <button
          onClick={() => setAiOpen((v) => !v)}
          disabled={aiBusy !== null}
          aria-expanded={aiOpen}
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-l from-violet-600 to-marker px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Magic AI
        </button>
        {aiOpen && (
          <div className="absolute z-10 mt-1 w-64 rounded-xl border border-rule bg-paper p-1.5 shadow-xl">
            {AI_ACTIONS.map((a) => (
              <button
                key={a.id}
                onClick={() => void runMagic(a.id)}
                disabled={aiBusy !== null}
                className="block w-full rounded-lg px-3 py-2 text-start text-xs transition hover:bg-paper-2 disabled:opacity-50"
              >
                <span className="flex items-center gap-1.5 font-bold text-ink">
                  <Sparkles className="h-3 w-3 text-violet-600" />
                  {aiBusy === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  {a.label}
                </span>
                <span className="mt-0.5 block text-ink-soft">{a.hint}</span>
              </button>
            ))}
          </div>
        )}
        {aiNote && <p className="mt-1 text-xs text-amber-600">{aiNote}</p>}
      </div>

      {/* معاينة الصورة */}
      {image && (
        <div className="relative mt-3 inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className="max-h-40 rounded-xl" />
          <button
            onClick={() => setImage(null)}
            aria-label="إزالة الصورة"
            className="absolute left-1 top-1 rounded-full bg-black/60 p-1 text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* خيارات الاستطلاع */}
      {kind === "poll" && (
        <div className="mt-3 space-y-2 rounded-xl bg-paper p-3" role="group" aria-label="خيارات الاستطلاع">
          {pollOptions.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 text-xs font-bold text-ink-soft">{i + 1}.</span>
              <input
                value={opt}
                onChange={(e) => setPollOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))}
                placeholder={`الخيار ${i + 1}`}
                className={inputCls}
                maxLength={100}
                aria-label={`الخيار ${i + 1}`}
              />
              {pollOptions.length > 2 && (
                <button
                  onClick={() => setPollOptions((prev) => prev.filter((_, j) => j !== i))}
                  aria-label="حذف الخيار"
                  className="text-ink-soft hover:text-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {pollOptions.length < 4 && (
            <button
              onClick={() => setPollOptions((prev) => [...prev, ""])}
              className="inline-flex items-center gap-1 text-xs font-semibold text-marker hover:underline"
            >
              <BarChart3 className="h-3 w-3" /> + خيار تاني
            </button>
          )}
        </div>
      )}

      {/* الشريط السفلي */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className={`${inputCls} w-auto`} aria-label="من يشوف المنشور">
          {VISIBILITIES.map((v) => (
            <option key={v.id} value={v.id}>{v.label}</option>
          ))}
        </select>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-rule px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-paper">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          صورة
          <input
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadImage(f);
              e.target.value = "";
            }}
          />
        </label>
        <span className={`text-[11px] ${body.length > MAX_LEN - 100 ? "text-amber-600" : "text-ink-soft"}`} aria-live="polite">
          {body.length}/{MAX_LEN}
        </span>
        <div className="mr-auto flex items-center gap-2">
          <button onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-sm text-ink-soft hover:bg-paper" disabled={publishing}>
            إلغاء
          </button>
          <button
            onClick={() => void publish()}
            disabled={publishing || !body.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-marker px-4 py-1.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            نشر
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
