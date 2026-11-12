"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/* ==========================================================================
   🔗 سياق الاستشهاد — Phase 5
   ============================================================================

   ليه Context مش props: الحاجتين («الشرح المكثف» في قسم تاني و«التفريغ»
   في قسم تالت) في نفس الـ workspace. لو مرّرنا الـ state props، كان
   لازم يوصل لصفحة `/lectures` (Server Component) ⇒ drill-down في شجرة
   components كاملة. الـ context بيخلّي الاثنين يتكلموا مع بعض من غير
   ما الـ page يعرف حاجة.

   ⚠️ **`activeSeg` هو نفسه** — مش نسخة منه. السبب: المقطع بيتنقل بين
      الـ DOM (التفريغ الأصلي جوّه `<details>` أو مفتوح) فالمعرّف لازم
      يفضل واحد طول عمر الصفحة.

   ⚠️ **ليه مش scroll مباشر من الـ chip**: الـ transcript section ممكن
      يكون مقفول (الـ workspace بيقفل الأقسام المركزة). فالـ scroll
      محتاج القسم يكون مفتوح الأول — وده شغل الـ workspace context مش
      شغلنا. فالدور هنا: **حدّد المقطع المطلوب**، والباقي (فتح القسم +
      الـ scroll + الـ highlight) بيعمله الـ viewer لما العنصر يبقى موجود.
   ========================================================================== */

type CitationContextValue = {
  /** رقم المقطع المطلوب إبرازه — `null` = مفيش. */
  activeSeg: number | null;
  /** يطلب إبراز مقطع معيّن. */
  focusSegment: (seg: number | null) => void;
  /**
   * 🖍️ **المقطع اللي المؤشر عليه دلوقتي** (hover) — **مش** النشط.
   *
   * ⚠️ **ليه حالة منفصلة عن `activeSeg`**:
   *    - `activeSeg` = «الطالب اختار المصدر» ⇒ إبراز **قوي** + scroll.
   *    - `hoverSeg`  = «المؤشر فوق الجملة» ⇒ إبراز **خفيف** بس.
   *
   *    لو استعملنا حالة واحدة، أي hover هيعمل scroll للقسم التاني — وده
   *    بيقطّع القراءة في نص طويل.
   */
  hoverSeg: number | null;
  /** يحدّد المقطع اللي تحت المؤشر (أو `null` لما المؤشر يخرج). */
  setHoverSeg: (seg: number | null) => void;
};

const CitationContext = createContext<CitationContextValue | null>(null);

export function LectureCitationProvider({ children }: { children: ReactNode }) {
  const [activeSeg, setActiveSeg] = useState<number | null>(null);
  const [hoverSeg, setHoverSeg] = useState<number | null>(null);

  // ⚠️ `useCallback` بـ setter مباشر — `focusSegment` بتبقى نفس
  //    المرجع عبر الرندر، فالمكوّنات اللي بتستهلكها ما بتعملش
  //    re-render لما الـ context يتغيّر غير لما تتغيّر القيمة فعلاً.
  const focusSegment = useCallback((seg: number | null) => {
    setActiveSeg(seg);
  }, []);

  const value = useMemo(
    () => ({ activeSeg, focusSegment, hoverSeg, setHoverSeg }),
    [activeSeg, focusSegment, hoverSeg],
  );

  return (
    <CitationContext.Provider value={value}>{children}</CitationContext.Provider>
  );
}

/** يقرأ سياق الاستشهاد — لازم جوه `LectureCitationProvider`. */
export function useLectureCitation(): CitationContextValue {
  const value = useContext(CitationContext);
  if (!value) {
    throw new Error("useLectureCitation لازم يكون جوه LectureCitationProvider");
  }
  return value;
}

/**
 * ⏱ تنسيق توقيت للعرض: `12:30` أو `1:05:20`.
 *
 * ⚠️ **مش من `formatDuration` في `app/lectures/page.tsx`** — دي بتطبع
 * المدة الكلية بنفس الشكل تقريباً. دي بتطبع **نقطة زمنية** جوه
 * المحاضرة، ومعيارها إنها قصيرة (ثانيتين على الأكثر). بنستخدمها في
 * الـ chips عشان تلتف في سطر واحد.
 */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
