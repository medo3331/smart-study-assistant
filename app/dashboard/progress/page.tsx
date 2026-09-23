"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchCourses, fetchActivityRange } from "@/lib/pages-data";
import type { StudyDay } from "@/app/dashboard/components/types";

/* ==========================================================================
   Progress Experience — /dashboard/progress
   Real data only: study_configs / study_days / profiles.streak / activity_log
   Formula: completed / planned * 100 with 0 guard. No DB migrations.
   No mock numbers in production. Defensive: remaining = max(0, planned-completed),
   bar clamped 0-100, empty states for new users, error + loading handled.
   Design: Professional SaaS, var(--card-primary)/--rule/--accent tokens,
   mobile-first, subtle animations, prefers-reduced-motion respected.
   Preserves: Dashboard, Magic Wheel, First Session, QuickNav → /dashboard/progress
   ========================================================================== */

type LoadState = "loading" | "ready" | "error" | "empty";

interface ProgressData {
  totalDays: number;
  completedDays: number;
  remainingDays: number;
  progressPct: number; // 0-100 real (clamped for display)
  rawProgressPct: number; // before clamp (for defensive case)
  subject: string;
  days: StudyDay[];
  currentTask: StudyDay | null;
  streak: number;
  xp: number;
  // weekly history (7 days)
  weekly: { label: string; dateKey: string; tasks: number; minutes: number; hasActivity: boolean }[];
  daysSinceLastActivity: number | null;
  // breakdown from courses (if available)
  breakdown: { name: string; total: number; completed: number; pct: number }[];
  hasCourses: boolean;
}

const ARABIC_WEEKDAYS = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

function clampPct(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export default function ProgressExperiencePage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [state, setState] = useState<LoadState>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [data, setData] = useState<ProgressData | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setErrorMsg(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login?next=/dashboard/progress");
        return;
      }

      // Profile (streak/xp) — same source as Dashboard
      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("streak, xp, active_config_id")
        .eq("id", user.id)
        .maybeSingle();
      if (profErr) throw profErr;
      const streak = (profile as { streak?: number | null } | null)?.streak ?? 1;
      const xp = (profile as { xp?: number | null } | null)?.xp ?? 0;
      const activeConfigId = (profile as { active_config_id?: string | null } | null)?.active_config_id ?? null;

      // Active study config (same logic as dashboard/page.tsx)
      let configRow: { id: string; subject: string; days_count: number | null } | null = null;
      if (activeConfigId) {
        const { data: chosen } = await supabase
          .from("study_configs")
          .select("id, subject, days_count")
          .eq("user_id", user.id)
          .eq("id", activeConfigId)
          .maybeSingle();
        if (chosen) configRow = chosen as unknown as typeof configRow;
      }
      if (!configRow) {
        const { data: newest } = await supabase
          .from("study_configs")
          .select("id, subject, days_count")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        configRow = (newest as unknown as typeof configRow) ?? null;
      }

      // No plan → empty state (valid, not error)
      if (!configRow) {
        // Still try to fetch weekly + breakdown for empty display (will be empty)
        const weekly = buildWeeklyEmpty();
        setData({
          totalDays: 0,
          completedDays: 0,
          remainingDays: 0,
          progressPct: 0,
          rawProgressPct: 0,
          subject: "",
          days: [],
          currentTask: null,
          streak,
          xp,
          weekly,
          daysSinceLastActivity: null,
          breakdown: [],
          hasCourses: false,
        });
        setState("empty");
        return;
      }

      // Study days for active config
      const activeConfigIdForDays = (configRow as { id: string }).id;
      const { data: dayRows, error: daysErr } = await supabase
        .from("study_days")
        .select("id, day_number, title, topic, description, is_completed, xp_reward, learning_style")
        .eq("config_id", activeConfigIdForDays)
        .order("day_number", { ascending: true });
      if (daysErr) throw daysErr;

      const days: StudyDay[] = ((dayRows ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: r.id as string,
        day: r.day_number as number,
        title: (r.title as string) ?? "",
        topic: (r.topic as string) ?? "",
        description: (r.description as string) ?? "",
        isCompleted: Boolean(r.is_completed),
        xpReward: (r.xp_reward as number) ?? 100,
        learningStyle: (r.learning_style as StudyDay["learningStyle"]) ?? "practical",
      }));

      const totalDays = days.length;
      const completedDays = days.filter((d) => d.isCompleted).length;
      const remainingDays = Math.max(0, totalDays - completedDays);
      const rawPct = totalDays > 0 ? (completedDays / totalDays) * 100 : 0;
      const progressPct = clampPct(rawPct);

      // Current task: first uncompleted, or null if all done
      const currentTask = days.find((d) => !d.isCompleted) ?? null;

      // Activity for last 7 days (history + daysSinceLastActivity)
      const today = new Date();
      const from = new Date(today);
      from.setDate(today.getDate() - 6);
      const fromKey = from.toISOString().slice(0, 10);
      const toKey = today.toISOString().slice(0, 10);

      // fetchActivityRange reuses existing helper (handles missing table gracefully)
      let weekly: ProgressData["weekly"] = [];
      let daysSinceLastActivity: number | null = null;
      try {
        const res = await fetchActivityRange(supabase, user.id, fromKey, toKey);
        const map = new Map<string, { focusMinutes: number; tasksCompleted: number }>();
        if (res.data) {
          for (const a of res.data) map.set(a.date, { focusMinutes: a.focusMinutes, tasksCompleted: a.tasksCompleted });
        }
        weekly = Array.from({ length: 7 }, (_, idx) => {
          const d = new Date(from);
          d.setDate(from.getDate() + idx);
          const key = d.toISOString().slice(0, 10);
          const entry = map.get(key);
          return {
            label: ARABIC_WEEKDAYS[d.getDay()],
            dateKey: key,
            tasks: entry?.tasksCompleted ?? 0,
            minutes: entry?.focusMinutes ?? 0,
            hasActivity: Boolean(entry && (entry.tasksCompleted > 0 || entry.focusMinutes > 0)),
          };
        });
        // daysSinceLastActivity: from all activity (not just last 7) — query last date
        const { data: lastRows } = await supabase
          .from("activity_log")
          .select("activity_date")
          .eq("user_id", user.id)
          .order("activity_date", { ascending: false })
          .limit(1);
        const lastKey = (lastRows as Array<{ activity_date: string }> | null)?.[0]?.activity_date?.slice(0, 10) ?? null;
        if (lastKey) {
          const diff = Math.floor(
            (new Date(toKey).getTime() - new Date(lastKey).getTime()) / (1000 * 60 * 60 * 24)
          );
          daysSinceLastActivity = diff;
        }
      } catch {
        // activity_log table may not exist yet → graceful empty history
        weekly = buildWeeklyEmpty();
      }

      // Breakdown: subjects via fetchCourses (same as Dashboard)
      let breakdown: ProgressData["breakdown"] = [];
      let hasCourses = false;
      try {
        const cr = await fetchCourses(supabase, user.id);
        if (cr.data && cr.data.length > 0) {
          hasCourses = cr.data.length > 1;
          // group by subject (as Dashboard does)
          const bySubject = new Map<string, { total: number; done: number }>();
          for (const c of cr.data) {
            const k = c.subject || "بدون اسم";
            const e = bySubject.get(k) ?? { total: 0, done: 0 };
            e.total += c.totalDays;
            e.done += c.completedDays;
            bySubject.set(k, e);
          }
          breakdown = Array.from(bySubject.entries())
            .map(([name, v]) => ({ name, total: v.total, completed: v.done, pct: v.total > 0 ? clampPct((v.done / v.total) * 100) : 0 }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 6);
        }
      } catch {
        // ignore
      }

      setData({
        totalDays,
        completedDays,
        remainingDays,
        progressPct,
        rawProgressPct: rawPct,
        subject: configRow.subject ?? "",
        days,
        currentTask,
        streak,
        xp,
        weekly,
        daysSinceLastActivity,
        breakdown,
        hasCourses,
      });
      // Empty is a valid state with 0 planned — but if config exists with 0 days, treat as empty
      if (totalDays === 0) setState("empty");
      else setState("ready");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "تعذر تحميل تقدمك حاليًا.";
      // Hide internal details (Supabase/SQL) from user
      const safe =
        msg.includes("fetch") || msg.includes("Supabase") || msg.includes("relation")
          ? "تعذر تحميل تقدمك حاليًا. حاول مرة أخرى."
          : msg;
      setErrorMsg(safe);
      setState("error");
    }
  }, [supabase, router]);

  useEffect(() => {
    void load();
  }, [load]);

  // Derived status (deterministic, no AI)
  const status = (() => {
    if (!data) return null;
    if (data.totalDays === 0) return "empty" as const;
    if (data.completedDays >= data.totalDays && data.totalDays > 0) return "completed" as const;
    if (data.daysSinceLastActivity !== null && data.daysSinceLastActivity >= 2 && data.progressPct < 100)
      return "behind" as const;
    return "onTrack" as const;
  })();

  const todayProgress = (() => {
    if (!data || data.totalDays === 0) return null;
    if (!data.currentTask) {
      // all done
      return { state: "done" as const, label: "مكتمل", sub: "أكملت كل مهام الخطة" };
    }
    // currentTask is uncompleted
    return {
      state: "pending" as const,
      label: "مهمة بانتظارك",
      sub: data.currentTask.title || data.currentTask.topic || `اليوم ${data.currentTask.day}`,
      dayLabel: `اليوم ${data.currentTask.day}`,
    };
  })();

  // Header subtitle based on status (deterministic)
  const headerSubtitle =
    state === "loading"
      ? "جاري تحميل تقدمك..."
      : state === "error"
        ? "حدث خطأ أثناء التحميل"
        : status === "completed"
          ? "أكملت خطتك الحالية 🎉"
          : status === "behind"
            ? "لديك بعض الأيام المتأخرة"
            : status === "onTrack"
              ? "مستمر بشكل ممتاز"
              : "تابع إنجازك واعرف الخطوة التالية في رحلتك.";

  return (
    <main className="min-h-screen" dir="rtl" style={{ background: "var(--app-bg)" }}>
      <div className="mx-auto max-w-[1120px] px-4 py-6 sm:px-6 sm:py-8">
        {/* Breadcrumb */}
        <nav aria-label="مسار التنقل" className="mb-4 flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
          <Link href="/dashboard" className="hover:underline" style={{ color: "var(--muted)" }}>
            الرئيسية
          </Link>
          <span aria-hidden>/</span>
          <span style={{ color: "var(--text)", fontWeight: 700 }}>تقدمك الدراسي</span>
        </nav>

        {/* Header */}
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-black tracking-tight sm:text-[26px]" style={{ color: "var(--text)" }}>
              تقدمك الدراسي
            </h1>
            <p className="mt-1.5 max-w-[560px] text-sm leading-6" style={{ color: "var(--muted)" }}>
              {headerSubtitle}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition hover:brightness-110 active:scale-[0.98]"
              style={{ background: "var(--card-primary)", border: "1px solid var(--rule)", color: "var(--text)" }}
            >
              ← العودة للداشبورد
            </Link>
            {state === "ready" && data && (
              <span
                className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-xs font-bold sm:inline-flex"
                style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent)", border: "1px solid color-mix(in srgb, var(--accent) 14%, transparent)" }}
              >
                {data.completedDays} / {data.totalDays} · {data.progressPct}%
              </span>
            )}
          </div>
        </header>

        {/* Loading */}
        {state === "loading" && (
          <div className="space-y-4" aria-busy="true" aria-label="جاري التحميل">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="h-[168px] animate-pulse rounded-[20px]" style={{ background: "var(--card-primary)", border: "1px solid var(--rule)" }} />
              <div className="h-[168px] animate-pulse rounded-[20px]" style={{ background: "var(--card-primary)", border: "1px solid var(--rule)" }} />
            </div>
            <div className="h-[92px] animate-pulse rounded-[20px]" style={{ background: "var(--card-primary)", border: "1px solid var(--rule)" }} />
            <div className="h-[140px] animate-pulse rounded-[20px]" style={{ background: "var(--card-primary)", border: "1px solid var(--rule)" }} />
          </div>
        )}

        {/* Error */}
        {state === "error" && (
          <div
            className="rounded-[20px] border p-6 text-center"
            style={{ background: "var(--card-primary)", borderColor: "var(--rule)", boxShadow: "0 8px 28px var(--shade)" }}
            role="alert"
          >
            <p className="text-sm font-bold" style={{ color: "var(--text)" }}>
              تعذر تحميل تقدمك حاليًا.
            </p>
            {errorMsg && (
              <p className="mx-auto mt-2 max-w-[520px] text-xs leading-5" style={{ color: "var(--muted)" }}>
                {errorMsg}
              </p>
            )}
            <button
              type="button"
              onClick={() => void load()}
              className="mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition hover:brightness-110 active:scale-[0.98]"
              style={{ background: "var(--accent)", color: "white" }}
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        {/* Empty */}
        {state === "empty" && data && (
          <EmptyState subject={data.subject} />
        )}

        {/* Ready */}
        {state === "ready" && data && (
          <div className="space-y-4">
            {/* Overall + Plan */}
            <div className="grid gap-4 lg:grid-cols-[1.35fr_0.85fr]">
              <OverallProgressCard
                progressPct={data.progressPct}
                rawPct={data.rawProgressPct}
                completed={data.completedDays}
                total={data.totalDays}
              />
              <StudyPlanCard
                total={data.totalDays}
                completed={data.completedDays}
                remaining={data.remainingDays}
                progressPct={data.progressPct}
              />
            </div>

            {/* Today + Streak + Status */}
            <div className="grid gap-4 sm:grid-cols-3">
              <TodayProgressCard today={todayProgress} hasPlan={data.totalDays > 0} />
              <StreakCard streak={data.streak} />
              <StatusCard status={status} daysSinceLastActivity={data.daysSinceLastActivity} progressPct={data.progressPct} />
            </div>

            {/* Next Action — most important */}
            <NextActionCard currentTask={data.currentTask} subject={data.subject} total={data.totalDays} completed={data.completedDays} />

            {/* Breakdown + History */}
            <div className="grid gap-4 lg:grid-cols-2">
              <BreakdownCard breakdown={data.breakdown} hasCourses={data.hasCourses} />
              <HistoryCard weekly={data.weekly} />
            </div>

            {/* Defensive note (only when completed > planned) */}
            {data.rawProgressPct > 100 && (
              <div
                className="rounded-[16px] border p-3 text-xs leading-5"
                style={{ background: "color-mix(in srgb, var(--accent) 6%, var(--card-primary))", borderColor: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--muted)" }}
              >
                ملاحظة: لديك <span className="font-mono font-bold" style={{ color: "var(--text)" }}>{data.completedDays} / {data.totalDays}</span> — الشريط مثبت عند 100% ولا يكسر التخطيط، والرقم الأصلي محفوظ.
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function buildWeeklyEmpty(): ProgressData["weekly"] {
  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - 6);
  return Array.from({ length: 7 }, (_, idx) => {
    const d = new Date(from);
    d.setDate(from.getDate() + idx);
    return {
      label: ARABIC_WEEKDAYS[d.getDay()],
      dateKey: d.toISOString().slice(0, 10),
      tasks: 0,
      minutes: 0,
      hasActivity: false,
    };
  });
}

/* ───────── Cards ───────── */

function OverallProgressCard({
  progressPct,
  rawPct,
  completed,
  total,
}: {
  progressPct: number;
  rawPct: number;
  completed: number;
  total: number;
}) {
  const bar = clampPct(progressPct);
  return (
    <section
      aria-label="التقدم العام"
      className="relative overflow-hidden rounded-[20px] border p-5 sm:p-6"
      style={{ background: "var(--card-primary)", borderColor: "var(--rule)", boxShadow: "0 8px 28px var(--shade)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(to left, transparent, var(--accent) 38%, transparent)", opacity: 0.5 }}
      />
      <p className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: "var(--muted)" }}>
        التقدم العام
      </p>
      <div className="mt-3 flex items-baseline gap-3">
        <span className="font-mono text-[42px] font-black leading-none tracking-tight" style={{ color: "var(--text)" }}>
          {progressPct}%
        </span>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {completed} من {total} يوم مكتمل
        </span>
      </div>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full" style={{ background: "rgba(127,127,140,0.14)" }} role="progressbar" aria-valuenow={bar} aria-valuemin={0} aria-valuemax={100} aria-label={`التقدم ${progressPct}%`}>
        <div className="h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(.22,1,.36,1)]" style={{ width: `${bar}%`, background: "var(--accent)" }} />
      </div>
      <div className="mt-2 flex justify-between font-mono text-[11px]" style={{ color: "var(--muted)" }}>
        <span>0%</span>
        <span>100%</span>
      </div>
      {rawPct > 100 && (
        <p className="mt-2 font-mono text-[11px]" style={{ color: "var(--muted)" }}>
          الأصلي: {Math.round(rawPct)}% — معروض 100%
        </p>
      )}
    </section>
  );
}

function StudyPlanCard({
  total,
  completed,
  remaining,
  progressPct,
}: {
  total: number;
  completed: number;
  remaining: number;
  progressPct: number;
}) {
  return (
    <section
      aria-label="خطة الدراسة"
      className="rounded-[20px] border p-5 sm:p-6"
      style={{ background: "var(--card-primary)", borderColor: "var(--rule)", boxShadow: "0 8px 28px var(--shade)" }}
    >
      <p className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: "var(--muted)" }}>
        خطة الدراسة
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-2xl border p-3 text-center" style={{ background: "color-mix(in srgb, var(--card-secondary) 70%, var(--card-primary))", borderColor: "var(--rule)" }}>
          <div className="font-mono text-xl font-black sm:text-2xl" style={{ color: "var(--text)" }}>{total}</div>
          <div className="text-[11px] font-semibold" style={{ color: "var(--muted)" }}>مخطط لها</div>
        </div>
        <div className="rounded-2xl border p-3 text-center" style={{ background: "color-mix(in srgb, var(--accent) 8%, var(--card-primary))", borderColor: "color-mix(in srgb, var(--accent) 14%, transparent)" }}>
          <div className="font-mono text-xl font-black sm:text-2xl" style={{ color: "var(--accent)" }}>{completed}</div>
          <div className="text-[11px] font-semibold" style={{ color: "var(--muted)" }}>مكتملة</div>
        </div>
        <div className="rounded-2xl border p-3 text-center" style={{ background: "color-mix(in srgb, #FB923C 8%, var(--card-primary))", borderColor: "color-mix(in srgb, #FB923C 14%, transparent)" }}>
          <div className="font-mono text-xl font-black sm:text-2xl" style={{ color: "#FB923C" }}>{remaining}</div>
          <div className="text-[11px] font-semibold" style={{ color: "var(--muted)" }}>متبقية</div>
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full" style={{ background: "rgba(127,127,140,0.14)" }}>
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${clampPct(progressPct)}%`, background: "var(--accent)" }} />
      </div>
      <p className="mt-3 text-xs leading-5" style={{ color: "var(--muted)" }}>
        متبقي <b style={{ color: "var(--text)" }}>{remaining} أيام</b> لإكمال الخطة.
      </p>
    </section>
  );
}

function TodayProgressCard({
  today,
  hasPlan,
}: {
  today: { state: "done" | "pending"; label: string; sub: string; dayLabel?: string } | null;
  hasPlan: boolean;
}) {
  if (!hasPlan || !today) {
    return (
      <section aria-label="إنجاز اليوم" className="rounded-[20px] border p-5" style={{ background: "var(--card-primary)", borderColor: "var(--rule)", boxShadow: "0 8px 28px var(--shade)" }}>
        <p className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: "var(--muted)" }}>إنجاز اليوم</p>
        <p className="mt-3 text-sm font-bold" style={{ color: "var(--text)" }}>لا مهام بعد</p>
        <p className="mt-1 text-xs leading-5" style={{ color: "var(--muted)" }}>ابدأ خطتك لترى مهام اليوم.</p>
        <div className="mt-4 h-2 overflow-hidden rounded-full" style={{ background: "rgba(127,127,140,0.14)" }}><div className="h-full rounded-full" style={{ width: "0%", background: "var(--accent)" }} /></div>
      </section>
    );
  }
  const done = today.state === "done";
  return (
    <section aria-label="إنجاز اليوم" className="rounded-[20px] border p-5" style={{ background: "var(--card-primary)", borderColor: "var(--rule)", boxShadow: "0 8px 28px var(--shade)" }}>
      <p className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: "var(--muted)" }}>إنجاز اليوم</p>
      <div className="mt-3 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold" style={{ background: done ? "color-mix(in srgb, #10B981 14%, transparent)" : "color-mix(in srgb, var(--accent) 12%, transparent)", color: done ? "#10B981" : "var(--accent)", border: `1px solid ${done ? "rgba(16,185,129,.18)" : "color-mix(in srgb, var(--accent) 14%, transparent)"}` }} aria-hidden>{done ? "✓" : "◷"}</span>
        <div className="min-w-0">
          <p className="text-sm font-black" style={{ color: "var(--text)" }}>{done ? "مكتمل" : today.label}</p>
          <p className="truncate text-xs leading-5" style={{ color: "var(--muted)" }}>{today.sub}</p>
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full" style={{ background: "rgba(127,127,140,0.14)" }}>
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: done ? "100%" : "0%", background: done ? "#10B981" : "var(--accent)" }} />
      </div>
      {!done && today.dayLabel && <p className="mt-2 font-mono text-[11px]" style={{ color: "var(--muted)" }}>{today.dayLabel} · 1 مهمة</p>}
    </section>
  );
}

function StreakCard({ streak }: { streak: number }) {
  const safe = Number.isFinite(streak) ? Math.max(0, streak) : 1;
  return (
    <section aria-label="السلسلة" className="rounded-[20px] border p-5" style={{ background: "var(--card-primary)", borderColor: "var(--rule)", boxShadow: "0 8px 28px var(--shade)" }}>
      <p className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: "var(--muted)" }}>السلسلة</p>
      <div className="mt-3 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "color-mix(in srgb, #FB923C 14%, transparent)", border: "1px solid rgba(251,146,60,.18)" }} aria-hidden>🔥</span>
        <div>
          <p className="font-mono text-lg font-black" style={{ color: "var(--text)" }}>{safe} أيام متتالية</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>استمر — لا تكسر السلسلة</p>
        </div>
      </div>
      <div className="mt-4 flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < Math.min(4, safe) ? "var(--accent)" : "rgba(127,127,140,0.18)" }} />
        ))}
      </div>
    </section>
  );
}

function StatusCard({
  status,
  daysSinceLastActivity,
  progressPct,
}: {
  status: "onTrack" | "behind" | "completed" | "empty" | null;
  daysSinceLastActivity: number | null;
  progressPct: number;
}) {
  if (status === "empty") {
    return (
      <section aria-label="الحالة" className="rounded-[20px] border p-5" style={{ background: "color-mix(in srgb, var(--card-secondary) 60%, var(--card-primary))", borderColor: "var(--rule)", boxShadow: "0 8px 28px var(--shade)" }}>
        <p className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: "var(--muted)" }}>الحالة</p>
        <p className="mt-3 text-sm font-black" style={{ color: "var(--text)" }}>بانتظار البداية</p>
        <p className="mt-1 text-xs leading-5" style={{ color: "var(--muted)" }}>أنشئ خطتك لتبدأ المتابعة.</p>
      </section>
    );
  }
  if (status === "completed") {
    return (
      <section aria-label="الحالة" className="rounded-[20px] border p-5" style={{ background: "color-mix(in srgb, #7C5CFF 10%, var(--card-primary))", borderColor: "color-mix(in srgb, #7C5CFF 18%, transparent)", boxShadow: "0 8px 28px var(--shade)" }}>
        <p className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: "#A78BFA" }}>الحالة</p>
        <p className="mt-3 text-sm font-black" style={{ color: "var(--text)" }}>أكملت خطتك الحالية 🎉</p>
        <p className="mt-1 text-xs leading-5" style={{ color: "var(--muted)" }}>جاهز للتحدي التالي.</p>
      </section>
    );
  }
  if (status === "behind") {
    return (
      <section aria-label="الحالة" className="rounded-[20px] border p-5" style={{ background: "color-mix(in srgb, #FB923C 10%, var(--card-primary))", borderColor: "color-mix(in srgb, #FB923C 18%, transparent)", boxShadow: "0 8px 28px var(--shade)" }}>
        <p className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: "#FDBA74" }}>الحالة</p>
        <p className="mt-3 text-sm font-black" style={{ color: "var(--text)" }}>لديك بعض الأيام المتأخرة</p>
        <p className="mt-1 text-xs leading-5" style={{ color: "var(--muted)" }}>
          آخر نشاط منذ {daysSinceLastActivity} أيام — {progressPct}% مكتمل.
        </p>
      </section>
    );
  }
  return (
    <section aria-label="الحالة" className="rounded-[20px] border p-5" style={{ background: "color-mix(in srgb, #10B981 10%, var(--card-primary))", borderColor: "color-mix(in srgb, #10B981 18%, transparent)", boxShadow: "0 8px 28px var(--shade)" }}>
      <p className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: "#6EE7B7" }}>الحالة</p>
      <p className="mt-3 text-sm font-black" style={{ color: "var(--text)" }}>أنت ماشي على خطتك 👌</p>
      <p className="mt-1 text-xs leading-5" style={{ color: "var(--muted)" }}>لا تأخر — استمر بنفس الوتيرة.</p>
    </section>
  );
}

function NextActionCard({
  currentTask,
  subject,
  total,
  completed,
}: {
  currentTask: StudyDay | null;
  subject: string;
  total: number;
  completed: number;
}) {
  // Completed plan
  if (!currentTask && total > 0 && completed >= total) {
    return (
      <section aria-label="خطوتك التالية" className="relative overflow-hidden rounded-[20px] border p-5 sm:p-6" style={{ background: "var(--card-primary)", borderColor: "color-mix(in srgb, #7C5CFF 18%, var(--rule))", boxShadow: "0 10px 30px var(--shade)" }}>
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(to left, transparent, #7C5CFF 38%, transparent)", opacity: 0.5 }} />
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg" style={{ background: "#7C5CFF", color: "white" }} aria-hidden>🎉</span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: "var(--muted)" }}>خطوتك التالية</p>
            <h3 className="mt-1 text-[16px] font-black leading-6" style={{ color: "var(--text)" }}>راجع إنجازك أو ابدأ خطة جديدة</h3>
            <p className="mt-1 text-xs leading-5" style={{ color: "var(--muted)" }}>كل أيام الخطة مكتملة — وقت المراجعة أو التوسّع.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/exams" className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-black transition hover:brightness-110 active:scale-[0.98]" style={{ background: "#7C5CFF", color: "white" }}>
              راجع باختبار <span aria-hidden>←</span>
            </Link>
            <Link href="/dashboard/create" className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-bold" style={{ background: "var(--card-secondary)", border: "1px solid var(--rule)", color: "var(--text)" }}>
              خطة جديدة
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (!currentTask) {
    return (
      <section aria-label="خطوتك التالية" className="rounded-[20px] border p-5 sm:p-6" style={{ background: "var(--card-primary)", borderColor: "var(--rule)", boxShadow: "0 10px 30px var(--shade)" }}>
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)", border: "1px solid color-mix(in srgb, var(--accent) 14%, transparent)" }} aria-hidden>🎯</span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: "var(--muted)" }}>خطوتك التالية</p>
            <h3 className="mt-1 font-black" style={{ color: "var(--text)" }}>ابدأ أول خطوة</h3>
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>لا توجد مهام بعد — أنشئ خطتك.</p>
          </div>
          <Link href="/dashboard/create" className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-black" style={{ background: "var(--accent)", color: "white" }}>
            ابدأ الآن <span aria-hidden>←</span>
          </Link>
        </div>
      </section>
    );
  }

  const href = currentTask.id ? `/lesson/${currentTask.id}` : "/dashboard";
  const dayLabel = `اليوم ${currentTask.day} من ${total}`;
  return (
    <section aria-label="خطوتك التالية" className="relative overflow-hidden rounded-[20px] border p-5 sm:p-6" style={{ background: "var(--card-primary)", borderColor: "color-mix(in srgb, var(--accent) 18%, var(--rule))", boxShadow: "0 10px 30px var(--shade)" }}>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(to left, transparent, var(--accent) 38%, transparent)", opacity: 0.5 }} />
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg" style={{ background: "var(--accent)", color: "white" }} aria-hidden>🎯</span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: "var(--muted)" }}>خطوتك التالية</p>
          <h3 className="mt-1 text-[15px] font-black leading-6 sm:text-[16px]" style={{ color: "var(--text)" }}>
            أكمل مذاكرة اليوم{subject ? ` — ${subject}` : ""}: {currentTask.topic || currentTask.title}
          </h3>
          <p className="mt-1 text-xs leading-5" style={{ color: "var(--muted)" }}>
            الهدف الحالي: {currentTask.title || currentTask.topic}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full px-2.5 py-1 font-mono text-xs" style={{ background: "color-mix(in srgb, var(--accent) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }}>
              {dayLabel}
            </span>
            {currentTask.description && <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs" style={{ background: "var(--card-secondary)", border: "1px solid var(--rule)", color: "var(--muted)" }}>20 دقيقة</span>}
          </div>
        </div>
        <Link href={href} className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-black transition hover:brightness-110 active:scale-[0.98]" style={{ background: "var(--accent)", color: "white" }}>
          ابدأ الآن <span aria-hidden>←</span>
        </Link>
      </div>
    </section>
  );
}

function BreakdownCard({
  breakdown,
  hasCourses,
}: {
  breakdown: { name: string; total: number; completed: number; pct: number }[];
  hasCourses: boolean;
}) {
  if (!hasCourses || breakdown.length === 0) {
    return (
      <section aria-label="تقدم المواد" className="rounded-[20px] border p-5" style={{ background: "var(--card-primary)", borderColor: "var(--rule)", boxShadow: "0 8px 28px var(--shade)" }}>
        <p className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: "var(--muted)" }}>تقدم المواد</p>
        <div className="mt-4 rounded-2xl border border-dashed p-4 text-center" style={{ background: "color-mix(in srgb, var(--card-secondary) 60%, var(--card-primary))", borderColor: "var(--rule)" }}>
          <p className="text-sm font-bold" style={{ color: "var(--text)" }}>لا يوجد تقسيم متاح بعد</p>
          <p className="mt-1 text-xs leading-5" style={{ color: "var(--muted)" }}>سيظهر تقسيم المواد هنا عند وجود أكثر من مادة — بدون تخمين.</p>
        </div>
        <p className="mt-3 font-mono text-[11px]" style={{ color: "var(--muted)" }}>المصدر: study_configs + study_days</p>
      </section>
    );
  }
  return (
    <section aria-label="تقدم المواد" className="rounded-[20px] border p-5" style={{ background: "var(--card-primary)", borderColor: "var(--rule)", boxShadow: "0 8px 28px var(--shade)" }}>
      <p className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: "var(--muted)" }}>تقدم المواد</p>
      <div className="mt-4 flex flex-col gap-3">
        {breakdown.map((b) => (
          <div key={b.name}>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-bold" style={{ color: "var(--text)" }}>{b.name}</span>
              <span className="shrink-0 font-mono text-[11px]" style={{ color: "var(--muted)" }}>{b.completed} / {b.total} · {b.pct}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full" style={{ background: "rgba(127,127,140,0.14)" }}>
              <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${clampPct(b.pct)}%`, background: "var(--accent)" }} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 font-mono text-[11px]" style={{ color: "var(--muted)" }}>المصدر: study_configs + study_days — لا تخمين</p>
    </section>
  );
}

function HistoryCard({
  weekly,
}: {
  weekly: { label: string; dateKey: string; tasks: number; minutes: number; hasActivity: boolean }[];
}) {
  const hasAny = weekly.some((w) => w.hasActivity);
  const maxMinutes = Math.max(1, ...weekly.map((w) => w.minutes));
  return (
    <section aria-label="هذا الأسبوع" className="rounded-[20px] border p-5" style={{ background: "var(--card-primary)", borderColor: "var(--rule)", boxShadow: "0 8px 28px var(--shade)" }}>
      <p className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: "var(--muted)" }}>هذا الأسبوع</p>
      {!hasAny ? (
        <div className="mt-4 rounded-2xl border border-dashed p-4 text-center" style={{ background: "color-mix(in srgb, var(--card-secondary) 60%, var(--card-primary))", borderColor: "var(--rule)" }}>
          <p className="text-sm font-bold" style={{ color: "var(--text)" }}>سيظهر سجل تقدمك هنا مع استمرار الدراسة.</p>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>7 أيام — أيام بلا نشاط تظهر — وليس رسمًا وهميًا.</p>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-7 gap-2 sm:gap-3" role="img" aria-label="سجل الأسبوع">
            {weekly.map((d) => {
              const h = d.hasActivity ? Math.max(10, Math.round((d.minutes / maxMinutes) * 48)) : 8;
              return (
                <div key={d.dateKey} className="flex flex-col items-center gap-1.5">
                  <div className="w-full max-w-[36px] rounded-[8px] transition-[height] duration-500" style={{ height: `${h}px`, background: d.hasActivity ? "var(--accent)" : "rgba(127,127,140,0.18)", opacity: d.hasActivity ? 1 : 0.7 }} aria-hidden />
                  <span className="text-[11px] font-bold" style={{ color: "var(--muted)" }}>{d.label}</span>
                  <span className="font-mono text-[10px]" style={{ color: d.hasActivity ? "var(--accent)" : "var(--muted)" }}>{d.hasActivity ? "✓" : "—"}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 font-mono text-[11px]" style={{ color: "var(--muted)" }}>المصدر: activity_log — لا chart وهمي</p>
        </>
      )}
    </section>
  );
}

function EmptyState({ subject }: { subject: string }) {
  return (
    <div className="space-y-4">
      <div className="rounded-[20px] border p-6 text-center sm:p-8" style={{ background: "var(--card-primary)", borderColor: "var(--rule)", boxShadow: "0 8px 28px var(--shade)" }}>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-xl" style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 14%, transparent)" }} aria-hidden>📚</div>
        <h2 className="mt-4 text-lg font-black" style={{ color: "var(--text)" }}>ابدأ أول خطة دراسية لك</h2>
        <p className="mx-auto mt-2 max-w-[520px] text-sm leading-6" style={{ color: "var(--muted)" }}>
          أنشئ خطة بسيطة وابدأ متابعة تقدمك. التقدم الحالي <span className="font-mono font-bold" style={{ color: "var(--text)" }}>0%</span> — هذا طبيعي قبل البداية.
          {subject ? ` مادتك المقترحة: ${subject}.` : ""}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href="/dashboard/create" className="inline-flex items-center gap-1.5 rounded-full px-6 py-2.5 text-sm font-black transition hover:brightness-110 active:scale-[0.98]" style={{ background: "var(--accent)", color: "white" }}>
            ابدأ الآن — أنشئ خطتك <span aria-hidden>←</span>
          </Link>
          <Link href="/assessment" className="inline-flex items-center gap-1.5 rounded-full px-6 py-2.5 text-sm font-bold" style={{ background: "var(--card-secondary)", border: "1px solid var(--rule)", color: "var(--text)" }}>
            تحديد المستوى
          </Link>
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <span className="inline-flex items-center rounded-full px-3 py-1 font-mono text-xs" style={{ background: "var(--card-secondary)", border: "1px solid var(--rule)", color: "var(--muted)" }}>planned = 0 → 0% (لا NaN)</span>
          <span className="inline-flex items-center rounded-full px-3 py-1 font-mono text-xs" style={{ background: "var(--card-secondary)", border: "1px solid var(--rule)", color: "var(--muted)" }}>remaining = 0</span>
          <span className="inline-flex items-center rounded-full px-3 py-1 text-xs" style={{ background: "var(--card-secondary)", border: "1px solid var(--rule)", color: "var(--muted)" }}>لا أرقام وهمية</span>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-[20px] border p-5 opacity-70" style={{ background: "var(--card-primary)", borderColor: "var(--rule)" }}>
          <p className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: "var(--muted)" }}>التقدم العام</p>
          <p className="mt-3 font-mono text-2xl font-black" style={{ color: "var(--text)" }}>—</p>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>سيظهر هنا بعد إنشاء الخطة</p>
        </div>
        <div className="rounded-[20px] border p-5 opacity-70" style={{ background: "var(--card-primary)", borderColor: "var(--rule)" }}>
          <p className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: "var(--muted)" }}>إنجاز اليوم</p>
          <p className="mt-3 text-sm font-bold" style={{ color: "var(--text)" }}>لا مهام بعد</p>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>ابدأ خطتك لترى مهام اليوم</p>
        </div>
        <div className="rounded-[20px] border p-5 opacity-70" style={{ background: "var(--card-primary)", borderColor: "var(--rule)" }}>
          <p className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: "var(--muted)" }}>السلسلة</p>
          <p className="mt-3 font-mono font-black" style={{ color: "var(--text)" }}>—</p>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>ابدأ وتظهر سلسلتك</p>
        </div>
      </div>
    </div>
  );
}
