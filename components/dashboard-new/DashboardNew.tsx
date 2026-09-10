"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Initial Supabase load is an intentional external-system sync. */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, BookOpen, Flame, Layers3, Settings2, Sparkles, Target } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { railAccountFromUser } from "@/app/dashboard/components/nav-config";
import { levelFromXp } from "@/lib/shop/economy";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { THEME_META, useTheme, type ThemeId } from "@/theme/ThemeProvider";
import { MagicWheel } from "./MagicWheel";
import styles from "./DashboardNew.module.css";

type Day = {
  id: string;
  day: number;
  title: string;
  topic: string;
  description: string;
  isCompleted: boolean;
  xpReward: number;
};

type ActivityEntry = {
  focusMinutes: number;
  tasksCompleted: number;
};

type DashboardData = {
  displayName: string;
  email: string;
  isGuest: boolean;
  subject: string;
  configId: string;
  days: Day[];
  currentDay: Day | null;
  completedDays: number;
  totalDays: number;
  xp: number;
  streak: number;
  level: number;
  coursesCount: number | null;
  goalsCount: number | null;
  badgeCount: number | null;
  activity: Record<string, ActivityEntry>;
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: DashboardData }
  | { status: "error"; message: string };

const NEW_THEME_OPTIONS: { id: ThemeId; label: string; labelEn: string; accent: string; background: string }[] = [
  { id: "magic-color", label: "الملوّن الحالي", labelEn: "Colorful", accent: "#7B7EF4", background: "#11162A" },
  { id: "magic-noir", label: "أسود وأحمر", labelEn: "Black & Red", accent: "#E8342F", background: "#0A0A0C" },
  { id: "magic-blue", label: "أزرق", labelEn: "Blue", accent: "#3B82F6", background: "#081525" },
  { id: "magic-paper", label: "أبيض ورمادي", labelEn: "White & Gray", accent: "#64748B", background: "#F2F4F7" },
];

const COPY = {
  ar: {
    eyebrow: "نسخة معاينة آمنة",
    title: "داشبوردك، من مركز واحد",
    lede: "بياناتك الحقيقية من الخطة والنشاط والستريك — من غير أرقام تجريبية.",
    back: "الداشبورد الحالية",
    language: "English",
    theme: "الثيم",
    currentTheme: "الثيم الحالي",
    plan: "الخطة الحالية",
    progress: "التقدّم",
    streak: "سلسلة التعلّم",
    xp: "نقاط الخبرة",
    courses: "الكورسات",
    days: "يوم",
    completed: "مكتمل",
    currentStep: "خطوتك الحالية",
    openLesson: "افتح الدرس الحقيقي",
    noStep: "لا توجد خطوة محفوظة حاليًا",
    activity: "النشاط الحقيقي",
    activityLede: "دقائق التركيز والمهام من activity_log خلال آخر 7 أيام.",
    focus: "دقيقة تركيز",
    tasks: "مهام",
    goals: "أهداف معلّقة",
    badges: "أوسمة",
    unavailable: "غير متاح حاليًا",
    noActivity: "لا يوجد نشاط مسجّل حتى الآن",
    noActivityLede: "سيظهر الرسم هنا بعد حفظ أول جلسة تركيز أو مهمة مكتملة.",
    noNotifications: "الإشعارات",
    noNotificationsLede: "لا يوجد مصدر إشعارات عام في النظام حاليًا. التذكير الحالي محلي داخل المتصفح.",
    noSubjects: "توزيع المواد",
    noSubjectsLede: "لا يوجد مصدر حقيقي لتوزيع وقت النشاط حسب المادة حتى الآن.",
    retry: "حاول تاني",
    loading: "بيحمّل بياناتك الحقيقية…",
    errorTitle: "ما قدرناش نحمّل الداشبورد الجديدة",
    subject: "المادة",
    planDays: "أيام الخطة",
    currentLevel: "المستوى",
    account: "الحساب",
    guest: "حساب زائر",
    settings: "الإعدادات",
  },
  en: {
    eyebrow: "Safe preview route",
    title: "Your dashboard, in one place",
    lede: "Real plan, activity, and streak data — no placeholder metrics.",
    back: "Current dashboard",
    language: "عربي",
    theme: "Theme",
    currentTheme: "Current theme",
    plan: "Current plan",
    progress: "Progress",
    streak: "Learning streak",
    xp: "Experience points",
    courses: "Courses",
    days: "days",
    completed: "complete",
    currentStep: "Current step",
    openLesson: "Open the real lesson",
    noStep: "No saved step is available",
    activity: "Real activity",
    activityLede: "Focus minutes and tasks from activity_log for the last 7 days.",
    focus: "focus min",
    tasks: "tasks",
    goals: "Pending goals",
    badges: "Badges",
    unavailable: "Currently unavailable",
    noActivity: "No activity has been recorded yet",
    noActivityLede: "The chart will appear after a saved focus session or completed task.",
    noNotifications: "Notifications",
    noNotificationsLede: "There is no general notification feed in the system yet. Current reminders are browser-local.",
    noSubjects: "Subject distribution",
    noSubjectsLede: "There is no reliable source for activity time by subject yet.",
    retry: "Try again",
    loading: "Loading your real data…",
    errorTitle: "We could not load the new dashboard",
    subject: "Subject",
    planDays: "Plan days",
    currentLevel: "Level",
    account: "Account",
    guest: "Guest account",
    settings: "Settings",
  },
} as const;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildActivitySeries(activity: Record<string, ActivityEntry>, locale: "ar" | "en") {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = dayKey(date);
    const entry = activity[key];
    return {
      key,
      label: date.toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US", { weekday: "short" }),
      minutes: entry?.focusMinutes ?? 0,
      tasks: entry?.tasksCompleted ?? 0,
    };
  });
}

async function resolveUser(supabase: ReturnType<typeof createClient>): Promise<User> {
  const userResult = await supabase.auth.getUser();
  if (userResult.data.user) return userResult.data.user;

  const sessionResult = await supabase.auth.getSession();
  if (sessionResult.data.session?.user) return sessionResult.data.session.user;

  const anonymousResult = await supabase.auth.signInAnonymously();
  if (anonymousResult.error || !anonymousResult.data.user) {
    throw new Error("تعذر إنشاء جلسة زائر. حاول تحديث الصفحة.");
  }
  return anonymousResult.data.user;
}

function toDay(row: Record<string, unknown>): Day {
  return {
    id: String(row.id),
    day: Number(row.day_number ?? 0),
    title: String(row.title ?? ""),
    topic: String(row.topic ?? ""),
    description: String(row.description ?? ""),
    isCompleted: Boolean(row.is_completed),
    xpReward: Number(row.xp_reward ?? 0),
  };
}

function ThemePicker({ locale, copy }: { locale: "ar" | "en"; copy: (typeof COPY)["ar"] | (typeof COPY)["en"] }) {
  const { theme, setTheme } = useTheme();
  const selectedNewTheme = NEW_THEME_OPTIONS.some((option) => option.id === theme);

  return (
    <div className={styles.themePicker} aria-label={copy.theme}>
      <span className={styles.controlLabel}>{copy.theme}</span>
      <div className={styles.themeOptions} role="group" aria-label={copy.theme}>
        {NEW_THEME_OPTIONS.map((option) => {
          const selected = theme === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setTheme(option.id)}
              aria-label={locale === "ar" ? option.label : option.labelEn}
              aria-pressed={selected}
              title={locale === "ar" ? option.label : option.labelEn}
              className={`${styles.themeSwatch} ${selected ? styles.themeSwatchSelected : ""}`}
              style={{ "--swatch-accent": option.accent, "--swatch-bg": option.background } as CSSProperties}
            >
              {selected && <span aria-hidden>✓</span>}
            </button>
          );
        })}
      </div>
      {!selectedNewTheme && (
        <span className={styles.legacyThemeNote}>
          {copy.currentTheme}: {THEME_META[theme as keyof typeof THEME_META]?.[locale === "ar" ? "label" : "labelEn"] ?? theme}
        </span>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix,
  icon,
  unavailable = false,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  icon: React.ReactNode;
  unavailable?: boolean;
}) {
  return (
    <article className={styles.statCard} aria-label={label}>
      <span className={styles.statIcon} aria-hidden>{icon}</span>
      <div className={styles.statBody}>
        <p className={styles.statLabel}>{label}</p>
        {unavailable ? (
          <p className={styles.statUnavailable}>{value}</p>
        ) : (
          <p className={styles.statValue}>{value}<span>{suffix}</span></p>
        )}
      </div>
    </article>
  );
}

function ActivityCard({ activity, locale, copy }: { activity: Record<string, ActivityEntry>; locale: "ar" | "en"; copy: (typeof COPY)["ar"] | (typeof COPY)["en"] }) {
  const series = useMemo(() => buildActivitySeries(activity, locale), [activity, locale]);
  const totalMinutes = series.reduce((sum, item) => sum + item.minutes, 0);
  const totalTasks = series.reduce((sum, item) => sum + item.tasks, 0);
  const maxMinutes = Math.max(...series.map((item) => item.minutes), 1);

  return (
    <article className={styles.panel} aria-labelledby="dashboard-new-activity-title">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.panelEyebrow}>{copy.activity}</p>
          <h2 id="dashboard-new-activity-title" className={styles.panelTitle}>{copy.activityLede}</h2>
        </div>
        <BarChart3 size={21} aria-hidden className={styles.panelAccentIcon} />
      </div>

      {totalMinutes === 0 && totalTasks === 0 ? (
        <div className={styles.emptyPanel} role="status">
          <p className={styles.emptyTitle}>{copy.noActivity}</p>
          <p>{copy.noActivityLede}</p>
        </div>
      ) : (
        <>
          <div className={styles.activitySummary}>
            <span><strong>{totalMinutes}</strong> {copy.focus}</span>
            <span><strong>{totalTasks}</strong> {copy.tasks}</span>
          </div>
          <div className={styles.chart} role="img" aria-label={copy.activityLede}>
            <div className={styles.chartBars}>
              {series.map((item) => (
                <div key={item.key} className={styles.chartColumn}>
                  <span className={styles.chartValue}>{item.minutes || ""}</span>
                  <span
                    className={styles.chartBar}
                    style={{ height: `${item.minutes > 0 ? Math.max(10, (item.minutes / maxMinutes) * 100) : 4}%` }}
                    title={`${item.label}: ${item.minutes} ${copy.focus}`}
                  />
                  <span className={styles.chartLabel}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
          <table className={styles.srOnly}>
            <caption>{copy.activity}</caption>
            <tbody>
              {series.map((item) => (
                <tr key={`table-${item.key}`}>
                  <th scope="row">{item.label}</th>
                  <td>{item.minutes} {copy.focus}</td>
                  <td>{item.tasks} {copy.tasks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </article>
  );
}

function UnavailablePanel({
  title,
  body,
  icon,
  unavailableLabel,
}: {
  title: string;
  body: string;
  icon: React.ReactNode;
  unavailableLabel: string;
}) {
  return (
    <article className={styles.panel} aria-label={title}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.panelEyebrow}>{title}</p>
          <h2 className={styles.panelTitle}>{body}</h2>
        </div>
        <span className={styles.unavailableIcon} aria-hidden>{icon}</span>
      </div>
      <div className={styles.unavailableState} role="status">{unavailableLabel}</div>
    </article>
  );
}

export default function DashboardNew() {
  const router = useRouter();
  const [supabase] = useState<ReturnType<typeof createClient> | null>(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  });
  const { locale, toggle: toggleLanguage } = useLanguage();
  const { theme: currentTheme } = useTheme();
  const copy = COPY[locale === "en" ? "en" : "ar"];
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });

  const loadData = useCallback(async () => {
    setLoadState({ status: "loading" });
    const client = supabase;
    if (!client) {
      setLoadState({ status: "error", message: "إعدادات Supabase غير متاحة في هذه البيئة." });
      return;
    }
    try {
      const user = await resolveUser(client);
      const profileResult = await client.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (profileResult.error) throw new Error(profileResult.error.message);

      let profile = profileResult.data as Record<string, unknown> | null;
      if (!profile) {
        const createdProfile = await client
          .from("profiles")
          .insert({ id: user.id, xp: 0, streak: 1, theme: "amber" })
          .select("*")
          .maybeSingle();
        if (createdProfile.error) throw new Error(createdProfile.error.message);
        profile = (createdProfile.data as Record<string, unknown> | null) ?? { xp: 0, streak: 1 };
      }

      const activeConfigId = typeof profile.active_config_id === "string" ? profile.active_config_id : null;
      let configResult = activeConfigId
        ? await client.from("study_configs").select("id, subject").eq("id", activeConfigId).eq("user_id", user.id).maybeSingle()
        : { data: null, error: null };

      if (!configResult.data) {
        configResult = await client
          .from("study_configs")
          .select("id, subject")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
      }

      if (configResult.error) throw new Error(configResult.error.message);
      if (!configResult.data) {
        router.push("/assessment");
        return;
      }

      const config = configResult.data as { id: string; subject: string };
      const [daysResult, activityResult, coursesResult, goalsResult, badgesResult] = await Promise.all([
        client.from("study_days").select("id, day_number, title, topic, description, is_completed, xp_reward").eq("config_id", config.id).eq("user_id", user.id).order("day_number", { ascending: true }),
        client.from("activity_log").select("activity_date, focus_minutes, tasks_completed").eq("user_id", user.id),
        client.from("study_configs").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        client.from("planner_goals").select("id").eq("user_id", user.id).eq("is_done", false),
        client.from("badges").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      ]);

      if (daysResult.error) throw new Error(daysResult.error.message);

      const days = ((daysResult.data ?? []) as Record<string, unknown>[]).map(toDay);
      const completedDays = days.filter((day) => day.isCompleted).length;
      const currentDay = days.find((day) => !day.isCompleted) ?? days.at(-1) ?? null;
      const activity: Record<string, ActivityEntry> = {};
      for (const row of (activityResult.data ?? []) as { activity_date: string; focus_minutes: number | null; tasks_completed: number | null }[]) {
        activity[String(row.activity_date).slice(0, 10)] = {
          focusMinutes: row.focus_minutes ?? 0,
          tasksCompleted: row.tasks_completed ?? 0,
        };
      }

      const account = railAccountFromUser(user);
      const xp = typeof profile.xp === "number" ? profile.xp : 0;
      const streak = typeof profile.streak === "number" ? profile.streak : 1;
      const nextData: DashboardData = {
        displayName: account?.displayName ?? "مستخدم",
        email: account?.displayEmail ?? "",
        isGuest: account?.isGuest ?? user.is_anonymous === true,
        subject: config.subject,
        configId: config.id,
        days,
        currentDay,
        completedDays,
        totalDays: days.length,
        xp,
        streak,
        level: levelFromXp(xp),
        coursesCount: coursesResult.error ? null : coursesResult.count ?? 0,
        goalsCount: goalsResult.error ? null : goalsResult.data?.length ?? 0,
        badgeCount: badgesResult.error ? null : badgesResult.count ?? 0,
        activity,
      };
      setLoadState({ status: "ready", data: nextData });
    } catch (error) {
      setLoadState({ status: "error", message: error instanceof Error ? error.message : "تعذر تحميل بيانات الداشبورد." });
    }
  }, [router, supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loadState.status === "loading") {
    return (
      <main className={styles.page} dir={locale === "ar" ? "rtl" : "ltr"}>
        <div className={styles.loadingState} aria-busy="true" aria-live="polite">
          <span className={styles.loadingOrb} aria-hidden />
          <p>{copy.loading}</p>
        </div>
      </main>
    );
  }

  if (loadState.status === "error") {
    return (
      <main className={styles.page} dir={locale === "ar" ? "rtl" : "ltr"}>
        <section className={styles.errorState} role="alert">
          <p className={styles.panelEyebrow}>{copy.errorTitle}</p>
          <p>{loadState.message}</p>
          <button type="button" onClick={() => void loadData()} className={styles.primaryButton}>{copy.retry}</button>
        </section>
      </main>
    );
  }

  const data = loadState.data;
  const progress = data.totalDays > 0 ? Math.round((data.completedDays / data.totalDays) * 100) : null;

  return (
    <main className={styles.page} dir={locale === "ar" ? "rtl" : "ltr"}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div className={styles.brandBlock}>
            <span className={styles.brandMark} aria-hidden>M✦</span>
            <div>
              <p className={styles.brandName}>Magicly</p>
              <p className={styles.brandSub}>Magic Wheel</p>
            </div>
          </div>
          <div className={styles.topActions}>
            <ThemePicker locale={locale === "en" ? "en" : "ar"} copy={copy} />
            <button type="button" onClick={toggleLanguage} className={styles.languageButton} aria-label={copy.language}>
              {copy.language}
            </button>
            <Link href="/dashboard" className={styles.ghostButton}>{copy.back}</Link>
          </div>
        </header>

        <section className={styles.intro} aria-labelledby="dashboard-new-title">
          <div>
            <p className={styles.pageEyebrow}>{copy.eyebrow}</p>
            <h1 id="dashboard-new-title">{copy.title}</h1>
            <p>{copy.lede}</p>
          </div>
          <div className={styles.accountBadge} aria-label={copy.account}>
            <span className={styles.accountInitial} aria-hidden>{data.displayName.charAt(0).toUpperCase()}</span>
            <span>
              <strong>{data.displayName}</strong>
              <small>{data.isGuest ? copy.guest : data.email}</small>
            </span>
          </div>
        </section>

        <MagicWheel
          locale={locale === "en" ? "en" : "ar"}
          currentDayId={data.currentDay?.id}
          currentDayNumber={data.currentDay?.day}
          totalDays={data.totalDays}
          subject={data.subject}
        />

        <section className={styles.planStrip} aria-label={copy.plan}>
          <div className={styles.planInfo}>
            <div>
              <p className={styles.panelEyebrow}>{copy.plan}</p>
              <h2>{data.subject}</h2>
            </div>
            <span className={styles.planProgressValue}>{progress === null ? "—" : `${progress}%`}</span>
          </div>
          <div className={styles.progressTrack} aria-hidden>
            <span style={{ width: `${progress ?? 0}%` }} />
          </div>
          <p className={styles.planMeta}>
            {data.totalDays > 0 ? `${data.completedDays} / ${data.totalDays} ${copy.completed}` : copy.unavailable}
          </p>
        </section>

        <section className={styles.statsGrid} aria-label={copy.progress}>
          <StatCard label={copy.progress} value={progress === null ? copy.unavailable : progress} suffix={progress === null ? undefined : "%"} icon={<Target size={18} />} unavailable={progress === null} />
          <StatCard label={copy.streak} value={data.streak} suffix={` ${copy.days}`} icon={<Flame size={18} />} />
          <StatCard label={copy.xp} value={data.xp} suffix=" XP" icon={<Sparkles size={18} />} />
          <StatCard label={copy.courses} value={data.coursesCount ?? copy.unavailable} icon={<BookOpen size={18} />} unavailable={data.coursesCount === null} />
        </section>

        <section className={styles.mainGrid}>
          <div className={styles.primaryColumn}>
            <article className={`${styles.panel} ${styles.currentPanel}`} aria-labelledby="dashboard-new-current-title">
              <div className={styles.panelHeader}>
                <div>
                  <p className={styles.panelEyebrow}>{copy.currentStep}</p>
                  <h2 id="dashboard-new-current-title">{data.currentDay?.topic ?? copy.noStep}</h2>
                </div>
                <Layers3 size={21} aria-hidden className={styles.panelAccentIcon} />
              </div>
              {data.currentDay ? (
                <>
                  <p className={styles.currentDescription}>{data.currentDay.description}</p>
                  <Link href={`/lesson/${data.currentDay.id}`} className={styles.primaryButton}>{copy.openLesson}</Link>
                </>
              ) : (
                <p className={styles.emptyInline}>{copy.noStep}</p>
              )}
            </article>

            <ActivityCard activity={data.activity} locale={locale === "en" ? "en" : "ar"} copy={copy} />
          </div>

          <aside className={styles.sideColumn}>
            <article className={styles.panel} aria-label={copy.planDays}>
              <div className={styles.panelHeader}>
                <div>
                  <p className={styles.panelEyebrow}>{copy.planDays}</p>
                  <h2 className={styles.smallPanelTitle}>{data.totalDays > 0 ? `${data.completedDays}/${data.totalDays}` : copy.unavailable}</h2>
                </div>
                <BookOpen size={20} aria-hidden className={styles.panelAccentIcon} />
              </div>
              <p className={styles.mutedText}>{copy.subject}: {data.subject}</p>
              <p className={styles.mutedText}>{copy.currentLevel}: {data.level}</p>
            </article>

            <article className={styles.panel} aria-label={copy.goals}>
              <div className={styles.panelHeader}>
                <div>
                  <p className={styles.panelEyebrow}>{copy.goals}</p>
                  <h2 className={styles.smallPanelTitle}>{data.goalsCount ?? copy.unavailable}</h2>
                </div>
                <Settings2 size={20} aria-hidden className={styles.panelAccentIcon} />
              </div>
              <p className={styles.mutedText}>{data.goalsCount === null ? copy.unavailable : copy.progress}</p>
            </article>

            <article className={styles.panel} aria-label={copy.badges}>
              <div className={styles.panelHeader}>
                <div>
                  <p className={styles.panelEyebrow}>{copy.badges}</p>
                  <h2 className={styles.smallPanelTitle}>{data.badgeCount ?? copy.unavailable}</h2>
                </div>
                <Sparkles size={20} aria-hidden className={styles.panelAccentIcon} />
              </div>
              <p className={styles.mutedText}>{data.badgeCount === null ? copy.unavailable : copy.progress}</p>
            </article>
          </aside>
        </section>

        <section className={styles.unavailableGrid} aria-label={locale === "ar" ? "بيانات غير متاحة" : "Unavailable data"}>
          <UnavailablePanel
            title={copy.noNotifications}
            body={copy.noNotificationsLede}
            icon={<span aria-hidden>🔔</span>}
            unavailableLabel={copy.unavailable}
          />
          <UnavailablePanel
            title={copy.noSubjects}
            body={copy.noSubjectsLede}
            icon={<span aria-hidden>◌</span>}
            unavailableLabel={copy.unavailable}
          />
        </section>

        <footer className={styles.footerNote}>
          <Link href="/dashboard" aria-label={copy.settings} className={styles.footerLink}>{copy.settings}</Link>
          <span>{currentTheme === "magic-paper" ? "White & Gray" : "Magic Wheel preview"}</span>
        </footer>
      </div>
    </main>
  );
}
