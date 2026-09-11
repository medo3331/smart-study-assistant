"use client";
/* eslint-disable @next/next/no-img-element -- الصورة المولدة بتيجي من مزوّد خارجي (URL/بيس64) فمش مناسبة لـ next/image */
/**
 * ImageGenerator — واجهة توليد الصور التعليمية
 *
 * فورم بسيط: وصف الصورة + الأسلوب + الحجم + الموديل + المرحلة،
 * ويضرب /api/ai/image ويعرض النتيجة مع زر تحميل.
 */
import React, { useState } from "react";
import { Download, ImageIcon, LoaderCircle, Sparkles, AlertTriangle } from "lucide-react";

const STYLES = [
  { value: "educational", label: "📚 تعليمي (كتاب مدرسي)" },
  { value: "infographic", label: "📊 إنفوجرافيك" },
  { value: "cartoon", label: "🎨 كرتون (لصغار السن)" },
  { value: "realistic", label: "📷 واقعي" },
];

const SIZES = [
  { value: "1024x1024", label: "مربع 1:1" },
  { value: "1792x1024", label: "عريض 16:9" },
  { value: "1024x1792", label: "طولي 9:16" },
];

const MODELS = [
  { value: "", label: "تلقائي (حسب الباقة)" },
  { value: "pollinations", label: "Pollinations — مجاني وسريع ⚡" },
  { value: "dall-e-3", label: "DALL-E 3 — أعلى جودة" },
  { value: "flux-pro", label: "Flux Pro — سريع وممتاز" },
  { value: "stable-diffusion-xl", label: "SDXL — اقتصادي" },
];

const STAGES = ["ابتدائي", "إعدادي", "ثانوي", "جامعي"];

interface ImageGeneratorProps {
  /** مادة افتراضية تُحقن في السياق (اختياري). */
  defaultSubject?: string;
}

export function ImageGenerator({ defaultSubject }: ImageGeneratorProps) {
  const [prompt, setPrompt] = useState("");
  const [subject, setSubject] = useState(defaultSubject ?? "");
  const [stage, setStage] = useState("");
  const [style, setStyle] = useState("educational");
  const [size, setSize] = useState("1024x1024");
  const [model, setModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    url: string;
    model: string;
    revisedPrompt?: string;
  } | null>(null);

  const generate = async () => {
    if (prompt.trim().length < 3 || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          subject: subject.trim() || undefined,
          stage: stage || undefined,
          style,
          size,
          model: model || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg =
          data?.error?.message ??
          (res.status === 402
            ? "وصلت لحد الصور اليومي أو الخدمة غير متاحة في باقتك."
            : "تعذّر توليد الصورة. حاول مرة تانية.");
        setError(msg);
        return;
      }

      setResult({ url: data.url, model: data.model, revisedPrompt: data.revisedPrompt });
    } catch {
      setError("حصل خطأ في الاتصال. تأكد من الإنترنت وجرّب تاني.");
    } finally {
      setLoading(false);
    }
  };

  const downloadImage = async () => {
    if (!result?.url) return;
    try {
      let href = result.url;
      if (!href.startsWith("data:")) {
        const blob = await fetch(result.url).then((r) => r.blob());
        href = URL.createObjectURL(blob);
      }
      const a = document.createElement("a");
      a.href = href;
      a.download = `magically_image_${Date.now()}.png`;
      a.click();
      if (!href.startsWith("data:")) URL.revokeObjectURL(href);
    } catch {
      // لو التحميل المباشر فشل نفتح الصورة في تاب جديد
      window.open(result.url, "_blank");
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4" dir="rtl">
      {/* الوصف */}
      <div>
        <label className="block text-xs font-bold text-slate-300 mb-2">
          🖼️ ايه الصورة اللي محتاجها؟
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="مثال: رسم توضيحي للدورة الدموية في جسم الإنسان يوضح مسار الدم من القلب للرئتين..."
          className="w-full rounded-xl bg-slate-950/70 border border-slate-700 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/60"
        />
      </div>

      {/* صف الخيارات */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">الأسلوب</label>
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            className="w-full rounded-xl bg-slate-950/70 border border-slate-700 px-2 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/60"
          >
            {STYLES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">الحجم</label>
          <select
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="w-full rounded-xl bg-slate-950/70 border border-slate-700 px-2 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/60"
          >
            {SIZES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">المرحلة</label>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="w-full rounded-xl bg-slate-950/70 border border-slate-700 px-2 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/60"
          >
            <option value="">عام</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">الموديل</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-xl bg-slate-950/70 border border-slate-700 px-2 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/60"
          >
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* المادة (اختياري) */}
      {!defaultSubject && (
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="المادة (اختياري) — مثل: أحياء، فيزياء..."
          className="w-full rounded-xl bg-slate-950/70 border border-slate-700 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/60"
        />
      )}

      {/* الخطأ */}
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-950/30 px-3 py-2.5 text-xs text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* زر التوليد */}
      <button
        onClick={generate}
        disabled={loading || prompt.trim().length < 3}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-purple-600 to-fuchsia-600 px-4 py-3 text-sm font-bold text-white transition-opacity disabled:opacity-50 hover:opacity-90"
        type="button"
      >
        {loading ? (
          <>
            <LoaderCircle className="h-4 w-4 animate-spin" />
            جاري توليد الصورة... (ممكن ياخد حتى دقيقة)
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            ولّد الصورة
          </>
        )}
      </button>

      {/* النتيجة */}
      {result && (
        <div className="space-y-2">
          <img
            src={result.url}
            alt="صورة تعليمية مولدة بالذكاء الاصطناعي"
            className="w-full rounded-xl border border-slate-700"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500">
              الموديل: {result.model === "pollinations" ? "Pollinations (Flux) — مجاني" : result.model}
            </span>
            <button
              onClick={downloadImage}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
              type="button"
            >
              <Download className="h-3.5 w-3.5" />
              تحميل الصورة
            </button>
          </div>
        </div>
      )}

      {!result && !loading && !error && (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-700 px-3 py-4 text-xs text-slate-500">
          <ImageIcon className="h-4 w-4" />
          الصور المولدة بتظهر هنا — جرّب تطلب رسم توضيحي لدرس بتذاكره.
        </div>
      )}
    </div>
  );
}
