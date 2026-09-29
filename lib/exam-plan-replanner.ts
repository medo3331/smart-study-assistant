/* ============================================================================
   Phase 1 — Exam Plan Replanner (deterministic, pure)
   ---------------------------------------------------------------------------
   بيعيد ترتيب خطة الامتحان حسب نقاط الضعف من الـdiagnostic.

   المدخلات:  existingPlan + weakTopics + daysLeft + today
   المخرجات:  ReplanResult { changed, days, reasons }

   ---------------------------------------------------------------------------
   ⚠️ Phase 1 — PURE ONLY
   مفيش Supabase · مفيش API · مفيش UI · مفيش LLM · مفيش Date.now.
   `today` و `daysLeft` **مدخلات صريحة** — متقررش من التاريخ الحالي،
   عشان نفس المدخلات تدي نفس النتيجة دايمًا (وإلا الـtests هتبوظ
   نص الليل).

   ---------------------------------------------------------------------------
   القواعد الحاكمة
   ---------------------------------------------------------------------------
   1. مفيش weak topics ⇒ ما نلمسش الخطة خالص (`changed: false` + نفس
      الـarray reference).
   2. `is_done` يوم ما بيتحرّكش أبدًا — الطالب خلّصه.
   3. يوم `study_date < today` ما بيتحرّكش — فات.
   4. أولوية ضعيف < 0.4 على غيره.
   5. لو الوقت ضيق (daysLeft ≤ CRITICAL_DAYS) بنعمل **quarantine**
      (نطوي الأضعف لآخر الخطة) مش insert — بنزوّد الضغط في وقت
      student ما عندوش وقت أصلاً.
   6. كل تعديل بيرجع **سبب مقروء** في `reasons` — ده اللي الـUI هيورّيه
      للطالب في Phase 3 («عدّلنا خطتك لأن مستواك في Trees 40%»).
   ========================================================================== */

import { addDaysISO, diffDaysISO, type ExamPlanDay } from "./exam-plans";
import type { WeakTopic } from "./diagnostic-mastery";
import { UNTAGGED_TOPIC } from "./diagnostic-mastery";

/** أقل عدد أيام فاضلين — تحتها بنعمل quarantine مش insert. */
export const CRITICAL_DAYS_THRESHOLD = 3;

/** نوع التعديل. بيتحول لعرض في Phase 3. */
export type ReplanAction =
  | "reorder"      // رتّبنا الأيام — الأضعف فوق
  | "insert"       // زوّدنا يوم مراجعة/اختبار
  | "quarantine"   // طوّينا الأضعف لآخر الخطة (وقت ضيق)
  | "truncate";    // ما قدرناش نعمل كل حاجة — قللنا

/** سبب التعديل — نص جاهز للعرض. */
export interface ReplanReason {
  topic: string;
  accuracy: number;
  action: ReplanAction;
  message: string;
}

/** نتيجة الـreplan. */
export interface ReplanResult {
  changed: boolean;
  days: ExamPlanDay[];
  reasons: ReplanReason[];
  /** حقول التتبع — بتتّعبى في Phase 3. */
  inserted: number;
  quarantined: string[];
  dropped: string[];
}

/** الخطة اللي بتاخد input — الشكل اللي `lib/exam-plans` بيرجّعه. */
export interface ReplannablePlan {
  days: ExamPlanDay[];
}

/* ---------------------------------------------------------------------------
   أدوات داخلية
   ------------------------------------------------------------------------- */

/** إزاي هنطابق عنوان يوم مع موضوع ضعيف. */
function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * يطابق يوم بموضوع ضعيف.
 *
 * ⚠️ مطابقة نصية بسيطة (substring). **مش** semantic، ومش هتبقى كويسة
 * مع «المتوسط الحسابي» مقابل «average». لكن الـplan days جاية أصلاً من
 * نفس مصدر النصوص، فمطابقة normalized substring كافية تمامًا كـMVP،
 * وأي تحسين semantic مؤجل لـPhase 2+.
 */
function dayTopic(day: ExamPlanDay, weakTopics: readonly WeakTopic[]): WeakTopic | null {
  const title = normalize(day.title);
  const desc = normalize(day.description ?? "");
  for (const w of weakTopics) {
    const t = normalize(w.topic);
    if (t === UNTAGGED_TOPIC) continue; // مفيش معنى نطابقه بنص
    if (title.includes(t) || desc.includes(t) || t.includes(title)) {
      return w;
    }
  }
  return null;
}

/** أولوية السوء: أعلى = أضعف. */
function priorityRank(w: WeakTopic): number {
  if (w.priority === "high") return 0;
  if (w.priority === "medium") return 1;
  return 2;
}

/** يوم مش قابل للتحريك: خلص، أو فات. */
function isLocked(day: ExamPlanDay, today: string): boolean {
  return day.isDone || day.studyDate < today;
}


/* ---------------------------------------------------------------------------
   الـreplanner
   ------------------------------------------------------------------------- */

/**
 * يعيد ترتيب خطة الامتحان حسب نقاط الضعف.
 *
 * @param plan       الخطة الحالية (نقرأ منها `days` بس).
 * @param weakTopics المواضيع الضعيفة — الأضعف الأول (ترتيب مضمون من
 *                   `classifyTopics`).
 * @param daysLeft   كام يوم فاضل للامتحان.
 * @param today      "YYYY-MM-DD" — **مدخل صريح** (مش `new Date()`).
 */
export function replanExamPlan(
  plan: ReplannablePlan,
  weakTopics: readonly WeakTopic[],
  daysLeft: number,
  today: string
): ReplanResult {
  // القاعدة 1: مفيش ضعف ⇒ ما نلمسش حاجة.
  if (weakTopics.length === 0) {
    return {
      changed: false,
      days: plan.days,
      reasons: [],
      inserted: 0,
      quarantined: [],
      dropped: [],
    };
  }

  const reasons: ReplanReason[] = [];
  const locked = plan.days.filter((d) => isLocked(d, today));
  const movable = plan.days.filter((d) => !isLocked(d, today));

  // كل الأيام خلصت أو فاتت — ماينفعش نعدّل حاجة.
  if (movable.length === 0) {
    return {
      changed: false,
      days: plan.days,
      reasons: [],
      inserted: 0,
      quarantined: [],
      dropped: [],
    };
  }

  const weakDays: Array<{ day: ExamPlanDay; w: WeakTopic }> = [];
  const otherDays: ExamPlanDay[] = [];
  for (const d of movable) {
    const w = dayTopic(d, weakTopics);
    if (w) weakDays.push({ day: d, w });
    else otherDays.push(d);
  }
  weakDays.sort((a, b) => priorityRank(a.w) - priorityRank(b.w));

  // ── الحالة: وقت ضيق ──
  // quarantine مش insert. السبب: زوّدنا يومين والـslots = 1، ده بيخلي
  // الخطة مستحيلة التنفيذ ويدي إحساس إن عنده خطة وهو مش فايق منها.
  if (daysLeft <= CRITICAL_DAYS_THRESHOLD) {
    const quarantined: string[] = [];
    const kept: ExamPlanDay[] = [];

    for (const w of weakTopics) {
      const match = weakDays.find((x) => x.w.topic === w.topic);
      if (!match) continue;
      if (kept.length >= daysLeft) {
        quarantined.push(w.topic);
        reasons.push({
          topic: w.topic,
          accuracy: w.accuracy,
          action: "quarantine",
          message: `موعدك قريب (${daysLeft} يوم) — راجعنا «${w.topic}» لآخر الخطة بدل ما نضغط عليك أيام إضافية.`,
        });
        continue;
      }
      kept.push({ ...match.day });
    }

    for (const d of otherDays) {
      if (kept.length >= daysLeft) break;
      kept.push({ ...d });
    }

    if (quarantined.length === 0) {
      return {
        changed: false,
        days: plan.days,
        reasons: [],
        inserted: 0,
        quarantined: [],
        dropped: [],
      };
    }

    return {
      changed: true,
      days: renumber([...locked, ...kept], plan.days, today),
      reasons,
      inserted: 0,
      quarantined,
      dropped: [],
    };
  }


  // ── الحالة: عندنا وقت ──
  // نرتب الأيام المتحركة بحيث المواضيع الضعيفة تسبق القوية.
  const scored = movable.map((d) => {
    const w = dayTopic(d, weakTopics);
    return { day: d, rank: w ? priorityRank(w) : 99, accuracy: w ? w.accuracy : 1 };
  });

  const sortedIdx = scored.map((_, i) => i).sort((a, b) => {
    const A = scored[a];
    const B = scored[b];
    if (A.rank !== B.rank) return A.rank - B.rank;
    if (A.accuracy !== B.accuracy) return A.accuracy - B.accuracy;
    return a - b; // ترتيب ثابت
  });

  const reorderedMovable = sortedIdx.map((i) => scored[i].day);

  const didReorder = reorderedMovable.some((d, i) => d.id !== movable[i]?.id);

  // ندخل المواضيع الضعيفة اللي مالهاش يوم في الخطة أصلاً
  const inserted: ExamPlanDay[] = [];
  const covered = new Set(
    reorderedMovable
      .map((d) => dayTopic(d, weakTopics)?.topic)
      .filter((t): t is string => Boolean(t))
  );

  let cursor = daysLeft;
  for (const w of weakTopics) {
    if (covered.has(w.topic)) continue;
    if (cursor <= 0) break;
    const date = addDaysISO(today, cursor - 1);
    inserted.push({
      id: `synthetic-review-${w.topic}`,
      dayNumber: 0, // هيترقم بعدين
      studyDate: date,
      kind: "review",
      title: `مراجعة ${w.topic}`,
      description: `موضوع ضعيف — مستواك ${Math.round(w.accuracy * 100)}% في آخر اختبار. راجعه قبل الامتحان.`,
      isDone: false,
    });
    reasons.push({
      topic: w.topic,
      accuracy: w.accuracy,
      action: "insert",
      message: `زوّدنا يوم مراجعة لـ«${w.topic}» لأن مستواك فيه ${Math.round(w.accuracy * 100)}%.`,
    });
    covered.add(w.topic);
    cursor -= 1;
  }

  if (!didReorder && inserted.length === 0) {
    // مفيش reorder، مفيش insert ⇒ الخطة زي ما هي.
    return {
      changed: false,
      days: plan.days,
      reasons: [],
      inserted: 0,
      quarantined: [],
      dropped: [],
    };
  }

  if (didReorder) {
    const topWeak = reorderedMovable
      .map((d) => dayTopic(d, weakTopics))
      .find((w): w is WeakTopic => Boolean(w));
    if (topWeak) {
      reasons.push({
        topic: topWeak.topic,
        accuracy: topWeak.accuracy,
        action: "reorder",
        message: `رتّبنا خطتك: «${topWeak.topic}» بقى في الأول لأن مستواك فيه ${Math.round(topWeak.accuracy * 100)}%.`,
      });
    }
  }

  return {
    changed: true,
    days: renumber([...locked, ...reorderedMovable, ...inserted], plan.days, today),
    reasons,
    inserted: inserted.length,
    quarantined: [],
    dropped: [],
  };
}


/**
 * يعيد ترقيم الأيام **بالتاريخ مع الرقم**.
 *
 * المشكلة اللي بنحلّها هنا (Phase 2): لو غيّرنا `day_number` بس
 * وتركنا `studyDate`، النتيجة ترتيب غير منطقي:
 *
 *   n=3 | 2026-09-30 | HashTables
 *   n=4 | 2026-09-29 | Trees        ← اليوم 4 بتاريخ قبل اليوم 3
 *
 * و`todaysDay()` في lib/exam-plans.ts بيلاقي بـ`studyDate === today`،
 * فالواجهة هتعرض «النهارده» على day 5، والبرنامج كله بيبقى غلط.
 *
 * الحل: **التاريخ والرقم يتحرّكا مع بعض.** الأيام المقفولة (اللي خلصت
 * أو فاتت) بتقعد مكانها بالظبط — تاريخها ورقمها. الأيام الحرة بتاخد
 * تواريخ متتالية ابتداءً من أول يوم متاح بعد آخر يوم مقفول.
 *
 * `unique (plan_id, day_number)` في الـSQL — الأرقام المحجوزة بتتخطّى
 * ومفيش رقم بيتكرر.
 */
function renumber(
  ordered: ExamPlanDay[],
  original: ExamPlanDay[],
  today: string
): ExamPlanDay[] {
  const locked = original.filter((d) => isLocked(d, today));

  // الأرقام المحجوزة (لليوم المقفول رقمه ثابت).
  const reserved = new Set(locked.map((d) => d.dayNumber));

  // أول تاريخ متاح بعد آخر يوم مقفول. بنحسبه من **التواريخ** مش من
  // الأرقام، عشان لو حد عدّل الخطة يدويًا الأرقام ممكن تتأخر والتاريخ
  // هو اللي بيحدد «إمتى».
  const lastLockedDate = locked.reduce(
    (max, d) => (d.studyDate > max ? d.studyDate : max),
    ""
  );
  let nextDate = lastLockedDate ? addDaysISO(lastLockedDate, 1) : today;
  if (nextDate < today) nextDate = today;

  let nextNumber = 1;
  const takeNextNumber = (): number => {
    while (reserved.has(nextNumber)) nextNumber += 1;
    const chosen = nextNumber;
    reserved.add(chosen); // ما ترجعش لنفسها
    nextNumber += 1;
    return chosen;
  };

  const datesTaken = new Set(locked.map((d) => d.studyDate));
  const takeNextDate = (): string => {
    // نتفادى تكرار التاريخ (لو في يومين بنفس التاريخ أصلاً).
    while (datesTaken.has(nextDate)) nextDate = addDaysISO(nextDate, 1);
    const chosen = nextDate;
    datesTaken.add(chosen);
    nextDate = addDaysISO(chosen, 1);
    return chosen;
  };

  return ordered.map((d) => {
    if (isLocked(d, today)) {
      // يوم مقفول: رقمه وتاريخه الأصليين بالظبط.
      return { ...d, dayNumber: d.dayNumber, studyDate: d.studyDate };
    }
    // يوم حر: رقم جديد + تاريخ جديد — **بتحرّك مع بعض**.
    return { ...d, dayNumber: takeNextNumber(), studyDate: takeNextDate() };
  });
}
