"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Reveal } from "@/app/lesson/[dayId]/components/LessonChrome";

/* ==========================================================================
   Lesson Notes — Phase 1.

   ملاحظة واحدة لكل درس، بتحفظ لوحدها بعد ما الطالب يوقف يكتب. مفيش زر
   «احفظ» — اللي بيضغط على زر ممكن يسيب الدرس والملاحظة ماتتحفظش.

   📌 ليه الحفظ قبل الـunmount:
      الـautosave بيعتمد على تايمر 1200ms. لو الطالب كتب آخر كلمة وطلع من
      الدرس قبل ما التايمر يشتغل، الكلام ضاع. الـfetch في المكوّن بيكمل
      حتى لو الكومبوننت اتشال من الشاشة (المتصفح بيكمل الطلب المرسل)،
      فبنتكلم مع السيرفر فورًا في الـcleanup. القيم في refs مش state عشان
      نقراها وقت التفكيك — الـstate بيكون قديم في اللحظة دي.

   📌 ليه `lastSaved` مرجع منفصل عن state الحقل:
      عشان نعرف «اللي السيرفر أكّد حفظه». من غير مقارنة، الشاشة بتقول
      «اتحفظ» بناءً على النية مش على الواقع.
   ========================================================================== */

type Status = "idle" | "pending" | "saving" | "saved" | "error";

/** مدة السكون قبل الحفظ: أقل من أن يستني المستخدم، أكتر من أن نكتب كل كلمة. */
const AUTOSAVE_MS = 1200;

export function LessonNotes({ dayId }: { dayId: string }) {
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [loaded, setLoaded] = useState(false);

  /** آخر محتوى أكّد السيرفر حفظه — مرجع المقارنة. */
  const lastSavedRef = useRef("");
  /** النص الحالي في مرآة، لأن الـcleanup بيقراه وقت التفكيك. */
  const draftRef = useRef("");
  /** التايمر جاري — بنلغيه لو الطالب كتب تاني قبل ما يشتغل. */
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** الـcomponent لسه شغّال؟ بيمنع setState بعد الـunmount. */
  const aliveRef = useRef(true);

  /* ── الحفظ الحقيقي (معرّف قبل ما أي تأثير يستخدمه) ── */
  const persist = useCallback(
    async (content: string) => {
      if (aliveRef.current) setStatus("saving");
      try {
        const res = await fetch("/api/lesson/notes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lessonId: dayId, content }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        // السيرفر هو المرجع: بنسجّله هو اللي ردّ، مش اللي بعناه.
        lastSavedRef.current = typeof data.content === "string" ? data.content : content;
        if (aliveRef.current) setStatus("saved");
      } catch {
        if (aliveRef.current) setStatus("error");
      }
    },
    [dayId]
  );

  /* ── جلب الملاحظة الموجودة ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/lesson/notes?lessonId=${encodeURIComponent(dayId)}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (cancelled) return;
        const content = typeof data.content === "string" ? data.content : "";
        lastSavedRef.current = content;
        draftRef.current = content;
        setDraft(content);
      } catch {
        // فشل الجلب مش fatal: نسيب الحقل فاضي والطالب يكتب من الأول.
        // أخطر من إن القسم كله يبقى مكسور.
        if (!cancelled) setStatus("error");
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dayId]);

  /* مرآة النص الحالي — محدّثة مع كل كتابة. */
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  /* ── التغيير + الـdebounce ── */
  const handleChange = (value: string) => {
    setDraft(value);
    draftRef.current = value;
    setStatus("pending");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void persist(value);
    }, AUTOSAVE_MS);
  };

  /* ── العلامة + آخر محاولة حفظ قبل التفكيك ── */
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // فيه نص مش متطابق مع المحفوظ → نحفظه فورًا. المتصفّح بيسلّم
      // الطلب المرسل حتى لو الصفحة بتتشيّل، فمفيش سبب نضيّع الكلام.
      if (draftRef.current !== lastSavedRef.current) {
        void persist(draftRef.current);
      }
    };
  }, [dayId, persist]);

  return (
    <Reveal delay={0.15}>
      <div className="sheet-card p-5 sm:p-6 space-y-4">
        <div>
          <p className="eyebrow eyebrow-flush mb-1.5">ملاحظاتك</p>
          <h2 className="h3">اكتب اللي فهمته من الدرس</h2>
        </div>

        <textarea
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          rows={5}
          dir="rtl"
          aria-label="ملاحظات الدرس"
          placeholder="اكتب اللي فهمته، أو الأسئلة اللي لسه محتاج ترجع لها…"
          className="field text-sm w-full resize-y"
        />

        {/* aria-live: قارئ الشاشة يقول «اتحفظت» من غير ما يركّز على الحقل. */}
        <div className="flex items-center gap-3 min-h-6" aria-live="polite" role="status">
          {status === "pending" && <span className="text-[11px] text-ink-soft">بتحفظ بعد شوية…</span>}
          {status === "saving" && <span className="text-[11px] text-ink-soft">بيحفظ…</span>}
          {status === "saved" && <span className="tag">اتحفظت</span>}
          {status === "error" && (
            <span className="notice notice-error text-[11px] py-1.5 px-2.5">
              مقدرناش نحفظ — هيتبعت تاني أول ما تكتب.
            </span>
          )}
          {status === "idle" && loaded && (
            <span className="text-[11px] text-ink-soft">بتتحفظ لوحدها — مفيش زرار حفظ.</span>
          )}
        </div>
      </div>
    </Reveal>
  );
}
