"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Syncing with external system (Supabase/localStorage) is intentional; see TODO for future useEffectEvent refactor */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { PageShell, DataNotice, usePenTheme } from "../components/PageShell";
import { THEME_STYLES } from "../components/theme-helpers";
import { takeSlidesSeed } from "../components/nav-config";
import { ReadAloud } from "@/components/ReadAloud";

/* ==========================================================================
   مولّد العروض — من موضوع لعرض شرائح

   الاستخدام: تكتب موضوع (أو تلزق نص مادة)، بيرجّع شرائح تقدر تستعرضها
   بالكيبورد وتصدّرها PDF.

   ليه ده مفيد لمبرمج؟ عرض المشروع في الشغل أو الكلية، ومراجعة سريعة
   قبل الامتحان — الشريحة بتجبرك تلخّص، والتلخيص هو المراجعة.

   قرارات:
   • الشرائح **مش بتتخزن في الداتابيز**. مفيش جدول ولا RLS جديدة، والعرض
     عايش في حالة الصفحة. لو المستخدم عايز يحتفظ بيه يصدّره PDF.
   • التصدير بـ html2pdf.js (متسطّبة في المشروع ومكانت مستوردة في أي حتة).
     الاستيراد **ديناميكي** لأنها بتلمس window عند التحميل، وده بيكسر
     الـ SSR لو اتستوردت فوق.
   • كل شريحة بتتصدّر ورقة landscape لوحدها — `break-after` في الـ CSS.
   ========================================================================== */

interface Slide {
  title: string;
  bullets: string[];
  note: string;
  code: string | null;
}

const SLIDE_COUNTS = [6, 8, 10, 12];

/**
 * مقاس ورقة التصدير بالبكسل (A4 landscape عند 96dpi).
 * المعاينة بتقرا منهم كمان عشان الشكلين ما يفرقوش.
 */
const EXPORT_W = 1123;
const EXPORT_H = 794;

/* --------------------------------------------------------------------------
   الشريحة الواحدة

   نفس الشكل بيتستخدم على الشاشة وفي التصدير، فالتصدير يطلع زي المعاينة
   بالظبط. الفرق الوحيد المقاس، وهو جاي من الأب.
   -------------------------------------------------------------------------- */

function SlideBody({
  slide,
  index,
  total,
  deckTopic,
  accentBg,
}: {
  slide: Slide;
  index: number;
  total: number;
  deckTopic: string;
  accentBg: string;
}) {
  return (
    <div className="h-full flex flex-col p-8 sm:p-10" dir="rtl">
      {/* ترويسة: الموضوع + رقم الشريحة. خط الهامش الأحمر بيفصلها */}
      <div className="flex items-baseline justify-between gap-4 pb-3 mb-5 border-b border-rule">
        <p className="eyebrow eyebrow-flush truncate">{deckTopic}</p>
        <p className="mono shrink-0">
          <span className="ltr-num tnum">
            {index + 1} / {total}
          </span>
        </p>
      </div>

      <h3 className="font-display font-extrabold text-2xl sm:text-3xl leading-tight text-ink mb-5">
        {slide.title}
      </h3>

      <ul className="space-y-3 flex-1 min-h-0">
        {slide.bullets.map((b, i) => (
          <li key={i} className="flex gap-3 items-start">
            {/* مربّع صغير بلون القلم بدل النقطة — بيدي إيقاع بصري */}
            <span className={`${accentBg} w-2 h-2 rounded-[2px] mt-2 shrink-0`} aria-hidden />
            <span className="text-sm sm:text-base leading-relaxed text-ink">{b}</span>
          </li>
        ))}

        {slide.code && (
          <li className="pt-1">
            {/* الكود LTR جوه صفحة RTL — من غير dir صريح بيتقلب */}
            <pre
              dir="ltr"
              className="bg-paper border border-rule rounded-[var(--r-sm)] p-3.5 overflow-x-auto text-[11.5px] leading-relaxed"
            >
              <code className="font-mono text-ink">{slide.code}</code>
            </pre>
          </li>
        )}
      </ul>
    </div>
  );
}

interface SlideDeckProps {
  slides: Slide[];
  deckTopic: string;
  current: number;
  onGo: (delta: number) => void;
  onJump: (index: number) => void;
  onExport: () => void;
  isExporting: boolean;
  accentBg: string;
  deckRef: React.RefObject<HTMLDivElement | null>;
}

function SlideDeck({
  slides,
  deckTopic,
  current,
  onGo,
  onJump,
  onExport,
  isExporting,
  accentBg,
  deckRef,
}: SlideDeckProps) {
  const slide = slides[current];
  if (!slide) return null;

  return (
    <>
      {/* ---------- المعاينة ---------- */}
      <div className="sheet-card sheet-card-live overflow-hidden">
        {/* ⚠️ النسبة لازم تطابق مقاس التصدير بالظبط (A4 landscape = 1123×794،
            نسبة ١٫٤١) مش 16:9. لو اختلفوا، اللي يبان مظبوط في المعاينة
            بيطلع مقطوع أو بفراغ كبير في الـ PDF. المقاسات معرّفة في
            EXPORT_W/EXPORT_H تحت وبيتقرا منهم هنا عشان يفضلوا متزامنين. */}
        <div style={{ aspectRatio: `${EXPORT_W} / ${EXPORT_H}` }} className="min-h-[300px]">
          <SlideBody
            slide={slide}
            index={current}
            total={slides.length}
            deckTopic={deckTopic}
            accentBg={accentBg}
          />
        </div>
      </div>

      {/* ---------- التنقل ---------- */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => onGo(-1)}
          disabled={current === 0}
          className="btn btn-quiet text-xs px-3.5 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          السابقة
        </button>
        <button
          onClick={() => onGo(1)}
          disabled={current === slides.length - 1}
          className="btn bg-ink text-paper-2 border-ink hover:opacity-90 text-xs px-3.5 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          التالية
        </button>

        <span className="mono ms-1">
          استخدم <span className="ltr-num">←</span> و <span className="ltr-num">→</span>
        </span>

        <button
          onClick={onExport}
          disabled={isExporting}
          className="btn btn-quiet text-xs px-3.5 py-2 ms-auto disabled:opacity-50"
        >
          {isExporting ? "بيصدّر…" : "تصدير PDF"}
        </button>
      </div>

      {/* ---------- كلام المتحدث ---------- */}
      {slide.note && (
        <div className="sheet-card p-5 space-y-3">
          <p className="eyebrow eyebrow-flush">كلام المتحدث</p>
          <p className="text-xs text-ink-soft leading-relaxed">{slide.note}</p>
          {/* تسمعه وإنت بتتمرّن على العرض من غير ما تبص على الشاشة */}
          <ReadAloud text={slide.note} resetKey={current} />
        </div>
      )}

      {/* ---------- شريط الشرائح ---------- */}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="الشرائح">
        {slides.map((s, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={i === current}
            aria-label={`شريحة ${i + 1}: ${s.title}`}
            onClick={() => onJump(i)}
            className={`mono w-8 h-8 rounded-[6px] border transition ${
              i === current
                ? "bg-ink text-paper-2 border-ink"
                : "bg-paper-2 border-rule text-ink-soft hover:text-ink hover:border-rule-strong"
            }`}
          >
            <span className="ltr-num tnum">{i + 1}</span>
          </button>
        ))}
      </div>

      {/* ---------- طبقة التصدير ----------
          كل الشرائح مرصوصة ورا بعض بمقاس A4 landscape ثابت بالبكسل.
          مخفية عن العين وعن قارئ الشاشة، بس **مش** display:none —
          html2canvas مش بيقدر يرسم عنصر مخفي بيها. فبنبعدها بره الشاشة. */}
      <div className="fixed -left-[9999px] top-0" aria-hidden>
        <div ref={deckRef}>
          {slides.map((s, i) => (
            <div
              key={i}
              style={{
                width: EXPORT_W,
                height: EXPORT_H,
                // آخر شريحة من غير قطع، وإلا بيطلع ورقة فاضية زيادة
                pageBreakAfter: i === slides.length - 1 ? "auto" : "always",
              }}
              className="bg-paper-2 overflow-hidden"
            >
              <SlideBody
                slide={s}
                index={i}
                total={slides.length}
                deckTopic={deckTopic}
                accentBg={accentBg}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default function SlidesPage() {
  const theme = usePenTheme();
  const themeStyles = THEME_STYLES[theme];

  const [topic, setTopic] = useState("");
  const [source, setSource] = useState("");
  const [slideCount, setSlideCount] = useState(8);
  const [showSource, setShowSource] = useState(false);

  const [slides, setSlides] = useState<Slide[]>([]);
  const [deckTopic, setDeckTopic] = useState("");
  const [current, setCurrent] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deckRef = useRef<HTMLDivElement | null>(null);

  // بذرة جاية من صفحة الدرس: الموضوع والشرح بيتحطوا في النموذج، والمستخدم
  // بيراجع ويدوس بنفسه. **مش** بنولّد تلقائياً — ده طلب بيستهلك توكنز،
  // وفتح الصفحة بالغلط مالوش لازمة يصرف نداء.
  useEffect(() => {
    const seed = takeSlidesSeed();
    if (!seed) return;
    setTopic(seed.topic);
          if (seed.source) {
      setSource(seed.source);
      setShowSource(true);
    }
  }, []);

  const handleGenerate = async () => {
    if (!topic.trim() || isGenerating) return;
    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/generate-slides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), source: source.trim(), slideCount }),
      });
      const json = await res.json();

      if (!res.ok || !json?.success) {
        setError(json?.error ?? "حصل خطأ أثناء توليد العرض. حاول تاني.");
        return;
      }

      setSlides(json.data.slides as Slide[]);
      setDeckTopic(json.data.topic as string);
      setCurrent(0);
    } catch {
      setError("مقدرتش أوصل للخدمة. اتأكد من الاتصال وحاول تاني.");
    } finally {
      setIsGenerating(false);
    }
  };

  const go = useCallback(
    (delta: number) => {
      setCurrent((c) => Math.min(Math.max(c + delta, 0), Math.max(slides.length - 1, 0)));
    },
    [slides.length]
  );

  /**
   * التصدير PDF.
   *
   * ⚠️ html2canvas بيرسّم الـ DOM كصورة، يعني الخط العربي بييجي من
   * المتصفح نفسه ومفيش مشكلة تشكيل أو اتجاه — بالظبط اللي على الشاشة.
   * بالمقابل النص في الـ PDF مش قابل للتحديد. ده مقبول لعرض شرائح.
   *
   * الاستيراد ديناميكي عشان المكتبة بتلمس window وقت التحميل.
   */
  const handleExport = async () => {
    const node = deckRef.current;
    if (!node || isExporting) return;
    setIsExporting(true);
    setError(null);

    try {
      const html2pdf = (await import("html2pdf.js")).default;

      // ⚠️ `pagebreak` مدعوم في المكتبة وقت التشغيل بس ناقص من ملف
      // الأنواع المرفق معاها (type.d.ts). بنبني الأوبشنز في متغير الأول
      // عن قصد: فحص «الخصائص الزيادة» في TypeScript بيشتغل على الكائن
      // المكتوب مباشرة في النداء بس، فكده بنعدّي من غير أي `as any`.
      const options = {
        margin: 0,
        filename: `${deckTopic || "عرض"}.pdf`,
        image: { type: "jpeg" as const, quality: 0.95 },
        // scale 2 = وضوح مقبول من غير ما حجم الملف يتفلت
        html2canvas: { scale: 2, useCORS: true, backgroundColor: null },
        jsPDF: {
          unit: "px",
          format: [EXPORT_W, EXPORT_H] as [number, number],
          orientation: "landscape" as const,
        },
        // من غير ده الشرائح بتتقطّع عند حدود الورقة عشوائياً بدل ما كل
        // شريحة تاخد ورقة. `css` بيخلي المكتبة تحترم page-break-after.
        pagebreak: { mode: ["css", "legacy"] },
      };

      await html2pdf().set(options).from(node).save();
    } catch {
      setError("مقدرتش أصدّر الـ PDF. جرّب تاني، ولو فضلت المشكلة استخدم طباعة المتصفح.");
    } finally {
      setIsExporting(false);
    }
  };

  // التنقل بالكيبورد. في RTL السهم الشمال بيروح **قدّام** — ده اللي
  // المستخدم متوقعه في واجهة عربي، والعكس بيحس إنه مقلوب.
  useEffect(() => {
    if (slides.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // ما نسرقش الأسهم من حقل بيكتب فيه
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowLeft") go(1);
      else if (e.key === "ArrowRight") go(-1);
      else if (e.key === "Home") setCurrent(0);
      else if (e.key === "End") setCurrent(slides.length - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length, go]);

  return (
    <PageShell
      eyebrow="Slides"
      title="مولّد العروض"
      lede="اكتب موضوع، وهجهّزلك عرض شرائح تقدر تستعرضه وتصدّره PDF."
      feedbackPage="slides"
      feedbackLabel="مولّد العروض"
    >
      <div className="space-y-5">
        {error && <DataNotice message={error} />}

        {/* ---------- نموذج التوليد ---------- */}
        <div className="sheet-card p-5 sm:p-6 space-y-4">
          <div>
            <p className="eyebrow eyebrow-flush mb-1.5">الموضوع</p>
            <h2 className="h3">عن إيه العرض؟</h2>
          </div>

          <div>
            <label htmlFor="slides-topic" className="field-label">
              اكتب الموضوع
            </label>
            <input
              id="slides-topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
              placeholder="مثال: الفرق بين Promise و async/await"
              className="field"
            />
          </div>

          {/* عدد الشرائح: نفس نمط الأزرار المجمّعة في باقي الصفحات */}
          <div>
            <span className="field-label">عدد الشرائح</span>
            <div
              className="flex bg-paper border border-rule p-1 rounded-[var(--r-sm)] gap-1"
              role="group"
              aria-label="عدد الشرائح"
            >
              {SLIDE_COUNTS.map((n) => (
                <button
                  key={n}
                  onClick={() => setSlideCount(n)}
                  aria-pressed={slideCount === n}
                  className={`mono flex-1 py-2 rounded-[6px] transition ${
                    slideCount === n ? "bg-ink text-paper-2" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  <span className="ltr-num tnum">{n}</span>
                </button>
              ))}
            </div>
          </div>

          {/* المحتوى المصدر: مقفول افتراضياً — أغلب الاستخدام موضوع بس */}
          <div>
            <button
              onClick={() => setShowSource((v) => !v)}
              aria-expanded={showSource}
              className="btn btn-quiet text-xs px-3.5 py-2"
            >
              {showSource ? "إلغاء المحتوى" : "الزق محتوى (اختياري)"}
            </button>
            {showSource && (
              <div className="mt-3">
                <label htmlFor="slides-source" className="field-label">
                  المحتوى اللي العرض يتبني عليه
                </label>
                <textarea
                  id="slides-source"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  rows={5}
                  placeholder="الزق ملخّص محاضرة أو ملاحظاتك، والعرض هيتبني منه بدل المعرفة العامة."
                  className="field resize-y"
                />
                <p className="mono mt-1.5">
                  <span className="ltr-num tnum">{source.length}</span> / ٦٠٠٠ حرف
                </p>
              </div>
            )}
          </div>

          {/* مقفول وقت التصدير كمان: التوليد بيشيل الشرائح من الشاشة،
              وطبقة التصدير معاها، فالـ PDF كان بيطلع نص عرض. */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || isExporting || !topic.trim()}
            className="btn btn-marker text-sm w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? "بيجهّز العرض…" : slides.length > 0 ? "جهّز عرض جديد" : "جهّز العرض"}
          </button>
        </div>

        {isGenerating && (
          <div className="sheet-card p-8 flex flex-col items-center gap-3" aria-busy="true">
            <span className="w-5 h-5 border-2 border-rule border-t-redpen rounded-full animate-spin" />
            <p className="tag justify-center">بيكتب الشرائح</p>
          </div>
        )}

        {slides.length > 0 && !isGenerating && (
          <SlideDeck
            slides={slides}
            deckTopic={deckTopic}
            current={current}
            onGo={go}
            onJump={setCurrent}
            onExport={handleExport}
            isExporting={isExporting}
            accentBg={themeStyles.accentBg}
            deckRef={deckRef}
          />
        )}
      </div>
    </PageShell>
  );
}