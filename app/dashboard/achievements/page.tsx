"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Syncing with external system (Supabase/localStorage) is intentional; see TODO for future useEffectEvent refactor */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell, EmptyState, LoadingSheets, DataNotice, usePenTheme } from "../components/PageShell";
import { useAuthUser, formatArabicDate } from "../components/use-page-data";
import { THEME_STYLES } from "../components/theme-helpers";
import {
  fetchBadges,
  fetchProfileStats,
  fetchCourses,
  type Badge,
  type ProfileStats,
  type CourseSummary,
} from "@/lib/pages-data";

/* ==========================================================================
   الإنجازات — اللي جمعته لحد دلوقتي

   تلات حاجات في صفحة واحدة:
     المستوى   → من XP (كل ٢٠٠ نقطة مستوى)، نفس حساب الداشبورد بالظبط
     الأوسمة   → من جدول badges، BossFight هو اللي بيكتب فيه
     المراحل   → محفوظة في `user_achievements` بعد Phase 3

   ⚠️ Phase 3: المراحل بقت **محفوظة ومكافأة**. الصفحة بتنادي RPC
   `sync_achievements` مرة عند الفتح: السيرفر بيتحقق من الشروط (مراحل مكتملة،
   سلسلة، مستوى، أوسمة، تراك كامل)، بيسجّل الجديد في `user_achievements`
   مرة واحدة، وبيمنح كوينز/XP.

   الترتيب مهم: عرض المرحلة مش هو اللي بيمنحها — الحساب على السيرفر. الواجهة
   بس بتعرض اللي رجع، ولو الـ RPC مش متطبّق (الميجريشن لسه) بترجع للحساب
   المحلي القديم عشان الصفحة ماتبقاش فاضية.
   ========================================================================== */

import { levelFromXp, XP_PER_LEVEL } from "@/lib/shop/economy";

/* --------------------------------------------------------------------------
   المراحل

   ليه متحسوبة مش متخزّنة؟ لأن كل واحدة سؤال عن أرقام موجودة أصلاً
   (XP، ستريك، كورسات خلصت). لو عاشت في جدول كان لازم نكتب صف وقت ما
   تتحقق — يعني كود في كل مكان بيزوّد XP، وأي مرحلة جديدة محتاجة
   backfill لكل المستخدمين. الحساب هنا بيخلّي المرحلة الجديدة تظهر
   للناس اللي مستحقينها من قبل ما نكتبها.
   -------------------------------------------------------------------------- */

interface Milestone {
  id: string;
  icon: string;
  title: string;
  /** إيه اللي بيفتحها — بيظهر للمقفولة */
  requirement: string;
  isUnlocked: boolean;
  /** التقدّم الحالي ناحية الهدف، للمقفولة بس */
  progress?: { current: number; target: number };
  /** مكافأة الإنجاز (من كتالوج السيرفر) — undefined لو الحساب محلي */
  coins?: number;
  xp?: number;
}

/** صف RPC `sync_achievements` — أسماء الأعمدة زي ما راجعة من الداتابيز. */
type ServerAchievement = {
  achievement_id: string;
  icon: string;
  title: string;
  requirement: string;
  target: number | string;
  progress: number | string;
  coins: number | string;
  xp: number | string;
  unlocked: boolean;
  unlocked_at: string | null;
  newly: boolean;
  sort_order: number | string;
};

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** تحويل صفوف السيرفر لنفس شكل المرحلة اللي الواجهة بترسمه. */
function milestonesFromServer(rows: ServerAchievement[]): Milestone[] {
  return rows.map((row) => {
    const target = toNumber(row.target);
    const progress = toNumber(row.progress);
    return {
      id: row.achievement_id,
      icon: row.icon,
      title: row.title,
      requirement: row.requirement,
      isUnlocked: row.unlocked === true || progress >= target,
      progress: { current: progress, target },
      coins: toNumber(row.coins),
      xp: toNumber(row.xp),
    };
  });
}

function buildMilestones(stats: ProfileStats, courses: CourseSummary[], badgeCount: number): Milestone[] {
  const completedDays = courses.reduce((sum, c) => sum + c.completedDays, 0);
  const finishedCourses = courses.filter((c) => c.totalDays > 0 && c.completedDays >= c.totalDays).length;

  const define = (
    id: string,
    icon: string,
    title: string,
    requirement: string,
    current: number,
    target: number
  ): Milestone => ({
    id,
    icon,
    title,
    requirement,
    isUnlocked: current >= target,
    progress: current >= target ? undefined : { current, target },
  });

  return [
    define("first-step", "🌱", "أول خطوة", "خلّص أول مرحلة", completedDays, 1),
    define("ten-steps", "📗", "عشرة ورا بعض", "خلّص ١٠ مراحل", completedDays, 10),
    define("fifty-steps", "📚", "نص كتاب", "خلّص ٥٠ مرحلة", completedDays, 50),
    define("week-streak", "🔥", "أسبوع كامل", "ذاكر ٧ أيام ورا بعض", stats.streak, 7),
    define("month-streak", "⚡", "شهر ما فاتكش", "ذاكر ٣٠ يوم ورا بعض", stats.streak, 30),
    define("level-five", "⭐", "المستوى الخامس", "اوصل للمستوى ٥", levelFromXp(stats.xp), 5),
    define("first-boss", "🐉", "أول بوس", "اكسب أول وسام", badgeCount, 1),
    define("first-course", "🎓", "تراك كامل", "خلّص تراك من أوله لآخره", finishedCourses, 1),
  ];
}

/** أرقام هندية — عشان ما تتلخبطش مع العربي حواليها. */
function arNum(n: number): string {
  return n.toLocaleString("ar-EG");
}

/* --------------------------------------------------------------------------
   كروت العرض
   -------------------------------------------------------------------------- */

function StatCard({
  label,
  value,
  hint,
  accentText,
}: {
  label: string;
  value: string;
  hint?: string;
  accentText: string;
}) {
  return (
    <div className="sheet-card p-5">
      <p className="eyebrow eyebrow-flush mb-2">{label}</p>
      <p className={`font-display font-extrabold text-2xl leading-none ${accentText}`}>{value}</p>
      {hint && <p className="text-[11px] text-ink-soft mt-1.5 leading-relaxed">{hint}</p>}
    </div>
  );
}

function MilestoneRow({ milestone, accentBg }: { milestone: Milestone; accentBg: string }) {
  const { icon, title, requirement, isUnlocked, progress, coins, xp } = milestone;
  const percent = progress ? Math.min(100, Math.round((progress.current / progress.target) * 100)) : 100;
  const hasReward = (coins ?? 0) > 0 || (xp ?? 0) > 0;

  return (
    <div className="flex items-start gap-3 py-3 border-b border-rule last:border-b-0">
      {/* المقفول رمادي وباهت — الفرق بيتشاف من بعيد من غير قراية */}
      <span className={`text-xl leading-none shrink-0 ${isUnlocked ? "" : "opacity-30 grayscale"}`} aria-hidden>
        {icon}
      </span>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <p className={`text-xs font-bold ${isUnlocked ? "text-ink" : "text-ink-soft"}`}>
            {title}
            {isUnlocked && <span className="sr-only"> — اتفتحت</span>}
          </p>
          {isUnlocked ? (
            <span className="tag-box shrink-0" aria-hidden>
              ✓
            </span>
          ) : (
            progress && (
              <span className="mono text-ink-soft ltr-num shrink-0">
                {arNum(progress.current)}/{arNum(progress.target)}
              </span>
            )
          )}
        </div>

        {!isUnlocked && (
          <>
            <p className="text-[11px] text-ink-soft leading-relaxed">{requirement}</p>
            <div className="meter meter-sm">
              <div className={`meter-fill ${accentBg}`} style={{ width: `${percent}%` }} />
            </div>
          </>
        )}

        {/* المكافأة ظاهرة قبل الفتح — ده اللي بيخلّي الإنجاز حاجة تتستحق */}
        {hasReward && (
          <p className="text-[11px] text-ink-soft flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={isUnlocked ? "text-ink" : ""}>
              {isUnlocked ? "مكافأتها اتحفظت:" : "مكافأتها:"}
            </span>
            {(coins ?? 0) > 0 && (
              <span className="mono ltr-num" aria-label={`${coins} كوينز`}>
                +{arNum(coins ?? 0)} 🪙
              </span>
            )}
            {(xp ?? 0) > 0 && (
              <span className="mono ltr-num" aria-label={`${xp} نقطة خبرة`}>
                +{arNum(xp ?? 0)} XP
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export default function AchievementsPage() {
  const router = useRouter();
  const { supabase, session } = useAuthUser();
  const themeStyles = THEME_STYLES[usePenTheme()];

  const [stats, setStats] = useState<ProfileStats>({ xp: 0, streak: 1 });
  const [badges, setBadges] = useState<Badge[]>([]);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [serverAchievements, setServerAchievements] = useState<ServerAchievement[] | null>(null);
  const [freshlyUnlocked, setFreshlyUnlocked] = useState<ServerAchievement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  /* ---- تحميل التلاتة مع بعض ----
     الأوسمة والكورسات والبروفايل مالهمش علاقة ببعض، فمفيش داعي نستنى
     واحد عشان نبدأ التاني. أول خطأ بس هو اللي يظهر — تلات بانرات فوق بعض
     مش هتساعد حد. */
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
      const userId = session.user.id;
      const [statsRes, badgesRes, coursesRes] = await Promise.all([
        fetchProfileStats(supabase, userId),
        fetchBadges(supabase, userId),
        fetchCourses(supabase, userId),
      ]);

      if (statsRes.data) setStats(statsRes.data);
      if (badgesRes.data) setBadges(badgesRes.data);
      if (coursesRes.data) setCourses(coursesRes.data);

      /* ---- Phase 3: تسجيل الإنجازات على السيرفر ----
         النداء ده هو اللي بيفتح الإنجاز ويمنح مكافأته. لو الميجريشن
         (`db/45-...`) لسه ما اتشغلش، الخطأ بيتجاهَل بهدوء والصفحة بترجع
         للحساب المحلي — مفيش رسالة خطأ في وش الطالب عشان حاجة جانبية. */
      const { data: achData, error: achError } = await supabase.rpc("sync_achievements");
      if (!achError && achData) {
        const rows = (Array.isArray(achData) ? achData : [achData]) as ServerAchievement[];
        setServerAchievements(rows);
        const fresh = rows.filter((row) => row.newly === true);
        if (fresh.length > 0) {
          setFreshlyUnlocked(fresh);
          // نفس قناة التوست المستخدمة لمكافآت الدخول — إشعار لحظة الفتح
          const awarded = fresh.reduce((sum, row) => sum + toNumber(row.coins), 0);
          if (awarded > 0) {
            window.dispatchEvent(
              new CustomEvent("foundation:coins", {
                detail: { source: "achievement", awarded, balance: 0 },
              })
            );
          }
          // المكافأة فيها XP، فالأرقام اللي فوق بقت قديمة
          const refreshed = await fetchProfileStats(supabase, userId);
          if (refreshed.data) setStats(refreshed.data);
        }
      }

      const firstError = statsRes.error ?? badgesRes.error ?? coursesRes.error;
      if (firstError) setNotice(firstError.message);

      setIsLoading(false);
    })();
  }, [session, supabase, router]);

  /* ---- الأرقام المشتقّة ---- */
  const level = levelFromXp(stats.xp);
  const xpInLevel = stats.xp - (level - 1) * XP_PER_LEVEL;
  const levelPercent = Math.round((xpInLevel / XP_PER_LEVEL) * 100);

  const milestones = useMemo(
    () =>
      serverAchievements && serverAchievements.length > 0
        ? milestonesFromServer(serverAchievements)
        : buildMilestones(stats, courses, badges.length),
    [serverAchievements, stats, courses, badges.length]
  );

  const unlockedCount = milestones.filter((m) => m.isUnlocked).length;

  return (
    <PageShell
      eyebrow="الإنجازات"
      title="اللي جمعته"
      lede="كل حاجة هنا اتكسبت من المذاكرة نفسها — مافيش زرار بيمنح إنجاز. الأوسمة بتيجي من معارك البوس، والمراحل بتفتح لوحدها لما أرقامك توصلها وتتحفظ في حسابك بمكافأتها."
      feedbackPage="achievements"
      feedbackLabel="صفحة الإنجازات"
    >
      {notice && <DataNotice message={notice} />}

      {/* إشعار لحظة الفتح — بيظهر مرة واحدة بعد ما السيرفر يسجّل الإنجاز */}
      {freshlyUnlocked.length > 0 && (
        <div className="sheet-card sheet-card-live p-4 flex items-start gap-3" role="status" aria-live="polite">
          <span className="text-xl leading-none shrink-0" aria-hidden>🎉</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink">
              إنجاز جديد: {freshlyUnlocked.map((row) => row.title).join(" · ")}
            </p>
            <p className="text-[11px] text-ink-soft mt-1">
              استلمت{" "}
              <span className="mono ltr-num">
                +{arNum(freshlyUnlocked.reduce((sum, row) => sum + toNumber(row.coins), 0))}
              </span>{" "}
              كوين و{" "}
              <span className="mono ltr-num">
                +{arNum(freshlyUnlocked.reduce((sum, row) => sum + toNumber(row.xp), 0))}
              </span>{" "}
              XP — محفوظة في حسابك دلوقتي.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFreshlyUnlocked([])}
            className="mono text-ink-soft hover:text-ink px-2 py-1 rounded-[6px] transition-colors shrink-0"
            aria-label="إغلاق إشعار الإنجاز"
          >
            ✕
          </button>
        </div>
      )}

      {isLoading ? (
        <LoadingSheets count={3} />
      ) : (
        <div className="space-y-6">
          {/* ---- المستوى: الرقم الكبير الأول ---- */}
          <div className="sheet-card sheet-card-live p-5 space-y-4">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div>
                <p className="eyebrow eyebrow-flush mb-2">المستوى</p>
                <p className="font-display font-extrabold text-4xl leading-none text-ink ltr-num">{level}</p>
              </div>
              <p className="tag">
                <span className="ltr-num">{arNum(stats.xp)}</span>
                <span>نقطة إجمالي</span>
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-ink-soft">
                  فاضل <span className="ltr-num">{arNum(XP_PER_LEVEL - xpInLevel)}</span> نقطة للمستوى{" "}
                  <span className="ltr-num">{level + 1}</span>
                </p>
                <span className="mono text-ink-soft ltr-num">{levelPercent}%</span>
              </div>
              <div className="meter">
                <div className={`meter-fill ${themeStyles.accentBg}`} style={{ width: `${levelPercent}%` }} />
              </div>
            </div>
          </div>

          {/* ---- الستريك والأوسمة والمراحل: أرقام سريعة ---- */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              label="الستريك"
              value={`${arNum(stats.streak)} ${stats.streak === 1 ? "يوم" : stats.streak === 2 ? "يومين" : "أيام"}`}
              hint="أيام ورا بعض من غير ما تفوّت"
              accentText={themeStyles.accentText}
            />
            <StatCard
              label="الأوسمة"
              value={arNum(badges.length)}
              hint="من معارك البوس"
              accentText={themeStyles.accentText}
            />
            <StatCard
              label="المراحل"
              value={`${arNum(unlockedCount)}/${arNum(milestones.length)}`}
              hint="اتفتحت لحد دلوقتي"
              accentText={themeStyles.accentText}
            />
          </div>

          {/* ---- المراحل ----
              المقفولة بتتعرض كمان عن قصد: عرض اللي فتح بس بيخلّي الصفحة
              فاضية لمستخدم جديد، والمقفولة هي اللي بتقول «إيه اللي جاي». */}
          <div className="sheet-card p-5 space-y-1">
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <p className="eyebrow eyebrow-flush">المراحل</p>
              <span className="mono text-ink-soft ltr-num">
                {arNum(unlockedCount)}/{arNum(milestones.length)}
              </span>
            </div>

            <div>
              {milestones.map((milestone) => (
                <MilestoneRow key={milestone.id} milestone={milestone} accentBg={themeStyles.accentBg} />
              ))}
            </div>
          </div>

          {/* ---- الأوسمة ---- */}
          <div className="space-y-3">
            <p className="eyebrow eyebrow-flush">الأوسمة</p>

            {badges.length === 0 ? (
              <EmptyState
                icon="🐉"
                title="مافيش أوسمة لسه"
                body="الأوسمة بتيجي من معارك البوس في آخر كل فصل. اكسب معركة وأول وسام بيظهر هنا."
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {badges.map((badge) => (
                  <div key={badge.id} className="sheet-card p-5 space-y-2">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl leading-none shrink-0" aria-hidden>
                        🏆
                      </span>
                      <div className="min-w-0">
                        <p className="font-display font-extrabold text-sm text-ink leading-tight break-words">
                          {badge.title}
                        </p>
                        <p className="tag mt-1">
                          {badge.subject && <span>{badge.subject}</span>}
                          {badge.chapterNumber !== null && (
                            <span>
                              فصل <span className="ltr-num">{arNum(badge.chapterNumber)}</span>
                            </span>
                          )}
                          <span>{formatArabicDate(badge.createdAt)}</span>
                        </p>
                      </div>
                    </div>

                    {badge.accuracy !== null && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-ink-soft">الدقة</span>
                          <span className="mono text-ink-soft ltr-num">{badge.accuracy}%</span>
                        </div>
                        <div className="meter meter-sm">
                          <div
                            className={`meter-fill ${themeStyles.accentBg}`}
                            style={{ width: `${Math.min(100, Math.max(0, badge.accuracy))}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}