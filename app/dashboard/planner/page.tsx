"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Syncing with external system (Supabase/localStorage) is intentional; see TODO for future useEffectEvent refactor */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell, EmptyState, LoadingSheets, DataNotice, usePenTheme } from "../components/PageShell";
import { useAuthUser, localDateKey } from "../components/use-page-data";
import { THEME_STYLES } from "../components/theme-helpers";
import {
  fetchGoals,
  insertGoal,
  setGoalDone,
  deleteGoal,
  type PlannerGoal,
} from "@/lib/pages-data";
import { awardCoins } from "@/lib/shop/shop-data";

/* ==========================================================================
   المخطط — أهدافك

   الداشبورد بتقول لك «ذاكر إيه النهاردة». الصفحة دي بتقول لك «إيه اللي
   ناوي تخلّصه». الفرق مقصود: الخطة بتتولّد، والأهداف دي بتكتبها بنفسك —
   تسليم مشروع، مراجعة قبل امتحان، حاجة مالهاش علاقة بتراك أصلاً.

   الترتيب بالوقت مش بالإضافة: اللي فات فوق بالأحمر، بعده النهاردة، وهكذا.
   السبب إن السؤال اللي بتفتح الصفحة عشانه هو «فيه حاجة متأخرة؟» مش
   «إيه آخر حاجة كتبتها».

   ⚠️ محتاج جدول planner_goals — db/pages.sql.
   ========================================================================== */

/** مجموعات العرض. الترتيب هنا هو ترتيب الظهور. */
type Bucket = "overdue" | "today" | "week" | "later" | "someday";

const BUCKET_META: Record<Bucket, { label: string; hint: string }> = {
  overdue: { label: "فات موعدها", hint: "المفروض خلصت قبل كده" },
  today: { label: "النهاردة", hint: "" },
  // مش أسبوع تقويمي — الأيام السبعة الجّاية. الاسم بيقول كده عن قصد عشان
  // «الأسبوع ده» يوم الجمعة كانت هتبقى كذب.
  week: { label: "خلال أسبوع", hint: "" },
  later: { label: "بعدين", hint: "" },
  someday: { label: "في أي وقت", hint: "من غير تاريخ" },
};

const BUCKET_ORDER: Bucket[] = ["overdue", "today", "week", "later", "someday"];

/** الهدف بيقع في أنهي مجموعة. المقارنة بالنص "YYYY-MM-DD" مش بـ Date:
    التواريخ دي أيام مالهاش ساعة، فأي تحويل لـ Date بيدخّل التوقيت المحلي
    في الحسبة ويخلّي هدف النهاردة يبان إمبارح. */
function bucketOf(goal: PlannerGoal, todayKey: string, weekEndKey: string): Bucket {
  if (!goal.dueDate) return "someday";
  if (goal.dueDate < todayKey) return "overdue";
  if (goal.dueDate === todayKey) return "today";
  if (goal.dueDate <= weekEndKey) return "week";
  return "later";
}

/** "٣ أغسطس" — من غير سنة، الصفحة كلها عن القريب. السنة بتظهر بس لو
    التاريخ في سنة تانية، عشان "٣ أغسطس" ما تتلخبطش مع اللي بعد سنة. */
function formatDue(dateKey: string, todayKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const sameYear = dateKey.slice(0, 4) === todayKey.slice(0, 4);
  return date.toLocaleDateString("ar-EG", {
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** فرق الأيام بين مفتاحين — للتعبير عن «فاتت بكام يوم». */
function daysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  const from = new Date(fy, fm - 1, fd);
  const to = new Date(ty, tm - 1, td);
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

/** أرقام هندية — زي اللي `toLocaleDateString("ar-EG")` بتطلّعها فوق. من غير
    كده بيبقى في نفس السطر «٣ أغسطس» جنب «فاتت بـ 3 أيام». */
function toArabicNum(n: number): string {
  return n.toLocaleString("ar-EG");
}

/** "فاتت بـ ٣ أيام" — العربي بيفرّق بين المفرد والمثنى والجمع. */
function overdueLabel(days: number): string {
  if (days === 1) return "فاتت بيوم";
  if (days === 2) return "فاتت بيومين";
  if (days <= 10) return `فاتت بـ ${toArabicNum(days)} أيام`;
  return `فاتت بـ ${toArabicNum(days)} يوم`;
}

/** صف هدف واحد. نفس الشكل في المفتوح والخالص — الخالص بيتشال لونه بس.

    ⚠️ متحطّهاش جوه PlannerPage. لو اتعرّفت جوه الكومبوننت، React بيشوفها
    نوع جديد مع كل رندر فبيهدّ كل الصفوف ويبنيها من الأول — يعني كل حرف
    بتكتبه في فورم الإضافة بيعيد بناء القايمة كلها. */
function GoalRow({
  goal,
  todayKey,
  accentBg,
  accentText,
  isPending,
  onToggle,
  onDelete,
}: {
  goal: PlannerGoal;
  todayKey: string;
  accentBg: string;
  accentText: string;
  /** فيه طلب طاير للهدف ده — الزرارين مقفولين لحد ما يرجع */
  isPending: boolean;
  onToggle: (goal: PlannerGoal) => void;
  onDelete: (goal: PlannerGoal) => void;
}) {
  const isOverdue = !goal.isDone && goal.dueDate !== null && goal.dueDate < todayKey;

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-rule last:border-b-0">
      {/* الاسم ثابت و aria-pressed هو اللي بيشيل الحالة — لو الاتنين
          بيتغيّروا، قارئ الشاشة بينطق الحالة مرتين. */}
      <button
        onClick={() => onToggle(goal)}
        disabled={isPending}
        aria-pressed={goal.isDone}
        aria-label={`خلصت: ${goal.title}`}
        className={`mt-0.5 w-[18px] h-[18px] shrink-0 rounded-[5px] border transition flex items-center justify-center disabled:opacity-50 ${
          goal.isDone ? `${accentBg} border-transparent text-paper` : "border-rule-strong hover:border-ink-soft"
        }`}
      >
        {goal.isDone && (
          <span className="text-[11px] leading-none" aria-hidden>
            ✓
          </span>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={`text-xs leading-relaxed break-words ${
            goal.isDone ? "text-ink-soft line-through" : "text-ink"
          }`}
        >
          {/* aria-label على span بيتجاهله المتصفح (role=generic)، فالنجمة
              مخفية عن قارئ الشاشة والمعنى جاي من sr-only. */}
          {goal.priority === 2 && !goal.isDone && (
            <>
              <span className={`${accentText} font-bold`} aria-hidden>
                ★{" "}
              </span>
              <span className="sr-only">مهم: </span>
            </>
          )}
          {goal.title}
        </p>

        {goal.dueDate && (
          <p className={`tag mt-1 ${isOverdue ? "text-redpen" : ""}`}>
            <span>{formatDue(goal.dueDate, todayKey)}</span>
            {isOverdue && <span>{overdueLabel(daysBetween(goal.dueDate, todayKey))}</span>}
          </p>
        )}
      </div>

      {/* اسم الهدف جوه الـ label: من غيره كل أزرار الشيل في الصفحة اسمها
          «شيله» وقارئ الشاشة مش عارف بيشيل أنهي واحد. */}
      <button
        onClick={() => onDelete(goal)}
        disabled={isPending}
        aria-label={`شيل: ${goal.title}`}
        className="mono text-ink-soft hover:text-redpen px-2 py-1 rounded-[6px] transition disabled:opacity-50 shrink-0"
      >
        <span aria-hidden>{isPending ? "…" : "شيله"}</span>
      </button>
    </div>
  );
}

export default function PlannerPage() {
  const router = useRouter();
  const { supabase, session } = useAuthUser();
  const themeStyles = THEME_STYLES[usePenTheme()];

  const [goals, setGoals] = useState<PlannerGoal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  // فورم الإضافة
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [isImportant, setIsImportant] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  /* ---- الأهداف اللي ليها طلب طاير دلوقتي ----
     قفل لكل هدف على حدة، مش خانة واحدة للصفحة. السبب: من غيره ضغطتين
     سريعتين على نفس الشيك بوكس بيبعتوا طلبين، ومافيش ضمان إنهم يوصلوا
     السيرفر بالترتيب — فممكن الشاشة تقول «خالص» والداتابيز تقول لأ،
     من غير أي خطأ يظهر. والـ Set بتخلّي هدفين مختلفين يشتغلوا مع بعض عادي.

     الـ ref هو مصدر الحقيقة وقت الضغطة (الحالة ممكن تكون لسه ما اترسمتش)،
     والـ state عشان الزرار يترسم مقفول. */
  const pendingRef = useRef<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const markPending = (id: string, on: boolean) => {
    if (on) pendingRef.current.add(id);
    else pendingRef.current.delete(id);
    setPendingIds(new Set(pendingRef.current));
  };

  // نوري الخالص ولا نخبّيه
  const [showDone, setShowDone] = useState(false);

  /* ---- مفاتيح النهاردة وآخر الأسبوع ----
     بتتحسب مرة واحدة في التحميل. لو الصفحة فضلت مفتوحة عبر منتصف الليل
     التجميع بيبقى قديم بيوم — مقبول، والريفريش بيصلّحه. */
  const { todayKey, weekEndKey } = useMemo(() => {
    const now = new Date();
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return { todayKey: localDateKey(now), weekEndKey: localDateKey(weekEnd) };
  }, []);

  /* ---- تحميل الأهداف ---- */
  useEffect(() => {
    if (session.status === "loading") return;

    if (session.status === "anonymous") {
      router.push("/dashboard");
      return;
    }
    if (session.status === "error") {
      setNotice(session.message);
                  setIsLoading(false);
      return;
    }

    (async () => {
      const { data, error } = await fetchGoals(supabase, session.user.id);
      if (error) setNotice(error.message);
      else setGoals(data);
      setIsLoading(false);
    })();
  }, [session, supabase, router]);

  /* ---- إضافة هدف ---- */
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (session.status !== "ready") return;

    const trimmed = title.trim();
    if (!trimmed || isSaving) return;

    setIsSaving(true);
    setNotice(null);

    // نفس سبب الـ finally في المعالجات تحت: لو الطلب رمى، الزرار كان
    // هيقعد مقفول على «بيضيف…» والمستخدم يفقد اللي كتبه.
    try {
      const { data, error } = await insertGoal(supabase, session.user.id, {
        title: trimmed,
        dueDate: dueDate || null,
        priority: isImportant ? 2 : 1,
      });

      if (error) {
        setNotice(error.message);
        return;
      }

      // الجديد فوق. الترتيب الحقيقي بيتحدّد في التجميع تحت، فده بيهم بس
      // لو الاتنين في نفس المجموعة وبنفس التاريخ.
      // الفورم بيتفضّى بعد النجاح بس — لو فشل، اللي كتبته لسه مكانه.
      setGoals((prev) => [data, ...prev]);
      setTitle("");
      setDueDate("");
      setIsImportant(false);
    } catch (err) {
      console.error("insertGoal threw:", err);
      setNotice("ما قدرناش نضيف الهدف. اتأكد من النت وحاول تاني.");
    } finally {
      setIsSaving(false);
    }
  };

  /* ---- علّم خلص / رجّعه ----
     بنقلب الحالة في الشاشة الأول وبنرجّعها لو الشبكة رفضت. الضغطة دي
     بتتعمل كتير ومحدش عايز يستنى رحلة سيرفر عشان يشوف علامة صح. */
  const handleToggle = async (goal: PlannerGoal) => {
    if (pendingRef.current.has(goal.id)) return;

    const before = goal.isDone;
    const next = !before;

    /** رجّع الشاشة لحالتها قبل الضغطة. القفل بيضمن إن مافيش طلب تاني لنفس
        الهدف عدّل الحالة في الوقت ده، فالرجوع لـ before أكيد صح. */
    const rollback = () =>
      setGoals((prev) => prev.map((g) => (g.id === goal.id ? { ...g, isDone: before } : g)));

    markPending(goal.id, true);
    setGoals((prev) => prev.map((g) => (g.id === goal.id ? { ...g, isDone: next } : g)));

    // ⚠️ finally مش زيادة: لو الطلب رمى (الشبكة قاطعة) بدل ما يرجّع error،
    // من غيرها القفل بيفضل شغال والزرار يقعد مقفول للأبد.
    try {
      const { error } = await setGoalDone(supabase, goal.id, next);

      if (error) {
        rollback();
        setNotice(error.message);
        return;
      }
      setNotice(null);

      /* 🪙 كوينز المتجر — بعد ما الحفظ ينجح، وعند التعليم بس مش عند الشيل.
         في try مستقل عن اللي فوق: لو جداول المتجر لسه ما اتعملتش
         (db/shop.sql) الهدف يفضل محفوظ وما نرجّعش الشيك بوكس.

         ⚠️ المبلغ والسقف اليومي من `award_coins` على السيرفر — الكلاينت
         مابيبعتش رقم. وفي حالة الشيل والتعليم تاني، السقف هو اللي بيمنع
         التكرار مش إحنا. */
      if (next) {
        try {
          await awardCoins(supabase, "goal_done", goal.id);
        } catch (coinErr) {
          console.error("award goal_done failed (متجاهَل):", coinErr);
        }
      }
    } catch (err) {
      console.error("setGoalDone threw:", err);
      rollback();
      setNotice("ما قدرناش نحفظ التغيير. اتأكد من النت وحاول تاني.");
    } finally {
      markPending(goal.id, false);
    }
  };

  /* ---- شيل هدف ----
     بنسأل الأول زي صفحة الكورسات. مفيش تراجع، والزرار على بعد ضغطة من
     الشيك بوكس. */
  const handleDelete = async (goal: PlannerGoal) => {
    if (pendingRef.current.has(goal.id)) return;
    if (!confirm(`متأكد إنك عايز تشيل «${goal.title}»؟ الخطوة دي لا يمكن التراجع عنها.`)) return;

    markPending(goal.id, true);

    // نفس سبب الـ finally فوق: القفل لازم يتفك في كل الحالات.
    try {
      const { error } = await deleteGoal(supabase, goal.id);

      if (error) {
        setNotice(error.message);
        return;
      }
      setGoals((prev) => prev.filter((g) => g.id !== goal.id));
      setNotice(null);
    } catch (err) {
      console.error("deleteGoal threw:", err);
      setNotice("ما قدرناش نشيل الهدف. اتأكد من النت وحاول تاني.");
    } finally {
      markPending(goal.id, false);
    }
  };

  /* ---- التجميع ----
     جوه المجموعة: المهم فوق، وبعدين الأقرب موعداً. اللي من غير تاريخ
     بيتساوى مع بعضه فبيفضل ترتيب الإضافة (sort في JS مستقرة).

     الفرز جوه الـ memo مش بره: لو كان بره، `openGoals` بتبقى مرجع جديد كل
     رندر والـ memo ما بتحفظ حاجة أصلاً. */
  const { grouped, openCount, doneGoals } = useMemo(() => {
    const map = new Map<Bucket, PlannerGoal[]>();
    const done: PlannerGoal[] = [];
    let open = 0;

    for (const goal of goals) {
      if (goal.isDone) {
        done.push(goal);
        continue;
      }
      open++;
      const bucket = bucketOf(goal, todayKey, weekEndKey);
      const list = map.get(bucket);
      if (list) list.push(goal);
      else map.set(bucket, [goal]);
    }

    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        if (a.dueDate && b.dueDate) return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
        return 0;
      });
    }

    return { grouped: map, openCount: open, doneGoals: done };
  }, [goals, todayKey, weekEndKey]);

  const overdueCount = grouped.get("overdue")?.length ?? 0;
  const todayCount = grouped.get("today")?.length ?? 0;

  /** الخصائص المتكررة في كل صف — الثيم والنهاردة والمعالجات. */
  const rowProps = {
    todayKey,
    accentBg: themeStyles.accentBg,
    accentText: themeStyles.accentText,
    onToggle: handleToggle,
    onDelete: handleDelete,
  };

  /* ---------------------------------------------------------------------- */

  return (
    <PageShell
      eyebrow="المخطط"
      title="أهدافك"
      lede="الخطة بتتولّد لك، بس الحاجات دي بتكتبها بنفسك — تسليم، مراجعة قبل امتحان، أو أي حاجة ناوي تخلّصها. مرتّبة بالوقت عشان تشوف المتأخر أول ما تفتح."
      feedbackPage="planner"
      feedbackLabel="المخطط"
    >
      {notice && <DataNotice message={notice} />}

      {/* ---- فورم الإضافة: مفتوح على طول، مش وراء زرار ----
          إضافة هدف هي الحاجة الأساسية في الصفحة، وخبّيها وراء ضغطة
          معناها ضغطة زيادة كل مرة. */}
      <form onSubmit={handleAdd} className="sheet-card p-5 space-y-3">
        <div>
          <label htmlFor="goal-title" className="field-label">
            هدف جديد
          </label>
          <input
            id="goal-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثلاً: أخلّص مشروع الـ API"
            maxLength={200}
            className="field"
          />
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <div className="min-w-[10rem]">
            <label htmlFor="goal-due" className="field-label">
              الموعد <span className="text-ink-soft font-normal">(اختياري)</span>
            </label>
            {/* الحدود مش تجميل: المقارنة في bucketOf نصية، فسنة بخمس خانات
                كانت هتترتّب غلط. التاريخ القديم مسموح — تسجّل حاجة فاتت. */}
            <input
              id="goal-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              min="2000-01-01"
              max="2099-12-31"
              className="field ltr-num"
            />
          </div>

          {/* الشكل المضغوط بيجي من .chip[aria-pressed="true"] في globals.css */}
          <button
            type="button"
            onClick={() => setIsImportant((v) => !v)}
            aria-pressed={isImportant}
            className="chip"
          >
            ★ مهم
          </button>

          <button
            type="submit"
            disabled={!title.trim() || isSaving}
            className="btn btn-marker text-sm ms-auto disabled:opacity-50"
          >
            {isSaving ? "بيضيف…" : "ضيفه"}
          </button>
        </div>
      </form>

      {isLoading ? (
        <LoadingSheets count={2} />
      ) : goals.length === 0 ? (
        <EmptyState
          icon="🎯"
          title="مافيش أهداف لسه"
          body="اكتب أول هدف فوق. أي حاجة ناوي تخلّصها — بتاريخ أو من غير."
        />
      ) : (
        <div className="space-y-4">
          {/* ---- سطر الحصيلة: الرقم اللي بيهم قبل التفاصيل ---- */}
          {openCount > 0 && (
            <p className="tag">
              <span className="ltr-num">{openCount}</span>
              <span>لسه مفتوحة</span>
              {overdueCount > 0 && (
                <span className="text-redpen">
                  <span className="ltr-num">{overdueCount}</span> فات موعدها
                </span>
              )}
              {todayCount > 0 && (
                <span>
                  <span className="ltr-num">{todayCount}</span> النهاردة
                </span>
              )}
            </p>
          )}

          {/* ---- المجموعات ---- */}
          {BUCKET_ORDER.map((bucket) => {
            const list = grouped.get(bucket);
            if (!list || list.length === 0) return null;

            const meta = BUCKET_META[bucket];
            const isOverdue = bucket === "overdue";

            return (
              <div
                key={bucket}
                className={`sheet-card p-5 space-y-1 ${isOverdue ? "sheet-card-live" : ""}`}
              >
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <p className={`eyebrow eyebrow-flush ${isOverdue ? "text-redpen" : ""}`}>
                    {meta.label}
                  </p>
                  <span className="mono text-ink-soft ltr-num">{list.length}</span>
                </div>
                {meta.hint && <p className="text-[11px] text-ink-soft mb-1">{meta.hint}</p>}

                <div>
                  {list.map((goal) => (
                    <GoalRow key={goal.id} goal={goal} isPending={pendingIds.has(goal.id)} {...rowProps} />
                  ))}
                </div>
              </div>
            );
          })}

          {/* ---- الخالص: مطوي، بيفتح بضغطة ----
              مش بيتشال خالص عشان شطب حاجة بيدي إحساس بالتقدّم، بس مش
              مستاهل ياخد مساحة فوق اللي لسه مفتوح. */}
          {doneGoals.length > 0 && (
            <div className="sheet-card p-5 space-y-1">
              <button
                onClick={() => setShowDone((v) => !v)}
                aria-expanded={showDone}
                className="flex items-baseline justify-between gap-3 w-full"
              >
                <span className="eyebrow eyebrow-flush">خلصت</span>
                <span className="mono text-ink-soft">
                  <span className="ltr-num">{doneGoals.length}</span>{" "}
                  {/* aria-expanded بيوصّل الحالة خلاص، فالمثلث زخرفة */}
                  <span aria-hidden>{showDone ? "▲" : "▼"}</span>
                </span>
              </button>

              {showDone && (
                <div className="pt-1">
                  {doneGoals.map((goal) => (
                    <GoalRow key={goal.id} goal={goal} isPending={pendingIds.has(goal.id)} {...rowProps} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}