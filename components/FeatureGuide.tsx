"use client";

import { useCallback, useId, useState, useSyncExternalStore } from "react";
import { CircleHelp, X } from "lucide-react";
import { cn } from "@/lib/cn";

/* ==========================================================================
   دليل الاستخدام — كومبوننت واحد لكل صفحة

   المشكلة اللي بيحلّها: كل صفحة كانت بتكتب تعليماتها بنفسها، فالنص
   اتكرر في أكتر من مكان واتفرق في الأسلوب، ومتلاقيش حد بيمرّ عليه
   (متلاقيش فين الدليل أصلاً).

   💡 الفكرة: كل صفحة تحط `<FeatureGuide {...guides.X} storageKey="guide:X" />`
      في أولها، والمحتوى كله في `lib/guides.ts` — ملف واحد، سهل يتظبط.

   💡 ليه `storageKey`؟ عشان الدليل **يفتح أول مرة بس**. المستخدم اللي
      قفله مش عايز يشوفه تاني — بس لازم يقدر يرجعله بضغطة (زر
      «إظهار دليل الاستخدام» بيظهر مكانه).

   ⚠️ SSR: `localStorage` مش موجود على السيرفر. بنقرا الحالة بعد
      الـ mount عشان الـ HTML الأولي والمفروض الأول يبقوا متطابقين
      (لوMismatch hydration error). الخانة `mounted` بتتأكد من إن
      القراءة جاهزة.
   ========================================================================== */

export type GuideStep = {
  /** عنوان الخطوة — إيه اللي المستخدم هيعمله */
  title: string;
  /** الشرح — إزاي بالظبط */
  body: string;
  /** تلميح اختياري — «نصيحة» بتوفّر وقت */
  tip?: string;
};

export type FeatureGuideProps = {
  /** عنوان الدليل */
  title: string;
  /** سطر واحد بيقول الصفحة دي بتعمل إيه */
  intro: string;
  /** الخطوات — مرقّمة */
  steps: GuideStep[];
  /** ملاحظات تحت الخطوات (قيود، حدود، تحذيرات) */
  notes?: string[];
  /** الدليل مفتوح أول مرة؟ (الافتراضي: أيوه) */
  defaultOpen?: boolean;
  /** مفتاح التخزين — لتذكّر إن المستخدم قفل الدليل */
  storageKey?: string;
  className?: string;
};

const DISMISSED_VALUE = "dismissed";

/* ==========================================================================
   حالة «الدليل مقفول» — متخزّنة في المتصفح

   ⚠️ ليه `useSyncExternalStore` مش `useState` + `useEffect`؟
      لأن `localStorage` حالة **برّا** React. والطريقة دي بتدّي التلات
      حاجات في نفس الوقت:
        1. مفيش `setState` جوّه effect (قاعدة eslint في المشروع).
        2. مفيش hydration mismatch: على السيرفر الـ snapshot = `false`
           (الدليل مفتوح)، وعلى الكلاينت الـ snapshot الحقيقي. React
           بيعمل hydration بالـ server snapshot وبعدين يحدّث.
        3. تغيّر المفتاح في **تبويب تاني** بيحدّث الدليل فورًا.
   ========================================================================== */

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function readDismissed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === DISMISSED_VALUE;
  } catch {
    // الستوريج مقفول (تصفح خفي) — نعتبره مفتوح
    return false;
  }
}

function subscribeDismissed(key: string, onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === key) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function FeatureGuide({
  title,
  intro,
  steps,
  notes,
  defaultOpen = true,
  storageKey,
  className,
}: FeatureGuideProps) {
  const [open, setOpen] = useState(defaultOpen);
  const regionId = useId();

  /* ---- الحالة المحفوظة: الدليل مقفول ولا لأ ---- */
  const dismissed = useSyncExternalStore(
    useCallback(
      (onChange: () => void) =>
        storageKey ? subscribeDismissed(storageKey, onChange) : () => {},
      [storageKey],
    ),
    useCallback(() => (storageKey ? readDismissed(storageKey) : false), [storageKey]),
    // snapshot السيرفر: الدليل مفتوح دايمًا — مفيش localStorage هناك
    () => false,
  );

  const visible = open && !dismissed;

  const dismiss = () => {
    setOpen(false);
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, DISMISSED_VALUE);
    } catch {
      // مفيش ستوريج — الدليل هيقفل بس من غير ما يتremember
    }
    emit();
  };

  const reopen = () => {
    setOpen(true);
    if (!storageKey) return;
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // مفيش ستوريج — مهمل
    }
    emit();
  };

  /* ---- مقفول: زر صغير في مكانه ---- */
  if (!visible) {
    return (
      <button
        type="button"
        onClick={reopen}
        aria-expanded={false}
        aria-controls={regionId}
        className={cn(
          "mb-4 inline-flex items-center gap-2 rounded-[var(--r-sm)] px-2 py-1 text-sm text-ink-soft transition-colors hover:text-ink",
          className,
        )}
      >
        <CircleHelp aria-hidden size={16} className="shrink-0" />
        <span>إظهار دليل الاستخدام</span>
      </button>
    );
  }

  /* ---- مفتوح: الدليل ---- */
  return (
    <section
      id={regionId}
      aria-label={title}
      className={cn("sheet-card mb-5 p-4 sm:p-5", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow eyebrow-flush mb-1.5">دليل الاستخدام</p>
          <h2 className="font-display font-extrabold text-base leading-snug text-ink">{title}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{intro}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-expanded={true}
          aria-controls={regionId}
          aria-label="إغلاق دليل الاستخدام"
          className="-m-1 shrink-0 rounded-[var(--r-sm)] p-1 text-ink-soft transition-colors hover:bg-paper-3 hover:text-ink"
        >
          <X aria-hidden size={18} />
        </button>
      </div>

      {steps.length > 0 && (
        <ol className="mt-4 space-y-3">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span
                aria-hidden
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--marker)] text-[0.7rem] font-bold text-[var(--on-marker)]"
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{step.title}</p>
                <p className="text-sm leading-relaxed text-ink-soft">{step.body}</p>
                {step.tip && (
                  <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                    <span aria-hidden>💡</span> {step.tip}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {notes && notes.length > 0 && (
        <div className="mt-4 space-y-1 rounded-[var(--r-sm)] border border-rule bg-paper p-3 text-xs leading-relaxed text-ink-soft">
          {notes.map((note, i) => (
            <p key={i}>
              <span aria-hidden>•</span> {note}
            </p>
          ))}
        </div>
      )}

      {storageKey ? (
        <p className="mt-3 text-[0.65rem] text-ink-soft/70">
          الدليل ده بيتفتح مرة واحدة بس — بعد ما تقفله، تقدر ترجعله من الزرار اللي
          فوق.
        </p>
      ) : null}
    </section>
  );
}
