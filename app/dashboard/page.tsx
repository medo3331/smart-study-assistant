"use client";
/* eslint-disable react-hooks/exhaustive-deps -- TODO: stable deps */
/* eslint-disable react-hooks/set-state-in-effect -- Syncing with external system is intentional */
/* eslint-disable @typescript-eslint/no-explicit-any -- TODO: proper typing requires architecture change, tracked separately */

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- retained for future use
import { AIStudyCoach } from "@/components/AIStudyCoach";
import type { CoachTask } from "@/components/AIStudyCoach";
import { BossFight } from "@/components/BossFight";
import { PERSONA_NAME } from "@/lib/persona";
import { awardCoins } from "@/lib/shop/shop-data";

import type {
  ActivityLog,
  CategoryType,
  Flashcard,
  LeaderboardEntry,
  LearningStyle,
  StudyConfig,
  StudyDay,
  ThemeColor,
} from "./components/types";

import { StatsSection } from "./components/StatsSection";
import { HeroSection } from "./components/HeroSection";
import { StudySections } from "./components/StudySections";
import { AnalyticsSection } from "./components/AnalyticsSection";
import { useAudio } from "@/components/audio/AudioProvider";
import { Sidebar, type SettingsSectionId } from "./components/Sidebar";
import { QuranSection } from "./components/QuranSection";
import { NavRail } from "./components/NavRail";
import { railAccountFromUser, takeNavIntent, type NavSignal } from "./components/nav-config";
import { KpiSection } from "./components/KpiSection";
import { WeeklyProgress } from "./components/WeeklyProgress";
import { AchievementsStrip } from "./components/AchievementsStrip";
import { THEME_STYLES, HEATMAP_COLORS } from "./components/theme-helpers";
// 🎴 إعادة تصميم الداشبورد (نظام موحّد): هيرو + كروت أرقام + الخطوة الحالية.
// نفس حالة الصفحة الحقيقية (profiles / study_days / activity_log) بدون أي مصدر بيانات جديد.
import { HeroCard } from "./components/HeroCard";
import { StatCards } from "./components/StatCards";
import { CurrentStepCard } from "./components/CurrentStepCard";
import { PersonalAssistant } from "./components/PersonalAssistant";
// 🧩 سياق المساعد الشخصي (Phase 2A) — بيفرّغ حالة الداشبورد الحقيقية في سياق واحد.
import { buildPersonalContext, type PendingGoalRow } from "@/lib/personal-assistant/context";
// 📝 قاموس نصوص الواجهة بقى في مكان واحد: lib/user-persona.ts
// الإيموجي متشال من النصوص دي: sectionTitle بقى لافتة مونوسبيس فوق
// اسم المادة، و aiDiscussBtn بقى زرار هادي جنب زرار الدرس.
import { DEFAULT_PERSONA, getUiText, isPersona } from "@/lib/user-persona";
import type { Persona } from "@/lib/user-persona";
import { LeaderboardModal } from "./components/Models/LeaderboardModal";
import {  ShopModal } from "./components/Models/ShopModal";
import {  ParentReportModal,  } from "./components/Models/ParentReportModal";
import {  WeeklySummaryModal } from "./components/Models/WeeklySummaryModal";
import { AiChatModal } from "./components/Aichat";
// 🚨 خطة الطوارئ + الرأي + الجروب — كومبوننتات عامة بره مجلد الداشبورد
import { ExamPlanCard } from "@/components/ExamPlanCard";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { CommunityInvite } from "@/components/CommunityInvite";
// 🐣 الرفيق: الكمبوننت موجود من الأول، والمتجر بيغيّر إيموجيه بس
import { StudyPet } from "@/components/StudyPet";

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- retained for future use
import { StudyTutorWidget } from "@/components/StudyTutorWidget";
import { useEquippedCompanion } from "@/lib/shop/use-companion";

// ⚔️ تقسيم الأيام لفصول (Chapters) كل 5 أيام - يشغّل زرار Boss Fight بعد كل فصل مكتمل
// ✅ ملحوظة: نفس القيمة دي متعرّفة جوه StudySections.tsx كمان (بيستخدمها في عرض زرار البوس) -
// لو غيّرت الرقم هنا لازم تغيّره هناك كمان عشان الاتنين يفضلوا متزامنين.
const CHAPTER_SIZE = 5;

export default function DashboardPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  // 1. البيانات الأساسية والمستخدم
  const [config, setConfig] = useState<StudyConfig | null>(null);
  const [configId, setConfigId] = useState<string | null>(null);
  const [days, setDays] = useState<StudyDay[]>([]);
  const [currentDayNumber, setCurrentDayNumber] = useState(1);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  /** بيزيد لما خطة امتحان تتحفظ من الشات — بيعيد تركيب كارت الخطة. */
  const [examPlanKey, setExamPlanKey] = useState(0);

  // 2. الـ Gamification والثيم
  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(1);
  const [theme, setTheme] = useState<ThemeColor>("amber");

  /* 🐣 الرفيق الملبوس — استعلام واحد، وأي فشل معناه الرفيق الأصلي.
     مش داخل في `isInitialized` عن قصد: الصفحة مالهاش تستنى إيموجي. */
  const companion = useEquippedCompanion(supabase, authUser?.id ?? null);

  const level = Math.floor(xp / 200) + 1;
  const xpForCurrentLevelStart = (level - 1) * 200;
  const xpForNextLevel = level * 200;
  const xpInCurrentLevel = xp - xpForCurrentLevelStart;
  const currentLevelProgress = Math.round((xpInCurrentLevel / 200) * 100);
  const xpRemaining = xpForNextLevel - xp;

  // 3. الصوت — الحالة كلها في `AudioProvider` على مستوى الموقع.
  //
  // ⚠️ كانت هنا (activeTrack/isPlayingAudio/audioVolume/audioError +
  // عنصر <audio>). المشكلة إن التنقّل بـ router.push بيشيل الصفحة دي من
  // الشجرة ومعاها عنصر الصوت، فالصوت كان بيفصل أول ما تروح «الكورسات».
  // الصفحة بتقرا الحالة دلوقتي بس — التشغيل مش شغلها.
  const { activeTrack, isPlaying: isPlayingAudio } = useAudio();

  // 4. المودالات والقوائم
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  /* 📖 ١٢ أغسطس: الدرج بيفتح على قسم بعينه. كارت القرآن بيقول «كل السور
     والقرّاء» — يعني افتح الإعدادات على «الصوت» على طول، مش سيب المستخدم
     يدوّر. بيترجع `null` مع القفل عشان الفتحة اللي بعدها من ⚙️ تبدأ
     بالأقسام كلها مقفولة زي ما هي مفروض. */
  const [settingsFocus, setSettingsFocus] = useState<SettingsSectionId | null>(null);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [newSubjectInput, setNewSubjectInput] = useState("");
  const [showShopModal, setShowShopModal] = useState(false);
  const [showParentReport, setShowParentReport] = useState(false);
  const [isEmergencyMode, setIsEmergencyMode] = useState(false);

  // 5. البومودورو والـ Flashcards
  const [showPomodoro, setShowPomodoro] = useState(false);
  const [pomoTime, setPomoTime] = useState(25 * 60);
  const [isPomoRunning, setIsPomoRunning] = useState(false);
  const [userNote, setUserNote] = useState("");
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);

  // 6. الدرس المفتوح حاليًا في محادثة الـ AI
  const [activeAiLesson, setActiveAiLesson] = useState<StudyDay | null>(null);

  // 7. رسالة التهنئة عند إنجاز يوم
  const [celebration, setCelebration] = useState<{ topic: string; xp: number } | null>(null);

  // 8. سجل النشاط اليومي (للرسوم البيانية)
  const [activityLog, setActivityLog] = useState<ActivityLog>({});
  const [analyticsRange, setAnalyticsRange] = useState<"weekly" | "monthly">("weekly");

  // 9. تنبيهات تذكير الستريك
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("20:00");
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">("default");

  // 10. لوحة المتصدرين
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);

  // 11. 👤 قايمة التنقل هي مصدر كل الأدوات دلوقتي — الشريط العلوي اتشال
  // في ٨ أغسطس، فمافيش منيوهات منسدلة في الترويسة تحتاج حالة أو refs.

  // 12. فتح الأيام بدري بواسطة XP
  const [earlyUnlockedDays, setEarlyUnlockedDays] = useState<number[]>([]);

  // ⚔️ تحدي البوس النشط حاليًا
  const [activeBossChapter, setActiveBossChapter] = useState<number | null>(null);

  // 🏅 عدد أوسمة تحدي الفصل — بيستخدمه شريط الإنجازات في معلَم "أول تحدي فصل".
  // بنجيب العدد بس (head: true) مش الصفوف، لأن القايمة الكاملة في
  // /dashboard/achievements وهي اللي بتقرا الصفوف بـ fetchBadges.
  const [badgeCount, setBadgeCount] = useState(0);

  // 13. الملخص الأسبوعي التلقائي
  const [showWeeklySummary, setShowWeeklySummary] = useState(false);
  const [weeklySummaryData, setWeeklySummaryData] = useState<{ days: number; minutes: number } | null>(null);

  const [isChangingSubject, setIsChangingSubject] = useState(false);
  const [isAddingPlanStep, setIsAddingPlanStep] = useState(false);

  // 14. 👤 الشخصية — بتتقرا من profiles.persona وبتغيّر نصوص الواجهة كلها
    const [persona, setPersona] = useState<Persona>(DEFAULT_PERSONA);

    // 🎯 للمساعد الشخصي (Phase 2A): الأهداف المعلقة والمستوى الدراسي — خام،
    // والتحويل لسياق مسؤولية buildPersonalContext تحت.
    const [pendingGoals, setPendingGoals] = useState<PendingGoalRow[]>([]);
    const [studentLevel, setStudentLevel] = useState<string | null>(null);

  // 🔴 دالة توليد الأيام
  // ⚠️ الشخصية بتتمرّر صريح مش بتتقرا من الحالة: أول نداء بيحصل جوه نفس دالة
  // التحميل اللي بتعمل setPersona، و setState مش فورية — فلو قرينا من الحالة
  // هنا، خريج أو فري لانسر كان هياخد أيام باسم «الدرس ١» بدل «المشروع ١».
  const generateDays = (parsedConfig: StudyConfig, forPersona: Persona): StudyDay[] => {
    const uiText = getUiText(parsedConfig.category, forPersona);
    const generatedDays: StudyDay[] = Array.from({ length: parsedConfig.daysCount || 7 }, (_, i) => ({
      day: i + 1,
      title: `${uiText.stepPrefix} ${i + 1}`,
      topic: `${uiText.stepPrefix} ${i + 1}: في ${parsedConfig.subject}`,
      description: `${uiText.taskDescPrefix} ${parsedConfig.subject}.`,
      isCompleted: false,
      xpReward: 100,
      learningStyle: "practical",
    }));
    setDays(generatedDays);
    return generatedDays;
  };

  // 🔴 إدراج أيام الخطة في قاعدة البيانات (Supabase)
  async function insertDaysToDb({
    userId,
    cfgId,
    generatedDays,
  }: {
    userId: string;
    cfgId: string;
    generatedDays: StudyDay[];
  }): Promise<StudyDay[]> {
    const rows = generatedDays.map((d) => ({
      config_id: cfgId,
      user_id: userId,
      day_number: d.day,
      title: d.title,
      topic: d.topic,
      description: d.description,
      is_completed: d.isCompleted,
      xp_reward: d.xpReward,
      learning_style: d.learningStyle,
    }));
    const { data, error } = await supabase.from("study_days").insert(rows).select();
    if (error || !data) {
      console.error("insertDaysToDb failed:", error);
      return generatedDays;
    }
    return data
      .sort((a: { day_number: number }, b: { day_number: number }) => a.day_number - b.day_number)
      .map((row: any) => ({
        id: row.id,
        day: row.day_number,
        title: row.title,
        topic: row.topic,
        description: row.description,
        isCompleted: row.is_completed,
        xpReward: row.xp_reward,
        learningStyle: row.learning_style as LearningStyle,
      }));
  }

  // 🔴 تحميل بيانات المستخدم من Supabase عند بداية التشغيل
  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    async function loadData(): Promise<void> {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        let currentUser = user;

        if (!currentUser) {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (session?.user) {
            currentUser = session.user;
          } else {
            const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
            if (anonError || !anonData.user) {
              console.error("Failed to create guest session:", anonError);
              setLoadError("تعذر إنشاء جلسة زائر. حاول تحدّث الصفحة.");
              return;
            }
            currentUser = anonData.user;
          }
        }
        setAuthUser(currentUser);

        const { data: profileData } = await supabase.from("profiles").select("*").eq("id", currentUser.id).maybeSingle();

        let profile = profileData;

        if (!profile) {
          const { data: newProfile } = await supabase
            .from("profiles")
            .insert({ id: currentUser.id, xp: 0, streak: 1, theme: "amber" })
            .select()
            .maybeSingle();
          profile = newProfile;
        }

        // 👤 الشخصية بتحدد نصوص الواجهة (وحدة التقدم، اسم النقاط، نبرة الزراير).
        // بتتختار في اللاندينج وبتتحفظ في /assessment.
        // المتغير المحلي ده هو اللي بيتمرّر لـ generateDays تحت — الحالة نفسها
        // مش بتبقى جاهزة قبل نهاية الدالة دي.
        const loadedPersona: Persona = isPersona(profile?.persona) ? profile.persona : DEFAULT_PERSONA;
                setPersona(loadedPersona);
                // المستوى الدراسي (للطالب عليه) — بيفضل null لغيرهم، والمساعد بيلفه بسهولة.
                setStudentLevel((profile?.student_level as string) ?? null);

        let currentStreak = profile?.streak || 1;
        if (profile) {
          setXp(profile.xp || 0);
          setTheme((profile.theme as ThemeColor) || "amber");

          const today = new Date().toDateString();
          const lastVisit = profile.last_study_day ? new Date(profile.last_study_day).toDateString() : null;
          if (lastVisit !== today) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const streakGrew = lastVisit === yesterday.toDateString();
            currentStreak = streakGrew ? currentStreak + 1 : lastVisit ? 1 : currentStreak;
            await supabase
              .from("profiles")
              .update({ streak: currentStreak, last_study_day: new Date().toISOString().slice(0, 10) })
              .eq("id", currentUser.id);

            /* 🪙 كوينز أول زيارة في اليوم. الفرع ده بيتنفّذ مرة واحدة يومياً
               (`lastVisit !== today`) فهو بالظبط معنى «دخول يومي».

               ⚠️ مش بـ await: ده جوه مسار تحميل الداشبورد، والانتظار على
               نداءين RPC بيأخّر أول رسم. الكوينز إضافة، فبتروح لوحدها
               والصفحة تكمّل. أي فشل (db/shop.sql لسه ما اتشغّلش) بيتسجّل
               في الكونسول وخلاص — التقدّم نفسه اتحفظ فوق.

               `streak_day` عند النمو بس: لو السلسلة اتصفّرت لـ ١ يبقى
               مافيش سلسلة تتكافأ عليها. */
            void (async () => {
              try {
                await awardCoins(supabase, "daily_login");
                if (streakGrew) {
                  await awardCoins(supabase, "streak_day");
                  /* كل ٧ أيام متواصلة = أسبوع كامل. نفس عدّاد إنجاز
                     «week-streak» في صفحة الإنجازات، فالمستخدم بيشوف
                     الوسام والكوينز في نفس اليوم مش في يومين مختلفين. */
                  if (currentStreak % 7 === 0) await awardCoins(supabase, "perfect_week");
                }
              } catch (coinErr) {
                console.error("award daily coins failed (متجاهَل):", coinErr);
              }
            })();
          }
          setStreak(currentStreak);
        }

        // 📚 التراك المفتوح: صفحة الكورسات بتكتب اختيارك في
        // profiles.active_config_id، وإحنا بنقراه من البروفايل اللي محمّل فوق
        // خلاص (select *) — فمافيش استعلام زيادة.
        //
        // الاختيار في الحساب مش على الجهاز: تختار من اللابتوب تلاقيه مفتوح
        // على الموبايل. ولو العمود لسه مش موجود (الـ SQL ما اتشغّلش)، القيمة
        // بتطلع undefined والداشبورد تفتح أحدث تراك — نفس السلوك الأصلي.
        const savedConfigId: string | null = profile?.active_config_id ?? null;

        let existingConfig: Record<string, any> | null = null;

        if (savedConfigId) {
          const { data: chosen } = await supabase
            .from("study_configs")
            .select("*")
            .eq("user_id", currentUser.id)
            .eq("id", savedConfigId)
            .maybeSingle();

          // لو مش موجود مابنصفّرش العمود هنا: الـ FK (on delete set null)
          // بيعمل ده لوحده وقت الحذف. الحالة الوحيدة اللي نوصل لها هنا هي
          // سباق بين تابين، وأحدث تراك حل مقبول لها.
          if (chosen) existingConfig = chosen;
        }

        if (!existingConfig) {
          const { data: newest } = await supabase
            .from("study_configs")
            .select("*")
            .eq("user_id", currentUser.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          existingConfig = newest;
        }

        let activeConfig: StudyConfig;
        let activeConfigId: string;

        if (existingConfig) {
          activeConfig = {
            subject: existingConfig.subject,
            category: existingConfig.category as CategoryType,
            subCategory: existingConfig.sub_category || undefined,
            daysCount: existingConfig.days_count,
          };
          activeConfigId = existingConfig.id;

          const { data: existingDays } = await supabase
            .from("study_days")
            .select("*")
            .eq("config_id", existingConfig.id)
            .order("day_number", { ascending: true });

          if (existingDays && existingDays.length > 0) {
            setDays(
              existingDays.map((row: any) => ({
                id: row.id,
                day: row.day_number,
                title: row.title,
                topic: row.topic,
                description: row.description,
                isCompleted: row.is_completed,
                xpReward: row.xp_reward,
                learningStyle: row.learning_style as LearningStyle,
              }))
            );
          } else {
            const generated = generateDays(activeConfig, loadedPersona);
            const savedDays = await insertDaysToDb({ userId: currentUser.id, cfgId: activeConfigId, generatedDays: generated });
            setDays(savedDays);
          }
        } else {
          router.push("/assessment");
          return;
        }

        setConfig(activeConfig);
        setConfigId(activeConfigId);
        setNewSubjectInput(activeConfig.subject);

        const savedEarlyUnlocked = localStorage.getItem(`early_unlocked_${activeConfigId}`);
        if (savedEarlyUnlocked) {
          try {
            setEarlyUnlockedDays(JSON.parse(savedEarlyUnlocked));
          } catch {
            /* ignore */
          }
        }

        const { data: activityRows } = await supabase.from("activity_log").select("*").eq("user_id", currentUser.id);
                if (activityRows) {
                          const logMap: ActivityLog = {};
                          activityRows.forEach((row: any) => {
                            logMap[row.activity_date] = { focusMinutes: row.focus_minutes, tasksCompleted: row.tasks_completed };
                          });
                          setActivityLog(logMap);
                        }

                        // 🎯 الأهداف غير المكتملة بتروح للمساعد الشخصي (تعداد + استعجال).
                        // نفس أعمدة fetchGoals في lib/pages-data.ts — والصفوف خام عشان
                        // buildPersonalContext هي اللي بتحسب الـ urgency بموعدها النهائي.
                        const { data: goalRows, error: goalsError } = await supabase
                          .from("planner_goals")
                          .select("title, due_date, priority, is_done")
                          .eq("user_id", currentUser.id)
                          .eq("is_done", false);
                        if (goalsError) {
                          // جدول planner_goals مش متشغّل (db/pages.sql) → كارت الأهداف يختفي بهدوء.
                          console.warn("تعذر جلب أهداف المخطط (شغّل db/pages.sql):", goalsError.message);
                        } else if (goalRows) {
                          setPendingGoals(goalRows as PendingGoalRow[]);
                        }

        // 🏅 عدد الأوسمة. بيفشل بهدوء عن قصد: جدول badges جاي من
        // db/pages.sql، ولو الملف ده لسه ما اتشغّلش في Supabase الداشبورد
        // كلها ما تقعش — الشريط بيعرض معلَم "أول تحدي فصل" مقفول وخلاص.
        const { count: badgeRows, error: badgeError } = await supabase
          .from("badges")
          .select("*", { count: "exact", head: true })
          .eq("user_id", currentUser.id);
        if (badgeError) console.warn("تعذّر جلب عدد الأوسمة (شغّل db/pages.sql):", badgeError.message);
        else setBadgeCount(badgeRows ?? 0);

        const savedProgress = localStorage.getItem("study_progress");
        if (savedProgress) {
          try {
            const { flashcards: savedCards } = JSON.parse(savedProgress);
            if (savedCards) setFlashcards(savedCards);
          } catch {
            /* ignore */
          }
        }

        const savedNotifPref = localStorage.getItem("study_notif_prefs");
        if (savedNotifPref) {
          try {
            const { enabled, time } = JSON.parse(savedNotifPref);
            setReminderTime(time || "20:00");
            if (enabled && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              setNotificationsEnabled(true);
            }
          } catch {
            /* ignore */
          }
        }
        if (typeof window !== "undefined" && "Notification" in window) {
          setNotifPermission(Notification.permission);
        } else {
          setNotifPermission("unsupported");
        }
      } catch (err) {
        console.error("loadData failed:", err);
        setLoadError("حصل خطأ غير متوقع أثناء تحميل بياناتك. افتح Console (F12) لمزيد من التفاصيل.");
      } finally {
        setIsInitialized(true);
      }
    }

    loadData();
  }, []);

  // 🔴 حفظ XP / الستريك / الثيم في قاعدة البيانات عند أي تغيير
  useEffect(() => {
    if (isInitialized && authUser) {
      supabase.from("profiles").update({ xp, streak, theme }).eq("id", authUser.id).then();
    }
  }, [xp, streak, theme, isInitialized, authUser]);

  /* 📖 تصفير الفتحة الموجّهة عند قفل الدرج.
     كارت القرآن بيقول «افتح على الصوت»، والدرج بيفتح القسم ده. لو القيمة
     فضلت متعلّقة، أي فتحة بعد كده من ⚙️ كانت هتفتح «الصوت» تاني — وأسوأ:
     لو المستخدم قفل القسم بنفسه، إعادة فتح الدرج كانت هتفتحه في وشه تاني
     وتلغي اختياره الصريح. الشرط على القفل مش على الفتح عشان يشتغل مع أي
     طريقة قفل (زرار الإكس، الضغط على الخلفية، أو إشارة تنقّل). */
  useEffect(() => {
    if (!isMenuOpen) setSettingsFocus(null);
  }, [isMenuOpen]);

  // 🔴 حفظ الفلاش كاردز محلياً
  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem("study_progress", JSON.stringify({ flashcards }));
    }
  }, [flashcards, isInitialized]);

  // 🔴 حفظ تفضيلات التنبيهات
  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem("study_notif_prefs", JSON.stringify({ enabled: notificationsEnabled, time: reminderTime }));
    }
  }, [notificationsEnabled, reminderTime, isInitialized]);

  // ✅ حفظ الأيام المفتوحة بدري محليًا
  useEffect(() => {
    if (isInitialized && configId) {
      localStorage.setItem(`early_unlocked_${configId}`, JSON.stringify(earlyUnlockedDays));
    }
  }, [earlyUnlockedDays, isInitialized, configId]);

  // ✅ ملخص أسبوعي تلقائي
  useEffect(() => {
    if (!isInitialized) return;
    const now = new Date();
    const dayOfWeek = now.getDay();
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - dayOfWeek);
    const weekKey = sunday.toISOString().slice(0, 10);
    const lastShown = localStorage.getItem("last_weekly_summary_shown");
    if (lastShown === weekKey) return;

    let totalMinutes = 0;
    let activeDaysCount = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const entry = activityLog[key];
      if (entry) {
        totalMinutes += entry.focusMinutes;
        if (entry.focusMinutes > 0 || entry.tasksCompleted > 0) activeDaysCount++;
      }
    }
    if (totalMinutes > 0 || activeDaysCount > 0) {
      setWeeklySummaryData({ days: activeDaysCount, minutes: totalMinutes });
      setShowWeeklySummary(true);
    }
    localStorage.setItem("last_weekly_summary_shown", weekKey);
  }, [isInitialized, activityLog]);

  // ✅ جلب لوحة متصدرين حقيقية من قاعدة البيانات
  useEffect(() => {
    if (!showLeaderboard) return;
    setIsLoadingLeaderboard(true);
    supabase
      .from("profiles")
      .select("id, xp, streak")
      .order("xp", { ascending: false })
      .limit(10)
      .then(({ data, error }) => {
        if (!error && data) {
          const entries: LeaderboardEntry[] = data.map((row: any) => ({
            id: row.id,
            name: row.id === authUser?.id ? "أنت" : `لاعب #${String(row.id).slice(0, 4)}`,
            xp: row.xp || 0,
            streak: row.streak || 0,
            isYou: row.id === authUser?.id,
          }));
          if (authUser && !entries.some((e) => e.isYou)) {
            entries.push({ id: authUser.id, name: "أنت", xp, streak, isYou: true });
          }
          entries.sort((a, b) => b.xp - a.xp);
          setLeaderboardEntries(entries);
        }
        setIsLoadingLeaderboard(false);
      });
  }, [showLeaderboard]);

  // 🔔 مراقبة موعد التذكير كل دقيقة
  useEffect(() => {
    if (!notificationsEnabled) return;
    const checkReminder = () => {
      if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
      const now = new Date();
      const currentHM = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
      const todayKey = now.toISOString().slice(0, 10);
      const lastNotified = localStorage.getItem("last_reminder_date");
      const todayEntry = activityLog[todayKey];
      const hasActivityToday = !!todayEntry && (todayEntry.tasksCompleted > 0 || todayEntry.focusMinutes > 0);

      if (currentHM === reminderTime && lastNotified !== todayKey && !hasActivityToday) {
        new Notification("🔥 حافظ على سلسلتك!", {
          body: `لسه ما ذاكرتش النهارده... خلي سلسلة الـ ${streak} يوم ماتنكسرش!`,
          icon: "/favicon.ico",
        });
        localStorage.setItem("last_reminder_date", todayKey);
      }
    };
    checkReminder();
    const interval = setInterval(checkReminder, 60 * 1000);
    return () => clearInterval(interval);
  }, [notificationsEnabled, reminderTime, activityLog, streak]);

  const handleOpenAiAssistant = () => {
    const current = days.find((d) => d.day === currentDayNumber) || days[0];
    if (current) setActiveAiLesson(current);
  };

  /* 📑 كل بند «مودال» في القايمة الجانبية بيوصل هنا.
     ⚠️ الطوارئ مفتاح مش مودال: من القايمة بيتقلب، وبييجي إجباري `true` لما
     المستخدم يدوس عليه وهو في صفحة فرعية (شوف استهلاك النية تحت) — عشان
     «شغّل الطوارئ» ماتتحولش لـ «اقفله» بسبب تنقّل بينهم. */
  const handleNavSignal = (signal: NavSignal, opts?: { force?: boolean }) => {
    switch (signal) {
      case "ai":
        handleOpenAiAssistant();
        break;
      case "settings":
        setIsMenuOpen(true);
        break;
      case "emergency":
        setIsEmergencyMode((v) => (opts?.force ? true : !v));
        break;
      case "parentReport":
        setShowParentReport(true);
        break;
      case "leaderboard":
        setShowLeaderboard(true);
        break;
      case "xpShop":
        setShowShopModal(true);
        break;
    }
  };

  /* 📑 النية المحفوظة: بند القايمة اللي مالوش صفحة (مودال أو قسم) بيتضغط
     من صفحة فرعية، فبيكتب نيته في sessionStorage وينقل هنا. الإفكت ده هو
     اللي بينفّذها — من غيره الضغط كان بينقل للداشبورد وبس.
     بيستنى `authUser` لأن مودالات زي التقرير والمتصدرين مالهاش معنى قبل
     ما البيانات تحمّل. */
  const intentDoneRef = useRef(false);
  useEffect(() => {
    if (!authUser || intentDoneRef.current) return;
    intentDoneRef.current = true;

    const intent = takeNavIntent();
    if (!intent) return;

    if (intent.kind === "modal") {
      handleNavSignal(intent.target, { force: true });
      return;
    }
    // القسم لازم يكون اتركّب قبل ما نسكرول له
    requestAnimationFrame(() => {
      document.getElementById(intent.target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [authUser]);

  async function handleToggleNotifications(): Promise<void> {
    if (typeof window === "undefined" || !("Notification" in window)) {
      alert("😅 المتصفح ده لا يدعم التنبيهات.");
      return;
    }
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      return;
    }
    const permission = await Notification.requestPermission();
    setNotifPermission(permission);
    if (permission === "granted") {
      setNotificationsEnabled(true);
      new Notification("🔔 تم تفعيل تذكير الستريك!", { body: `هننبهك الساعة ${reminderTime} لو لسه ما ذاكرتش.` });
    } else {
      alert("محتاجين إذنك لإرسال التنبيهات من إعدادات المتصفح.");
    }
  }

  const handleEnableWebPush = async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      alert("😅 المتصفح ده لا يدعم التنبيهات في الخلفية (Web Push).");
      return;
    }
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      alert("⚠️ الميزة دي لسه محتاجة إعداد من ناحية السيرفر (VAPID key + API route). راجع التعليقات فوق الدالة دي في الكود.");
      return;
    }
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey,
      });
      // الـ user_id بياخده السيرفر من الجلسة، فمش بنبعته من هنا
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription }),
      });
      if (!res.ok) {
        alert("⚠️ مقدرناش نحفظ الاشتراك. تأكد إنك مسجّل دخول وحاول تاني.");
        return;
      }
      alert("🎉 تم تفعيل التنبيهات في الخلفية!");
    } catch (err) {
      console.error("Web Push subscribe failed:", err);
      alert("⚠️ حصل خطأ أثناء تفعيل التنبيهات، حاول تاني.");
    }
  };

  const logActivity = (delta: { focusMinutes?: number; tasksCompleted?: number }) => {
    const todayKey = new Date().toISOString().slice(0, 10);
    setActivityLog((prev) => {
      const existing = prev[todayKey] || { focusMinutes: 0, tasksCompleted: 0 };
      const updated = {
        focusMinutes: Math.max(0, existing.focusMinutes + (delta.focusMinutes || 0)),
        tasksCompleted: Math.max(0, existing.tasksCompleted + (delta.tasksCompleted || 0)),
      };
      return { ...prev, [todayKey]: updated };
    });
  };

  // 🔴 تحديث الخطوة الحالية
  useEffect(() => {
    if (days.length > 0) {
      const lastCompletedIndex = days.filter((d) => d.isCompleted).length;
      setCurrentDayNumber(Math.min(lastCompletedIndex + 1, days.length));
    }
  }, [days]);

  // 🔴 منطق مؤقت البومودورو
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (isPomoRunning && pomoTime > 0) {
      timer = setInterval(() => setPomoTime((prev) => prev - 1), 1000);
    } else if (pomoTime === 0) {
      setIsPomoRunning(false);
      logActivity({ focusMinutes: 25 });
      alert("🎉 انتهت الجلسة! خذ استراحة لمدة 5 دقائق.");
    }
    return () => clearInterval(timer);
  }, [isPomoRunning, pomoTime]);

  const handleSubjectChange = async () => {
    if (!newSubjectInput.trim() || !config || !configId || !authUser || isChangingSubject) return;
    setIsChangingSubject(true);

    const newConfig: StudyConfig = { ...config, subject: newSubjectInput.trim() };

    const { error: updateError } = await supabase.from("study_configs").update({ subject: newConfig.subject }).eq("id", configId);

    if (updateError) {
      alert("⚠️ حصل خطأ أثناء حفظ اسم المادة، حاول تاني.");
      setIsChangingSubject(false);
      return;
    }

    const { error: deleteError } = await supabase.from("study_days").delete().eq("config_id", configId);
    if (deleteError) {
      console.error("Failed to delete old days:", deleteError);
      alert("⚠️ حصل خطأ أثناء مسح أيام المادة القديمة، حاول تاني.");
      setIsChangingSubject(false);
      return;
    }

    const generated = generateDays(newConfig, persona);
    const savedDays = await insertDaysToDb({ userId: authUser.id, cfgId: configId, generatedDays: generated });

    if (savedDays.length > 0 && !savedDays[0].id) {
      alert("⚠️ اتغيّر اسم المادة، لكن حصل خطأ أثناء حفظ أيامها الجديدة. افتح Console (F12) وابعت الخطأ اللي فيه.");
    }

    setConfig(newConfig);
    setDays(savedDays);
    localStorage.setItem("study_config", JSON.stringify(newConfig));
    setShowSubjectModal(false);
    setIsMenuOpen(false);
    setIsChangingSubject(false);
  };

  const changeLessonStyle = (dayNum: number, newStyle: LearningStyle) => {
    setDays((prev) => prev.map((d) => (d.day === dayNum ? { ...d, learningStyle: newStyle } : d)));
  };

  const addPlanStep = async () => {
    if (!authUser || !configId || !config || isAddingPlanStep) return;
    setIsAddingPlanStep(true);
    try {
      const nextDay = Math.max(0, ...days.map((day) => day.day)) + 1;
      const response = await fetch("/api/generate-plan/add-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: config.subject,
          learningStyle: days.at(-1)?.learningStyle || "practical",
          previousTopics: days.slice(-12).map((day) => day.topic).join(" | "),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success || !payload.data) throw new Error(payload?.error || "تعذر إضافة الخطوة.");

      const newDay: StudyDay = {
        day: nextDay,
        title: payload.data.title,
        topic: payload.data.topic,
        description: payload.data.description,
        isCompleted: false,
        xpReward: 100,
        learningStyle: days.at(-1)?.learningStyle || "practical",
      };
      const { data, error } = await supabase.from("study_days").insert({
        config_id: configId, user_id: authUser.id, day_number: newDay.day, title: newDay.title,
        topic: newDay.topic, description: newDay.description, is_completed: false,
        xp_reward: newDay.xpReward, learning_style: newDay.learningStyle,
      }).select().single();
      if (error || !data) throw error || new Error("تعذر حفظ الخطوة.");

      const savedDay = { ...newDay, id: data.id };
      const newDays = [...days, savedDay];
      setDays(newDays);
      const nextConfig = { ...config, daysCount: newDays.length };
      setConfig(nextConfig);
      await supabase.from("study_configs").update({ days_count: newDays.length }).eq("id", configId);
    } catch (error) {
      console.error("addPlanStep failed:", error);
      alert(error instanceof Error ? error.message : "تعذر إضافة الخطوة. حاول مرة أخرى.");
    } finally {
      setIsAddingPlanStep(false);
    }
  };

  const toggleDayCompletion = (dayNumber: number) => {
    if (dayNumber > currentDayNumber && !earlyUnlockedDays.includes(dayNumber)) return;

    setDays((prev) =>
      prev.map((d) => {
        if (d.day === dayNumber) {
          const nextState = !d.isCompleted;
          setXp((prevXp) => Math.max(0, prevXp + (nextState ? d.xpReward : -d.xpReward)));
          if (nextState) setCelebration({ topic: d.topic, xp: d.xpReward });
          logActivity({ tasksCompleted: nextState ? 1 : -1 });
          return { ...d, isCompleted: nextState };
        }
        return d;
      })
    );
  };

  useEffect(() => {
    if (celebration) {
      const timer = setTimeout(() => setCelebration(null), 3800);
      return () => clearTimeout(timer);
    }
  }, [celebration]);

  const handleBuyStreakFreeze = () => {
    if (xp >= 200) {
      setXp((prev) => prev - 200);
      alert("تم شراء تجميد الستريك بنجاح! 🎉 تم خصم 200 XP.");
      setShowShopModal(false);
    } else {
      alert("عذراً، لا تمتلك رصيد كافي من النقاط! 😅");
    }
  };

  const handleShareReport = async () => {
    const text = `📊 تقريري في ${config?.subject || "خطتي"}\nالمستوى: L${level}\nالنقاط: ${xp} XP\nالمهام المنجزة: ${completedCount} من ${days.length}\nالسلسلة: 🔥 ${streak} يوم`;
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ text });
      } catch {
        /* المستخدم لغى المشاركة - تجاهل */
      }
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        alert("تم نسخ التقرير! الصقه في أي مكان للمشاركة 📋");
      } catch {
        alert(text);
      }
    } else {
      alert(text);
    }
  };

  const handleGenerateFlashcards = () => {
    if (!userNote.trim()) return;
    const newCards: Flashcard[] = userNote
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => ({ id: crypto.randomUUID(), text: line, status: "new" }));
    setFlashcards([...newCards, ...flashcards]);
    setUserNote("");
  };

  const updateCardStatus = (id: string, status: "known" | "review") => {
    setFlashcards((prev) => prev.map((card) => (card.id === id ? { ...card, status } : card)));
  };

  // 🖍️ ألوان الثيم بقت في theme-helpers.ts كمصدر واحد. كانت متعرّفة هنا
  // بقيم مختلفة شوية عن اللي في الملف، فكانت باليتّين بيفرقوا عن بعض.
  const themeStyles = THEME_STYLES[theme];

  // ✅ حالة "لسه بيحمّل"
  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper" dir="rtl">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-rule border-t-redpen rounded-full animate-spin mx-auto" />
          <p className="tag justify-center">بيحمّل بياناتك</p>
        </div>
      </div>
    );
  }

  // ✅ حالة الخطأ
  if (loadError || !config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper px-4" dir="rtl">
        <div className="sheet-card sheet-card-live p-6 max-w-sm w-full space-y-3">
          <p className="eyebrow eyebrow-flush">خطأ</p>
          <h1 className="h3">ما قدرناش نحمّل بياناتك</h1>
          <p className="text-xs text-ink-soft leading-relaxed">
            {loadError || "افتح Console (F12) وابعتلي رسالة الخطأ."}
          </p>
          <button onClick={() => window.location.reload()} className="btn btn-marker btn-block text-sm">
            حمّل الصفحة تاني
          </button>
        </div>
      </div>
    );
  }

  // 👤 بيانات العرض. كارت الحساب في القايمة الجانبية بيشتقّها بنفسه من نفس
  // الدالة، فالاسم اللي في الترحيب هو نفس الاسم اللي في الكارت — مصدر واحد.
  const displayName = railAccountFromUser(authUser)?.displayName ?? "مستخدم";

  // ═══ سياق المساعد الشخصي الحقيقي — نفس حالة هذه الصفحة بالضبط (Phase 2A) ═══
  // أي رقم بيوصل للمساعد مصدره حالة الداشبورد دي: profile/study_days/activity/
  // planner_goals — ومفيش أي رقم ملفَّق. لو مفيش خطة أو نشاط، السياق بيسقط
  // الأقسام الفاضية مش بيعرض أرقام وهمية.
  const personalAssistantContext = buildPersonalContext({
    userName: displayName,
    role: persona,
    studentLevel,
    subject: config?.subject ?? null,
    streak,
    xp,
    days,
    pendingGoals,
    activityLog,
  });

  const uiText = getUiText(config.category, persona);
  const completedCount = days.filter((d) => d.isCompleted).length;
  const overallProgress = days.length > 0 ? Math.round((completedCount / days.length) * 100) : 0;

  // سطر تحت الاسم في الترويسة: مكانك في الخطة.
  // ⚠️ الفاصل كلمة "من" مش شرطة مايلة، والأرقام عربية-هندية —
  // شظية زي "3 / 14" جوه RTL المتصفح بيقلبها فتطلع "14 / 3". الحل
  // المعتاد كلاس .ltr-num، بس ده prop نصي مش JSX فمافيش مكان لـ span،
  // فالكلمات العربية هي اللي بتعزل الأرقام هنا.
  const headerSubtitle =
    days.length > 0
      ? `${uiText.stepPrefix} ${currentDayNumber.toLocaleString("ar-EG")} من ${days.length.toLocaleString("ar-EG")} في ${config.subject}`
      : `خطتك في ${config.subject} جاهزة تبدأ`;

  const chapters = Array.from({ length: Math.ceil(days.length / CHAPTER_SIZE) }, (_, i) => {
    const chapterDays = days.slice(i * CHAPTER_SIZE, i * CHAPTER_SIZE + CHAPTER_SIZE);
    return {
      chapterNumber: i + 1,
      isComplete: chapterDays.length > 0 && chapterDays.every((d) => d.isCompleted),
      topics: chapterDays.map((d) => d.topic),
    };
  });

  // ✅ بناء قائمة مهام اليوم لكارت "ماجيك" (AI Study Coach)
  const currentTaskForCoach = days.find((d) => d.day === currentDayNumber);
  const reviewFlashcardsCount = flashcards.filter((c) => c.status === "review").length;

  const coachTasks: CoachTask[] = [];
  if (currentTaskForCoach && !currentTaskForCoach.isCompleted) {
    coachTasks.push({
      id: `lesson-${currentTaskForCoach.day}`,
      label: `${uiText.stepPrefix} ${currentTaskForCoach.day}: ${currentTaskForCoach.topic}`,
      icon: "📘",
    });
  }
  if (reviewFlashcardsCount > 0) {
    coachTasks.push({ id: "flashcards-review", label: `مراجعة ${reviewFlashcardsCount} بطاقة محتاجة تركيز`, icon: "🔁" });
  }

  const nextLockedDay = currentDayNumber + 1;
  const canUnlockNextDayEarly = nextLockedDay <= days.length && !earlyUnlockedDays.includes(nextLockedDay);

  const handleUnlockNextDayEarly = () => {
    if (!canUnlockNextDayEarly) return;
    if (xp < 150) {
      alert("عذراً، محتاج 150 XP على الأقل عشان تفتح اليوم ده بدري! 😅");
      return;
    }
    setXp((prev) => prev - 150);
    setEarlyUnlockedDays((prev) => [...prev, nextLockedDay]);
    alert(`تم فتح ${uiText.stepPrefix} ${nextLockedDay} بدري! 🎉 تقدر دلوقتي تشوفه وتفتحه.`);
    setShowShopModal(false);
  };

  const sortedActivityDates = Object.keys(activityLog).sort();
  const lastActiveDateKey = sortedActivityDates.length > 0 ? sortedActivityDates[sortedActivityDates.length - 1] : null;
  const daysSinceLastActivity = lastActiveDateKey
    ? Math.floor((new Date(new Date().toISOString().slice(0, 10)).getTime() - new Date(lastActiveDateKey).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const showLagWarning = daysSinceLastActivity !== null && daysSinceLastActivity >= 2 && overallProgress < 100;

  const ARABIC_WEEKDAYS = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

  const weeklyChartData = Array.from({ length: 7 }, (_, idx) => {
    const daysAgo = 6 - idx;
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const key = date.toISOString().slice(0, 10);
    const entry = activityLog[key];
    return { label: ARABIC_WEEKDAYS[date.getDay()], minutes: entry?.focusMinutes || 0, tasks: entry?.tasksCompleted || 0 };
  });

  const monthlyChartData = Array.from({ length: 4 }, (_, idx) => {
    const weeksAgo = 3 - idx;
    let minutes = 0;
    let tasks = 0;
    for (let d = 0; d < 7; d++) {
      const daysAgo = weeksAgo * 7 + d;
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      const key = date.toISOString().slice(0, 10);
      const entry = activityLog[key];
      if (entry) {
        minutes += entry.focusMinutes;
        tasks += entry.tasksCompleted;
      }
    }
    return { label: weeksAgo === 0 ? "هذا الأسبوع" : `قبل ${weeksAgo} أسبوع`, minutes, tasks };
  });

  const activeChartData = analyticsRange === "weekly" ? weeklyChartData : monthlyChartData;
  const weeklyFocusMinutesTotal = weeklyChartData.reduce((sum, d) => sum + d.minutes, 0);
  const weeklyTasksTotal = weeklyChartData.reduce((sum, d) => sum + d.tasks, 0);
  const weeklyFocusHoursLabel = `${Math.floor(weeklyFocusMinutesTotal / 60)}س ${weeklyFocusMinutesTotal % 60}د`;

  // الأسبوع اللي قبل الأسبوع الجاري (أيام ٧ لـ ١٣) — عشان كارت التركيز
  // يعرض فرق حقيقي بدل سهم مكتوب على الفاضي.
  const prevWeekFocusMinutes = Array.from({ length: 7 }, (_, idx) => {
    const date = new Date();
    date.setDate(date.getDate() - (13 - idx));
    return activityLog[date.toISOString().slice(0, 10)]?.focusMinutes || 0;
  }).reduce((sum, m) => sum + m, 0);

  const heatmapCells = Array.from({ length: 70 }, (_, idx) => {
    const daysAgo = 69 - idx;
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const key = date.toISOString().slice(0, 10);
    const entry = activityLog[key];
    const score = (entry?.focusMinutes || 0) + (entry?.tasksCompleted || 0) * 15;
    let level = 0;
    if (score > 0) level = 1;
    if (score >= 20) level = 2;
    if (score >= 45) level = 3;
    if (score >= 70) level = 4;
    return { key, level, minutes: entry?.focusMinutes || 0, tasks: entry?.tasksCompleted || 0, dateLabel: date.toLocaleDateString("ar-EG", { day: "numeric", month: "short" }) };
  });

  const heatmapColors = HEATMAP_COLORS[theme];

  return (
    <div
      className="min-h-screen p-4 sm:p-6 md:p-10 lg:pe-[16.5rem] xl:pe-[18.5rem] font-sans bg-paper text-ink relative pb-24"
      dir="rtl"
    >
      {/* 🎧 عنصر الـ <audio> والمشغّل العائم بقوا في `AudioProvider` جوه
          app/layout.tsx — عشان الصوت يفضل شغّال لما تنتقل لأي صفحة. */}

      {/* 📑 فهرس الأقسام: شريط ثابت يمين على الشاشات الكبيرة، وشريط أفقي
          بيتسكرول فوق المحتوى في الموبايل. الحشو الإضافي فوق (lg:pe) هو
          اللي بيمنع المحتوى من إنه يدخل تحت الشريط الثابت. */}
      <NavRail
        themeStyles={themeStyles}
        // 🗓️ ٨ أغسطس: الشريط العلوي اتشال، فكل أدواته بتوصل من هنا.
        // أي إشارة جديدة تتزوّد في nav-config.ts والـ switch ده يتوسّع.
        onSignal={handleNavSignal}
        aiReady={days.length > 0}
        motivation={{ level, streak }}
        account={railAccountFromUser(authUser)}
        emergencyOn={isEmergencyMode}
        audioOn={isPlayingAudio}
      />

      <div className="max-w-6xl mx-auto space-y-8">
        {/* ═══ الهيرو الجديد: ترحيب بالاسم الحقيقي + سلسلة/مستوى/تقدّم +
                إجراءات سريعة (أكمل التعلّم · المساعد الذكي · العبادات · المتجر).
                كل الأرقام من نفس حالة الصفحة اللي بتغذّي باقي الأقسام. ═══ */}
        <HeroCard
          displayName={displayName}
          subtitle={headerSubtitle}
          level={level}
          streak={streak}
          planProgressPct={overallProgress}
          completedSteps={completedCount}
          totalSteps={days.length}
          onContinue={() => {
            const el = document.getElementById(`day-${currentDayNumber}`);
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
          onOpenAiAssistant={handleOpenAiAssistant}
        />

        {/* ═══ المساعد الشخصي ─ بين الهيرو وكروت الأرقام ═══ */}
        <PersonalAssistant
                  context={personalAssistantContext}
                  onContinue={() => {
                    const el = document.getElementById(`day-${currentDayNumber}`);
                    el?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                />


        {/* ═══ AI Tools Hub تم نقلها لصفحة /dashboard/agents — لا تعرض هنا ═══ */}

        {/* ═══ كروت الأرقام: XP · السلسلة · خطوات مكتملة · تركيز الأسبوع
                — عدّ من صفر مرة واحدة بخط المونو ═══ */}
        <StatCards
          xp={xp}
          streak={streak}
          completedSteps={completedCount}
          weeklyFocusMinutes={weeklyFocusMinutesTotal}
        />

        {/* ═══ الخطوة الحالية: حلقة بنسبة الخطة الحقيقية + زر ديناميكي
                (ابدأ / تابع / راجع) حسب حالة اليوم الفعلية ═══ */}
        <CurrentStepCard
          currentDay={currentTaskForCoach ?? null}
          completedSteps={completedCount}
          totalSteps={days.length}
          isCurrent={
            currentTaskForCoach ? currentTaskForCoach.day === currentDayNumber : false
          }
          subjectName={config.subject}
          onContinue={() => {
            const el = document.getElementById(`day-${currentDayNumber}`);
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        />

        <StatsSection
          level={level}
          xp={xp}
          currentLevelProgress={currentLevelProgress}
          xpRemaining={xpRemaining}
          streak={streak}
          uiText={uiText}
          themeStyles={themeStyles}
          displayName={displayName}
          subtitle={headerSubtitle}
          isEmergencyMode={isEmergencyMode}
        />

        {/* 🚨 خطة الامتحان القريب.
            مكانها فوق عن قصد: اللي عنده امتحان بعد ٣ أيام لازم يشوف
            المطلوب منه النهاردة قبل أي إحصائية. الكارت بيخفي نفسه
            لوحده لو مفيش خطة شغالة. */}
        {authUser && (
          // ⚠️ الـ key فيه examPlanKey: الكارت بيجيب الخطة مرة واحدة عند
          // التركيب، فلو المستخدم عمل خطة من الشات الكارت كان هيفضل فاضي
          // لحد ريفريش. تغيير الـ key بيعيد تركيبه فبيجيب الخطة الجديدة.
          <ExamPlanCard
            key={examPlanKey}
            userId={authUser.id}
            themeStyles={themeStyles}
          />
        )}

        <KpiSection
          completedCount={completedCount}
          totalDays={days.length}
          weeklyTasks={weeklyTasksTotal}
          xp={xp}
          level={level}
          xpRemaining={xpRemaining}
          weeklyFocusMinutes={weeklyFocusMinutesTotal}
          prevWeekFocusMinutes={prevWeekFocusMinutes}
          streak={streak}
          daysSinceLastActivity={daysSinceLastActivity}
          themeStyles={themeStyles}
        />

        <HeroSection
          displayName={displayName}
          coachTasks={coachTasks}
          days={days}
          currentDayNumber={currentDayNumber}
          completedCount={completedCount}
          themeStyles={themeStyles}
          uiText={uiText}
        />

        <StudySections
          config={config}
          uiText={uiText}
          themeStyles={themeStyles}
          isEmergencyMode={isEmergencyMode}
          showPomodoro={showPomodoro}
          onTogglePomodoro={() => setShowPomodoro(!showPomodoro)}
          pomoTime={pomoTime}
          isPomoRunning={isPomoRunning}
          onTogglePomoRunning={() => setIsPomoRunning(!isPomoRunning)}
          onResetPomo={() => {
            setIsPomoRunning(false);
            setPomoTime(25 * 60);
          }}
          completedCount={completedCount}
          overallProgress={overallProgress}
          showLagWarning={showLagWarning}
          daysSinceLastActivity={daysSinceLastActivity}
          currentDayNumber={currentDayNumber}
          days={days}
          earlyUnlockedDays={earlyUnlockedDays}
          onToggleDayCompletion={toggleDayCompletion}
          onChangeLessonStyle={changeLessonStyle}
          onOpenFullLesson={(id) => router.push(`/lesson/${id}`)}
          onOpenAiLesson={(day) => setActiveAiLesson(day)}
          onAddPlanStep={addPlanStep}
          isAddingPlanStep={isAddingPlanStep}
          chapters={chapters}
          onOpenBossFight={(chapterNumber) => setActiveBossChapter(chapterNumber)}
          userNote={userNote}
          onChangeUserNote={setUserNote}
          onAddNote={handleGenerateFlashcards}
          flashcards={flashcards}
          onUpdateCardStatus={updateCardStatus}
        />

        {/* 📖 القرآن: بعد قايمة الدروس مباشرة عن قصد. «شغّل قرآن وإنت
            بتذاكر» معناها إنك عرفت بتذاكر إيه الأول، فمكانه هنا مش فوق —
            فوق كان هيزحزح الدروس عن الهيرو (وده قرار مقصود قديم)، وتحت
            كان هيفضل مدفون زي ما كان جوه الدرج بالظبط.

            الكارت مختصر عن قصد: آخر سورة + ٦ سور + رابط للمكتبة الكاملة.
            الصوت نفسه عايش في مزوّد الـ root layout، فالسورة اللي تبدأ
            من هنا بتكمّل معاك في أي صفحة. */}
        <Link href="/worship" className="block mb-6">
          <button
            type="button"
            aria-label="عباداتي — Worship Center"
            className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl bg-gradient-to-l from-[#2DD4BF]/10 to-[#7C5CFF]/10 border border-[#2DD4BF]/20 hover:border-[#7C5CFF]/40 transition-colors text-right"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#2DD4BF]/15 text-[#2DD4BF] text-xl">🕌</span>
            <div className="min-w-0">
              <h3 className="font-bold text-white leading-snug">عباداتي — Worship Center</h3>
              <p className="text-sm text-[#B69CFF]">مواقيت الصلاة · الأذكار · القرآن · التسبيح</p>
            </div>
            <ArrowLeft size={18} className="mr-auto text-[#9AA0C0] shrink-0" aria-hidden />
          </button>
        </Link>

        <QuranSection
          themeStyles={themeStyles}
          onOpenLibrary={() => {
            setSettingsFocus("sound");
            setIsMenuOpen(true);
          }}
        />

        {/* 📊 طبقة المراجعة: بعد قايمة الدروس عن قصد، مش جنب الهيرو —
            الهيرو لازم يفضل هو أول حاجة تشوفها وبعده الدروس مباشرة.
            الكارتين دول بيتقروا كـ "إنت عملت إيه الأسبوع ده" و "إيه
            الجاي"، وبعدهم قسم التحليلات بيدخل في التفاصيل. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <WeeklyProgress data={weeklyChartData} themeStyles={themeStyles} />
          {/* 🐣 الرفيق تحت الإنجازات في نفس العمود مش خانة تالتة في
              الشبكة: الشبكة عمودين، والتالت كان هيسيب فراغ جنبه على
              الشاشة الكبيرة. والعمود ده أقصر من الرسم البياني أصلاً. */}
          <div className="flex flex-col gap-6">
            <AchievementsStrip
              streak={streak}
              completedCount={completedCount}
              level={level}
              badgeCount={badgeCount}
              themeStyles={themeStyles}
            />

            {companion.hidden ? (
              <button
                type="button"
                onClick={companion.show}
                className="mono text-ink-soft hover:text-ink border border-dashed border-rule rounded-[var(--r-sm)] py-2.5 hover:bg-paper-3 transition"
              >
                رجّع رفيقك
              </button>
            ) : (
              <StudyPet
                level={level}
                xp={xp}
                levelProgressPct={currentLevelProgress}
                streak={streak}
                daysSinceLastActivity={daysSinceLastActivity}
                theme={theme}
                stages={companion.stages}
                companionName={companion.name}
                onDismiss={companion.hide}
              />
            )}
          </div>
        </div>

        <AnalyticsSection
          analyticsRange={analyticsRange}
          onChangeRange={setAnalyticsRange}
          weeklyFocusHoursLabel={weeklyFocusHoursLabel}
          overallProgress={overallProgress}
          streak={streak}
          activeChartData={activeChartData}
          theme={theme}
          heatmapCells={heatmapCells}
          heatmapColors={heatmapColors}
        />

        {/* 👥 دعوة الجروب في آخر الصفحة: اللي وصل لحد هنا شاف الموقع
            كله وبقى مؤهّل يدخل. البانر بيخفي نفسه لو مفيش لينك مظبوط. */}
        <CommunityInvite variant="banner" />
      </div>

      {/* زرار ماجيك العايم: نفس أخضر المونوجرام اللي في كارت المدرّب
          وترويسة المحادثة، عشان يتقرا كإنه نفس الشخصية مش زرار تاني */}
      {!activeAiLesson && days.length > 0 && (
        <button
          onClick={handleOpenAiAssistant}
          className={`fixed left-6 z-40 bg-emerald-500 hover:opacity-90 text-onmarker text-sm font-bold px-4 py-3 rounded-[var(--r-sm)] shadow-[0_18px_44px_-18px_var(--shade-lift)] flex items-center gap-2.5 transition active:scale-95 ${
            activeTrack ? "bottom-24" : "bottom-6"
          }`}
        >
          <span className="font-display font-extrabold text-lg leading-none">{PERSONA_NAME.charAt(0)}</span>
          <span>اسأل {PERSONA_NAME}</span>
        </button>
      )}

      {/* لحظة الإنجاز = ختم المدرّس على الورقة. الختم هو الحاجة الصفرا
          الوحيدة هنا، والنقاط مكتوبة جوّاه زي درجة، فبدل ٣ عناصر بقى واحد. */}
      {celebration && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/45 backdrop-blur-sm p-4"
          onClick={() => setCelebration(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="sheet-card sheet-card-live card-lift p-8 w-full max-w-sm text-center space-y-4"
          >
            <div className="stamp w-20 h-20 mx-auto bg-marker text-onmarker" aria-hidden>
              <span className="font-display font-extrabold text-2xl leading-none">تم</span>
              <span className="mono ltr-num text-[9px] opacity-75">+{celebration.xp} XP</span>
            </div>

            <div>
              <p className="eyebrow eyebrow-flush mb-1.5 justify-center">إنجاز</p>
              <h3 className="h3">خلّصت {celebration.topic}</h3>
            </div>

            <p className="text-xs text-ink-soft leading-relaxed">
              كل خطوة زي دي بتقرّبك من هدفك. كمّل بنفس الإيقاع.
            </p>

            <button onClick={() => setCelebration(null)} className="btn btn-quiet btn-block text-sm">
              متابعة
            </button>
          </div>
        </div>
      )}

      <Sidebar
        isMenuOpen={isMenuOpen}
        setIsMenuOpen={setIsMenuOpen}
        showSubjectModal={showSubjectModal}
        setShowSubjectModal={setShowSubjectModal}
        newSubjectInput={newSubjectInput}
        setNewSubjectInput={setNewSubjectInput}
        isChangingSubject={isChangingSubject}
        handleSubjectChange={handleSubjectChange}
        theme={theme}
        setTheme={setTheme}
        themeStyles={themeStyles}
        notificationsEnabled={notificationsEnabled}
        handleToggleNotifications={handleToggleNotifications}
        reminderTime={reminderTime}
        setReminderTime={setReminderTime}
        notifPermission={notifPermission}
        handleEnableWebPush={handleEnableWebPush}
        onNavigateHome={() => router.push("/")}
        focusSection={settingsFocus}
      />

      <LeaderboardModal
        isOpen={showLeaderboard}
        onClose={() => setShowLeaderboard(false)}
        isLoadingLeaderboard={isLoadingLeaderboard}
        leaderboardEntries={leaderboardEntries}
        themeStyles={themeStyles}
      />

      <ShopModal
        isOpen={showShopModal}
        onClose={() => setShowShopModal(false)}
        xp={xp}
        onBuyStreakFreeze={handleBuyStreakFreeze}
        canUnlockNextDayEarly={canUnlockNextDayEarly}
        nextLockedDay={nextLockedDay}
        uiText={uiText}
        onUnlockNextDayEarly={handleUnlockNextDayEarly}
      />

      <ParentReportModal
        isOpen={showParentReport}
        onClose={() => setShowParentReport(false)}
        config={config}
        level={level}
        xp={xp}
        days={days}
        themeStyles={themeStyles}
        onShareReport={handleShareReport}
      />

      <WeeklySummaryModal
        isOpen={showWeeklySummary}
        onClose={() => setShowWeeklySummary(false)}
        weeklySummaryData={weeklySummaryData}
        themeStyles={themeStyles}
      />

      <AiChatModal
        activeAiLesson={activeAiLesson}
        onClose={() => setActiveAiLesson(null)}
        onSwitchLesson={(day: React.SetStateAction<StudyDay | null>) => setActiveAiLesson(day)}
        days={days}
        configId={configId}
        config={config}
        themeStyles={themeStyles}
        onExamPlanSaved={() => setExamPlanKey((k) => k + 1)}
      />

      {activeBossChapter !== null && (
        <BossFight
          subject={config.subject}
          topics={chapters.find((c) => c.chapterNumber === activeBossChapter)!.topics}
          chapterNumber={activeBossChapter}
          configId={configId!}
          theme={theme}
          onClose={() => setActiveBossChapter(null)}
          onWin={(xpEarned) => {
            setXp((prev) => prev + xpEarned);
            logActivity({ tasksCompleted: 1 });
            // BossFight هو اللي بيعمل insert في جدول badges، فبنزوّد العدد
            // محلياً بدل ما نستعلم تاني — الشريط يتحرك في نفس اللحظة.
            setBadgeCount((prev) => prev + 1);
          }}
        />
      )}

      {/* 😊 سؤال الرأي.
          ⚠️ enabled بيتقفل لما يكون فيه مودال مفتوح — الودجت fixed
          فكانت هتقعد فوق طبقة المودال المعتمة وتبان زي إنها بتقاطعه.
          وكمان: زرار «اسأل ماجيك» العايم على يسار تحت، والودجت على
          نفس الناحية — فمقفولة كمان وقت ما الزرار ظاهر ومفيش مودال؟
          لأ: الودجت start (يمين في RTL) والزرار left، فمافيش تصادم. */}
      <FeedbackWidget
        page="dashboard"
        featureLabel="الداشبورد"
        enabled={
          !activeAiLesson &&
          !celebration &&
          activeBossChapter === null &&
          !showLeaderboard &&
          !showShopModal &&
          !showParentReport &&
          !showWeeklySummary &&
          !isMenuOpen
        }
      />
    </div>
  );
}