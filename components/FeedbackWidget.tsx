"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAudio } from "@/components/audio/AudioProvider";

/* ==========================================================================
   ودجت الرأي — «الميزة دي عجبتك؟»

   بتظهر في كل صفحة. 👍 بتتبعت فوراً، و 👎 بتفتح حقل «إيه المشكلة؟».

   ⚠️ ثلاث قواعد بنت التصميم ده، وكلها عن «ماتزنّش على المستخدم»:

   ١) **مرة واحدة لكل صفحة، للأبد.** أي حد قيّم صفحة مايتسألش تاني فيها.
      الودجت لو رجعت تسأل كل زيارة تبقى بانر إعلاني، والناس بتتعلم
      تتجاهلها — وساعتها الفيدباك الحقيقي بيختفي معاها.

   ٢) **مش بتظهر إلا بعد ما المستخدم يستخدم الصفحة فعلاً** (٢٠ ثانية +
      أول تفاعل). سؤال «عجبتك الميزة؟» في أول ثانية سؤال غبي — هو
      لسه ماشافهاش.

   ٣) **الرفض بيتحفظ برضه.** لو ضغط ✕ من غير تقييم، مايتسألش تاني في
      نفس الصفحة الزيارة دي.

   التخزين: localStorage. ده استثناء مقصود من قاعدة «الداتا في الحساب»
   (شوف pages_phase) — ده مش داتا المستخدم، ده حالة واجهة، ومايستاهلش
   استعلام على كل تحميل صفحة.
   ========================================================================== */

/** مفتاح الصفحات المتقيّمة. */
const RATED_KEY = "feedback_rated_v1";
/** ثواني قبل ما الودجت تظهر. */
const APPEAR_AFTER_MS = 15_000;

export type FeedbackPage =
  | "landing"
  | "login"
  | "assessment"
  | "dashboard"
  | "lesson"
  | "workspace"
  | "courses"
  | "planner"
  | "calendar"
  | "achievements"
  | "career"
  | "slides"
  | "community"
  | "exam-plan"
  | "ai-chat"
  | "agents"
  | "shop"
  | "inventory";

interface FeedbackWidgetProps {
  /** معرّف الصفحة — لازم يكون من القايمة المقفولة في الراوت. */
  page: FeedbackPage;
  /** اسم الميزة بالعربي زي ما بيتعرض في السؤال والإيميل. */
  featureLabel: string;
  /**
   * لو false الودجت مابتظهرش خالص. بنستخدمها للصفحات اللي فيها مودال
   * مفتوح أو المستخدم مش مسجّل — الراوت بيرفض غير المسجّلين أصلاً.
   */
  enabled?: boolean;
}

type Phase = "hidden" | "asking" | "comment" | "thanks";

/** بيقرا قايمة الصفحات المتقيّمة من الستوريج. */
function readRated(): string[] {
  try {
    const raw = window.localStorage.getItem(RATED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function markRated(page: string) {
  try {
    const list = readRated();
    if (!list.includes(page)) {
      window.localStorage.setItem(RATED_KEY, JSON.stringify([...list, page]));
    }
  } catch {
    // الستوريج مقفول — الودجت هتسأل تاني الزيارة الجاية. مقبول.
  }
}

export function FeedbackWidget({ page, featureLabel, enabled = true }: FeedbackWidgetProps) {
  const [phase, setPhase] = useState<Phase>("hidden");
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  /* المشغّل العائم ساكن نفس الركن (`fixed bottom-4`) وبقى موجود في كل
     صفحة من ٨ أغسطس. لما يبقى فيه صوت شغّال بنطلع فوقه بدل ما يتغطّى
     أحدهما التاني — على الموبايل الاتنين بعرض الشاشة فالتصادم كامل. */
  const { activeTrack } = useAudio();

  /**
   * التقييم عايش في ref مش state.
   *
   * السبب: بيتقرا جوه handleSubmit بعد await. لو كان state، الـ closure
   * ممكن تشوف القيمة القديمة لو المستخدم غيّر رأيه بسرعة — ووقتها
   * الإيميل بيوصل بالتقييم الغلط من غير أي خطأ يظهر.
   */
  const ratingRef = useRef<"up" | "down" | null>(null);
  /** بيمنع إرسالين على نفس التقييم لو ضغط مرتين بسرعة. */
  const sendingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  /**
   * تايمر اختفاء رسالة الشكر.
   *
   * في ref عشان يتلغي وقت الـ unmount: الودجت بتقعد ٣.٢ ثانية بعد
   * الإرسال، والمستخدم بيقدر يغيّر الصفحة في نصهم — وساعتها الـ
   * setPhase بينده على مكوّن مترفّع. مافيش تحذير في React 18 بس
   * الـ closure بتفضل ماسكة الحالة في الذاكرة لحد ما التايمر يفوق.
   */
  const thanksTimerRef = useRef<number | undefined>(undefined);

  /* ---- تنضيف تايمر الشكر عند الترفّع ---- */
  useEffect(
    () => () => {
      if (thanksTimerRef.current) window.clearTimeout(thanksTimerRef.current);
    },
    []
  );

  /* ---- الظهور: بعد وقت + بعد أول تفاعل ---- */
  useEffect(() => {
    if (!enabled) return;
    if (readRated().includes(page)) return;

    let interacted = false;
    let timePassed = false;
    // eslint-disable-next-line prefer-const -- timer reassigned after declaration, const would break TDZ
    let timer: number | undefined;

    const maybeShow = () => {
      if (interacted && timePassed) {
        setPhase((p) => (p === "hidden" ? "asking" : p));
        cleanup();
      }
    };

    const onInteract = () => {
      interacted = true;
      maybeShow();
    };

    const cleanup = () => {
      window.removeEventListener("scroll", onInteract);
      window.removeEventListener("click", onInteract);
      window.removeEventListener("keydown", onInteract);
      if (timer) window.clearTimeout(timer);
    };

    timer = window.setTimeout(() => {
      timePassed = true;
      maybeShow();
    }, APPEAR_AFTER_MS);

    // passive: مش بنمنع السكرول، وde-facto أسرع
    window.addEventListener("scroll", onInteract, { passive: true });
    window.addEventListener("click", onInteract);
    window.addEventListener("keydown", onInteract);

    return cleanup;
  }, [enabled, page]);

  /* ---- فوكس على حقل التعليق أول ما يفتح ---- */
  useEffect(() => {
    if (phase === "comment") textareaRef.current?.focus();
  }, [phase]);

  if (phase === "hidden") return null;

  /** بيبعت التقييم. التعليق اختياري. */
  async function submit(rating: "up" | "down", commentText: string) {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setSendError(null);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page, featureLabel, rating, comment: commentText }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "مقدرناش نسجّل رأيك. حاول تاني.");
      }

      markRated(page);
      setPhase("thanks");
      // الشكر بيختفي لوحده — مش محتاج المستخدم يقفله
      thanksTimerRef.current = window.setTimeout(() => setPhase("hidden"), 3200);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "مقدرناش نسجّل رأيك.");
    } finally {
      // ⚠️ الفك في finally: لو الطلب رمى (نت قاطع) بدل ما يرجّع خطأ،
      // الزرار كان هيفضل مقفول للأبد والمستخدم مايقدرش يعيد المحاولة.
      sendingRef.current = false;
      setSending(false);
    }
  }

  function handleUp() {
    ratingRef.current = "up";
    // 👍 مالوش سؤال تاني — بيتبعت فوراً. أي خطوة زيادة هنا بتضيّع
    // الرأي الإيجابي، واللي عجبته الميزة مش هيقعد يكتب.
    void submit("up", "");
  }

  function handleDown() {
    ratingRef.current = "down";
    setPhase("comment");
  }

  function handleSendComment() {
    const rating = ratingRef.current ?? "down";
    void submit(rating, comment.trim());
  }

  /** تخطّي كتابة المشكلة — التقييم السلبي لوحده معلومة مفيدة. */
  function handleSkipComment() {
    const rating = ratingRef.current ?? "down";
    void submit(rating, "");
  }

  function handleDismiss() {
    // ماتتسجّلش كمتقيّمة في الستوريج — بس مابتظهرش تاني الزيارة دي.
    setPhase("hidden");
  }

  return (
    <div
      className={`fixed inset-x-4 sm:inset-x-auto sm:start-6 sm:w-[21rem] z-40 transition-[bottom] ${
        activeTrack ? "bottom-24" : "bottom-4"
      }`}
      role="complementary"
      aria-label="رأيك في الميزة"
    >
      <div className="sheet-card card-lift p-4 space-y-3">
        {/* ---- السؤال ---- */}
        {phase === "asking" && (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-ink leading-relaxed">
                <span className="text-base me-1" aria-hidden>
                  😊
                </span>
                {featureLabel} عجبتك؟
              </p>
              <button
                type="button"
                onClick={handleDismiss}
                aria-label="إخفاء سؤال الرأي"
                className="mono text-ink-soft hover:text-ink shrink-0 px-1"
              >
                ✕
              </button>
            </div>

            <div className="flex gap-2">
              {/* الاسم المتاح نص صريح — الإيموجي لوحده مش اسم مفهوم
                  لقارئ الشاشة، فهو aria-hidden والنص في .sr-only */}
              <button type="button" onClick={handleUp} disabled={sending} className="btn btn-quiet flex-1 text-sm py-2">
                <span aria-hidden>👍</span>
                <span className="sr-only">عجبتني</span>
              </button>
              <button type="button" onClick={handleDown} disabled={sending} className="btn btn-quiet flex-1 text-sm py-2">
                <span aria-hidden>👎</span>
                <span className="sr-only">مش عجبتني</span>
              </button>
            </div>

            {sendError && (
              <p className="text-[11px] text-red-500 leading-relaxed" role="alert">
                {sendError}
              </p>
            )}
          </>
        )}

        {/* ---- إيه المشكلة؟ ---- */}
        {phase === "comment" && (
          <>
            <div className="flex items-start justify-between gap-2">
              <label htmlFor="feedback-comment" className="text-xs font-bold text-ink leading-relaxed">
                إيه المشكلة؟
              </label>
              <button
                type="button"
                onClick={handleDismiss}
                aria-label="إخفاء سؤال الرأي"
                className="mono text-ink-soft hover:text-ink shrink-0 px-1"
              >
                ✕
              </button>
            </div>

            <textarea
              id="feedback-comment"
              ref={textareaRef}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => {
                // Ctrl+Enter بيبعت. Enter لوحده بيسطّر — ده حقل نص طويل
                // والمستخدم بيكتب فيه فقرة.
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleSendComment();
                }
              }}
              rows={3}
              maxLength={1000}
              placeholder="اكتب اللي مضايقك… أي تفصيلة بتفرق."
              className="field text-xs resize-none"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSendComment}
                disabled={sending}
                className="btn btn-marker flex-1 text-sm py-2"
              >
                {sending ? "بيتبعت…" : "ابعت"}
              </button>
              <button
                type="button"
                onClick={handleSkipComment}
                disabled={sending}
                className="btn btn-quiet text-sm py-2"
              >
                تخطّي
              </button>
            </div>

            {sendError && (
              <p className="text-[11px] text-red-500 leading-relaxed" role="alert">
                {sendError}
              </p>
            )}
          </>
        )}

        {/* ---- الشكر ---- */}
        {phase === "thanks" && (
          <p className="text-xs text-ink leading-relaxed" role="status">
            <span className="text-base me-1" aria-hidden>
              ✓
            </span>
            وصلت. شكراً — ده بيساعدنا نظبّط اللي ناقص.
          </p>
        )}
      </div>
    </div>
  );
}
