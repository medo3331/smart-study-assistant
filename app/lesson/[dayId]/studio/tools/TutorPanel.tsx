"use client";

import React, { useEffect, useRef } from "react";
import { UnifiedChat } from "@/components/unified-ai/UnifiedChat";
import { EXPLANATION_MODES, EXPLANATION_MODE_LABELS } from "@/lib/lesson/explanations";
import { useLessonStudio, useTutorContext } from "../LessonStudioProvider";

/* ==========================================================================
   TutorPanel (§4.1) — UnifiedChat واحد بحجمين: Panel مصغّر (docked على xl+)
   + تاب Tutor بحجم كامل. **المحادثة واحدة**: UnifiedChat بيتعمله mount مرة
   واحدة جوه TutorChatHost، والـ DOM node بتاعه بيتنقّل بين سلوتي الـ panel
   والتاب (نقل DOM خارج React ⇒ صفر فقدان state).
   ========================================================================== */

/** حاوية الـ UnifiedChat الواحدة — بتتنقل بين سلوة التاب وسلوة الـ Panel. */
export function TutorChatHost() {
  const { activeTab, setExplanationMode } = useLessonStudio();
  const tutorContext = useTutorContext();
  const holderRef = useRef<HTMLDivElement | null>(null);
  const inTab = activeTab === "tutor";

  // ⚡ أزرار سريعة (P2): ضغطة واحدة = تحديد طريقة الشرح + سؤال الشات بنفس الوضع.
  const quickPrompts = EXPLANATION_MODES.map((mode) => ({
    label: EXPLANATION_MODE_LABELS[mode],
    prompt: `اشرح لي درس «${tutorContext().lesson.title}» بـ${EXPLANATION_MODE_LABELS[mode]}.`,
    onClick: () => setExplanationMode(mode),
  }));

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    const target = inTab
      ? document.getElementById("studio-tutor-tab-slot")
      : document.getElementById("studio-tutor-panel-slot");
    // نقل الـ DOM node من غير لمس React — الـ state بتاع الشات بيفضل زي ما هو.
    if (target && holder.parentElement !== target) target.appendChild(holder);
  }, [inTab]);

  const tc = tutorContext();

  return (
    /* الغلاف الأصلي مخفي — الـ holder بيتنقل لسلوته في أول effect (قبل الرسم البصري عمليًا). */
    <div style={{ display: "none" }}>
      <div ref={holderRef} className="h-full">
        <UnifiedChat
          compact={!inTab}
          quickPrompts={quickPrompts}
          initialContext={{
            language: "ar",
            preferences: { language: "ar", field: tc.lesson.subject || "study" },
            // سياق الـ Studio (§2.4): القسم الحالي + مستوى الشرح + الفيديو المفتوح —
            // بيترسل مع كل رسالة جديدة من خلال initialContext الموجود — بدون تعديل السيرفر.
            studioContext: tc.extraContext,
          }}
          lesson={tc.lesson}
        />
      </div>
    </div>
  );
}

/** اللوحة الجانبية المصغّرة — docked على xl+ جوه عمود الـ grid. */
export default function TutorPanel() {
  const { activeTab } = useLessonStudio();
  const chatInTab = activeTab === "tutor";

  return (
    <div
      dir="rtl"
      className="h-full rounded-2xl border border-[var(--border)] bg-[var(--card-primary)]/70 backdrop-blur-xl overflow-hidden flex flex-col"
      aria-label="مساعد Magic AI — لوحة جانبية"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--card-secondary)] shrink-0">
        <span className="text-[12.5px] font-bold text-ink">✨ مساعد Magic — واعي بالدرس</span>
        {chatInTab && <span className="tag tag-quiet text-[9px]">مفتوح في تاب الدرس</span>}
      </div>
      {/* سلوة الـ panel — الـ holder بيجي هنا لما التاب النشط مش tutor */}
      <div id="studio-tutor-panel-slot" className="flex-1 min-h-0">
        {chatInTab && (
          <p className="p-4 text-xs text-ink-soft leading-relaxed">
            المحادثة مفتوحة دلوقتي في تاب «مساعد الدرس» بحجم كامل — رجّع أي تاب تاني وهترجع هنا مصغّرة بنفس الرسائل.
          </p>
        )}
      </div>
    </div>
  );
}
