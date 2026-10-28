"use client";
/* eslint-disable react-hooks/exhaustive-deps -- TODO: stable deps */
/* eslint-disable react-hooks/set-state-in-effect -- Syncing with external system is intentional */
/* eslint-disable @typescript-eslint/no-explicit-any -- TODO: proper typing requires architecture change, tracked separately */

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import MagicWheelDashboard from "@/components/MagicWheelDashboard";
import { TodayPlanCard, DailyMissionsCard, WeeklyProgressCard, CompanionStatusCard } from "@/components/DashboardExtraCards";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { CoachTask } from "@/components/AIStudyCoach";
import { BossFight } from "@/components/BossFight";
import { PERSONA_NAME } from "@/lib/persona";
import { awardCoins } from "@/lib/shop/shop-data";
import { levelFromXp, XP_PER_LEVEL } from "@/lib/shop/economy";

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

import { useProfileState, ProfilePersona, defaultProfileForUser } from "@/lib/user-profiles";
import { HeroSection } from "./components/HeroSection";
import MagIdCard from "@/components/MagIdCard";
import SubscriptionQuotaCard from "./components/SubscriptionQuotaCard";
import { StudySections } from "./components/StudySections";
import { AnalyticsSection } from "./components/AnalyticsSection";
import { useAudio } from "@/components/audio/AudioProvider";
import { SettingsDrawer, type SettingsSectionId } from "./components/SettingsDrawer";
import { QuranSection } from "./components/QuranSection";
import { NavRail } from "./components/NavRail";
import { railAccountFromUser, takeNavIntent, type NavSignal } from "./components/nav-config";
import { WeeklyProgress } from "./components/WeeklyProgress";
import { AchievementsStrip } from "./components/AchievementsStrip";
import { THEME_STYLES, HEATMAP_COLORS } from "./components/theme-helpers";
// ًںژ´ ط¥ط¹ط§ط¯ط© طھطµظ…ظٹظ… ط§ظ„ط¯ط§ط´ط¨ظˆط±ط¯ (ظ†ط¸ط§ظ… ظ…ظˆط­ظ‘ط¯): ظ‡ظٹط±ظˆ + ظƒط±ظˆطھ ط£ط±ظ‚ط§ظ… + ط§ظ„ط®ط·ظˆط© ط§ظ„ط­ط§ظ„ظٹط©.
// ظ†ظپط³ ط­ط§ظ„ط© ط§ظ„طµظپط­ط© ط§ظ„ط­ظ‚ظٹظ‚ظٹط© (profiles / study_days / activity_log) ط¨ط¯ظˆظ† ط£ظٹ ظ…طµط¯ط± ط¨ظٹط§ظ†ط§طھ ط¬ط¯ظٹط¯.
import { HeroCard } from "./components/HeroCard";
import { StatCards } from "./components/StatCards";
import { UserQrCard } from "./components/UserQrCard";
import { CurrentStepCard } from "./components/CurrentStepCard";
import { PersonalAssistant } from "./components/PersonalAssistant";
import { PlanQuotaCard } from "@/components/PlanQuotaCard";
import { EconomyStrip } from "./components/EconomyVisibility";
import { DailyMicroChallenge } from "@/components/DailyMicroChallenge";
import { ContextualNotification } from "@/components/ContextualNotification";
import { LightSocialComparison } from "@/components/LightSocialComparison";
// ًں§© ط³ظٹط§ظ‚ ط§ظ„ظ…ط³ط§ط¹ط¯ ط§ظ„ط´ط®طµظٹ (Phase 2A) â€” ط¨ظٹظپط±ظ‘ط؛ ط­ط§ظ„ط© ط§ظ„ط¯ط§ط´ط¨ظˆط±ط¯ ط§ظ„ط­ظ‚ظٹظ‚ظٹط© ظپظٹ ط³ظٹط§ظ‚ ظˆط§ط­ط¯.
import { buildPersonalContext, type PendingGoalRow } from "@/lib/personal-assistant/context";
// Preview branch: conservative control center extension (stats + navigation + focus)
import { DashboardStats } from "./components/DashboardStats";
import { QuickNavigation, buildQuickNavItems } from "./components/QuickNavigation";
import { TodayFocus } from "./components/TodayFocus";
// ًںژ¯ First Session â€” "ظ…ط§ط°ط§ طھط±ظٹط¯ ط£ظ† طھظپط¹ظ„ ط§ظ„ظٹظˆظ…طں" (Control Center entry point)
import { FirstSession } from "./components/FirstSession";
// ًں“‌ ظ‚ط§ظ…ظˆط³ ظ†طµظˆطµ ط§ظ„ظˆط§ط¬ظ‡ط© ط¨ظ‚ظ‰ ظپظٹ ظ…ظƒط§ظ† ظˆط§ط­ط¯: lib/user-persona.ts
// ط§ظ„ط¥ظٹظ…ظˆط¬ظٹ ظ…طھط´ط§ظ„ ظ…ظ† ط§ظ„ظ†طµظˆطµ ط¯ظٹ: sectionTitle ط¨ظ‚ظ‰ ظ„ط§ظپطھط© ظ…ظˆظ†ظˆط³ط¨ظٹط³ ظپظˆظ‚
// ط§ط³ظ… ط§ظ„ظ…ط§ط¯ط©طŒ ظˆ aiDiscussBtn ط¨ظ‚ظ‰ ط²ط±ط§ط± ظ‡ط§ط¯ظٹ ط¬ظ†ط¨ ط²ط±ط§ط± ط§ظ„ط¯ط±ط³.
import { DEFAULT_PERSONA, getUiText, isPersona } from "@/lib/user-persona";
import type { Persona } from "@/lib/user-persona";
import { LeaderboardModal } from "./components/Models/LeaderboardModal";
import {  ShopModal } from "./components/Models/ShopModal";
import {  ParentReportModal,  } from "./components/Models/ParentReportModal";
import {  WeeklySummaryModal } from "./components/Models/WeeklySummaryModal";
// ًںڑ¨ ط®ط·ط© ط§ظ„ط·ظˆط§ط±ط¦ + ط§ظ„ط±ط£ظٹ + ط§ظ„ط¬ط±ظˆط¨ â€” ظƒظˆظ…ط¨ظˆظ†ظ†طھط§طھ ط¹ط§ظ…ط© ط¨ط±ظ‡ ظ…ط¬ظ„ط¯ ط§ظ„ط¯ط§ط´ط¨ظˆط±ط¯
import { ExamPlanCard } from "@/components/ExamPlanCard";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { CommunityInvite } from "@/components/CommunityInvite";
// ًںگ£ ط§ظ„ط±ظپظٹظ‚: ط§ظ„ظƒظ…ط¨ظˆظ†ظ†طھ ظ…ظˆط¬ظˆط¯ ظ…ظ† ط§ظ„ط£ظˆظ„طŒ ظˆط§ظ„ظ…طھط¬ط± ط¨ظٹط؛ظٹظ‘ط± ط¥ظٹظ…ظˆط¬ظٹظ‡ ط¨ط³
import { StudyPet } from "@/components/StudyPet";

import { useEquippedCompanion } from "@/lib/shop/use-companion";
import { fetchCourses } from "@/lib/pages-data";
import { getAvailableSubjects, getEducationContext } from "@/lib/education/context";
import { PrimaryDashboard } from "@/components/dashboard/primary/PrimaryDashboard";
import { PrimaryErrorBoundary } from "@/components/dashboard/primary/PrimaryErrorBoundary";
import { PreparatoryDashboard } from "@/components/dashboard/preparatory/PreparatoryDashboard";
import { SecondaryDashboard } from "@/components/dashboard/secondary/SecondaryDashboard";
import { BaccalaureateDashboard } from "@/components/dashboard/baccalaureate/BaccalaureateDashboard";
import { UniversityDashboard } from "@/components/dashboard/university/UniversityDashboard";
import { isPrimaryExperience } from "@/lib/education/experience";

// âڑ”ï¸ڈ طھظ‚ط³ظٹظ… ط§ظ„ط£ظٹط§ظ… ظ„ظپطµظˆظ„ (Chapters) ظƒظ„ 5 ط£ظٹط§ظ… - ظٹط´ط؛ظ‘ظ„ ط²ط±ط§ط± Boss Fight ط¨ط¹ط¯ ظƒظ„ ظپطµظ„ ظ…ظƒطھظ…ظ„
// âœ… ظ…ظ„ط­ظˆط¸ط©: ظ†ظپط³ ط§ظ„ظ‚ظٹظ…ط© ط¯ظٹ ظ…طھط¹ط±ظ‘ظپط© ط¬ظˆظ‡ StudySections.tsx ظƒظ…ط§ظ† (ط¨ظٹط³طھط®ط¯ظ…ظ‡ط§ ظپظٹ ط¹ط±ط¶ ط²ط±ط§ط± ط§ظ„ط¨ظˆط³) -
// ظ„ظˆ ط؛ظٹظ‘ط±طھ ط§ظ„ط±ظ‚ظ… ظ‡ظ†ط§ ظ„ط§ط²ظ… طھط؛ظٹظ‘ط±ظ‡ ظ‡ظ†ط§ظƒ ظƒظ…ط§ظ† ط¹ط´ط§ظ† ط§ظ„ط§طھظ†ظٹظ† ظٹظپط¶ظ„ظˆط§ ظ…طھط²ط§ظ…ظ†ظٹظ†.
const CHAPTER_SIZE = 5;

export default function DashboardPage() {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  // Redirect unauthenticated users to login â€” prevents empty dashboard
  const [checkedAuth, setCheckedAuth] = useState(false);
  useEffect(() => {
    const check = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/login?next=/dashboard");
        }
      } catch {}
      setCheckedAuth(true);
    };
    check();
  }, [supabase, router]);
  const [eduSubjects, setEduSubjects] = useState<any[]>([]);
  const [eduLoading, setEduLoading] = useState(false);
  const [eduError, setEduError] = useState<string|null>(null);
  const [eduContext, setEduContext] = useState<any>(null);
  const [primaryStageCode, setPrimaryStageCode] = useState<string | null>(null);
  const [primaryGradeName, setPrimaryGradeName] = useState<string | null>(null);
  const [trackName, setTrackName] = useState<string | null>(null);
  const [facultyName, setFacultyName] = useState<string | null>(null);
  const [departmentName, setDepartmentName] = useState<string | null>(null);

  // EPIC 1 â€” Multi-profile integration (max 3/account; 1 Active profile)
  const { profiles, activeProfile, switchActiveProfile, addProfile, removeProfile } = useProfileState();
  const activePersona = activeProfile.persona;

  // Fetch stage code + grade/track names for experience resolver
  useEffect(() => {
    if (!supabase) return;
    if (!eduContext?.stageId && !eduContext?.universityId) { setPrimaryStageCode(null); setPrimaryGradeName(null); setTrackName(null); setFacultyName(null); setDepartmentName(null); return; }
    void (async () => {
      try {
        if (eduContext.stageId) {
          const { data: stageRow } = await supabase.from("education_stages").select("code").eq("id", eduContext.stageId).maybeSingle();
          setPrimaryStageCode(stageRow?.code ?? null);
        } else if (eduContext.universityId) {
          setPrimaryStageCode("UNIVERSITY");
        }
        if (eduContext.gradeId) {
          const { data: gradeRow } = await supabase.from("education_grades").select("name").eq("id", eduContext.gradeId).maybeSingle();
          setPrimaryGradeName(gradeRow?.name ?? null);
        } else setPrimaryGradeName(null);
        if (eduContext.trackId) {
          const { data: trackRow } = await supabase.from("education_tracks").select("name").eq("id", eduContext.trackId).maybeSingle();
          setTrackName(trackRow?.name ?? null);
        } else setTrackName(null);
        if (eduContext.universityId) {
          if (eduContext.facultyId) {
            const { data: fac } = await supabase.from("university_faculties").select("name").eq("id", eduContext.facultyId).maybeSingle();
            setFacultyName(fac?.name ?? null);
          } else setFacultyName(null);
          if (eduContext.departmentId) {
            const { data: dep } = await supabase.from("university_departments").select("name").eq("id", eduContext.departmentId).maybeSingle();
            setDepartmentName(dep?.name ?? null);
          } else setDepartmentName(null);
        } else {
          setFacultyName(null);
          setDepartmentName(null);
        }
      } catch { setPrimaryStageCode(null); }
    })();
  }, [supabase, eduContext?.stageId, eduContext?.gradeId, eduContext?.trackId, eduContext?.universityId, eduContext?.facultyId, eduContext?.departmentId]);

  useEffect(() => {
    if (!supabase) return;
    void (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: prof } = await supabase.from("profiles").select("persona,university_id,faculty_id,department_id,academic_level_id,semester_id,education_stage_id,education_grade_id,education_track_id,subject").eq("id",user.id).maybeSingle();
        const ctx = getEducationContext(prof || {});
        setEduContext(ctx);
        if (ctx.stageId) {
          setEduLoading(true); setEduError(null);
          const list = await getAvailableSubjects(supabase, ctx);
          setEduSubjects(list);
          setEduLoading(false);
        } else {
          setEduSubjects([]); setEduLoading(false);
        }
      } catch { setEduError("طھط¹ط°ط± طھط­ظ…ظٹظ„ ط§ظ„ظ…ظˆط§ط¯"); setEduLoading(false); }
    })();
  }, [supabase]);


  // 1. ط§ظ„ط¨ظٹط§ظ†ط§طھ ط§ظ„ط£ط³ط§ط³ظٹط© ظˆط§ظ„ظ…ط³طھط®ط¯ظ…
  const [config, setConfig] = useState<StudyConfig | null>(null);
  const [configId, setConfigId] = useState<string | null>(null);
  const [days, setDays] = useState<StudyDay[]>([]);
  const [currentDayNumber, setCurrentDayNumber] = useState(1);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  /** ط¨ظٹط²ظٹط¯ ظ„ظ…ط§ ط®ط·ط© ط§ظ…طھط­ط§ظ† طھطھط­ظپط¸ ظ…ظ† ط§ظ„ط´ط§طھ â€” ط¨ظٹط¹ظٹط¯ طھط±ظƒظٹط¨ ظƒط§ط±طھ ط§ظ„ط®ط·ط©. */
  const [examPlanKey, setExamPlanKey] = useState(0);

  // 2. ط§ظ„ظ€ Gamification ظˆط§ظ„ط«ظٹظ…
  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(1);
  const [theme, setTheme] = useState<ThemeColor>("amber");

  /* ًںگ£ ط§ظ„ط±ظپظٹظ‚ ط§ظ„ظ…ظ„ط¨ظˆط³ â€” ط§ط³طھط¹ظ„ط§ظ… ظˆط§ط­ط¯طŒ ظˆط£ظٹ ظپط´ظ„ ظ…ط¹ظ†ط§ظ‡ ط§ظ„ط±ظپظٹظ‚ ط§ظ„ط£طµظ„ظٹ.
     ظ…ط´ ط¯ط§ط®ظ„ ظپظٹ `isInitialized` ط¹ظ† ظ‚طµط¯: ط§ظ„طµظپط­ط© ظ…ط§ظ„ظ‡ط§ط´ طھط³طھظ†ظ‰ ط¥ظٹظ…ظˆط¬ظٹ. */
  const companion = useEquippedCompanion(supabase, authUser?.id ?? null);

  const level = levelFromXp(xp);
  const xpForCurrentLevelStart = (level - 1) * XP_PER_LEVEL;
  const xpForNextLevel = level * XP_PER_LEVEL;
  const xpInCurrentLevel = xp - xpForCurrentLevelStart;
  const currentLevelProgress = Math.round((xpInCurrentLevel / XP_PER_LEVEL) * 100);
  const xpRemaining = xpForNextLevel - xp;
  // Phase 4: xpRemaining kept for level calculation (previously displayed in removed Kpi/StatsSection, preserved for future use)
  void xpRemaining;

  // 3. ط§ظ„طµظˆطھ â€” ط§ظ„ط­ط§ظ„ط© ظƒظ„ظ‡ط§ ظپظٹ `AudioProvider` ط¹ظ„ظ‰ ظ…ط³طھظˆظ‰ ط§ظ„ظ…ظˆظ‚ط¹.
  //
  // âڑ ï¸ڈ ظƒط§ظ†طھ ظ‡ظ†ط§ (activeTrack/isPlayingAudio/audioVolume/audioError +
  // ط¹ظ†طµط± <audio>). ط§ظ„ظ…ط´ظƒظ„ط© ط¥ظ† ط§ظ„طھظ†ظ‚ظ‘ظ„ ط¨ظ€ router.push ط¨ظٹط´ظٹظ„ ط§ظ„طµظپط­ط© ط¯ظٹ ظ…ظ†
  // ط§ظ„ط´ط¬ط±ط© ظˆظ…ط¹ط§ظ‡ط§ ط¹ظ†طµط± ط§ظ„طµظˆطھطŒ ظپط§ظ„طµظˆطھ ظƒط§ظ† ط¨ظٹظپطµظ„ ط£ظˆظ„ ظ…ط§ طھط±ظˆط­ آ«ط§ظ„ظƒظˆط±ط³ط§طھآ».
  // ط§ظ„طµظپط­ط© ط¨طھظ‚ط±ط§ ط§ظ„ط­ط§ظ„ط© ط¯ظ„ظˆظ‚طھظٹ ط¨ط³ â€” ط§ظ„طھط´ط؛ظٹظ„ ظ…ط´ ط´ط؛ظ„ظ‡ط§.
  const { activeTrack, isPlaying: isPlayingAudio } = useAudio();

  // 4. ط§ظ„ظ…ظˆط¯ط§ظ„ط§طھ ظˆط§ظ„ظ‚ظˆط§ط¦ظ…
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  /* ًں“– ظ،ظ¢ ط£ط؛ط³ط·ط³: ط§ظ„ط¯ط±ط¬ ط¨ظٹظپطھط­ ط¹ظ„ظ‰ ظ‚ط³ظ… ط¨ط¹ظٹظ†ظ‡. ظƒط§ط±طھ ط§ظ„ظ‚ط±ط¢ظ† ط¨ظٹظ‚ظˆظ„ آ«ظƒظ„ ط§ظ„ط³ظˆط±
     ظˆط§ظ„ظ‚ط±ظ‘ط§ط،آ» â€” ظٹط¹ظ†ظٹ ط§ظپطھط­ ط§ظ„ط¥ط¹ط¯ط§ط¯ط§طھ ط¹ظ„ظ‰ آ«ط§ظ„طµظˆطھآ» ط¹ظ„ظ‰ ط·ظˆظ„طŒ ظ…ط´ ط³ظٹط¨ ط§ظ„ظ…ط³طھط®ط¯ظ…
     ظٹط¯ظˆظ‘ط±. ط¨ظٹطھط±ط¬ط¹ `null` ظ…ط¹ ط§ظ„ظ‚ظپظ„ ط¹ط´ط§ظ† ط§ظ„ظپطھط­ط© ط§ظ„ظ„ظٹ ط¨ط¹ط¯ظ‡ط§ ظ…ظ† âڑ™ï¸ڈ طھط¨ط¯ط£
     ط¨ط§ظ„ط£ظ‚ط³ط§ظ… ظƒظ„ظ‡ط§ ظ…ظ‚ظپظˆظ„ط© ط²ظٹ ظ…ط§ ظ‡ظٹ ظ…ظپط±ظˆط¶. */
  const [settingsFocus, setSettingsFocus] = useState<SettingsSectionId | null>(null);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [newSubjectInput, setNewSubjectInput] = useState("");
  const [showShopModal, setShowShopModal] = useState(false);
  const [showParentReport, setShowParentReport] = useState(false);
  const [isEmergencyMode, setIsEmergencyMode] = useState(false);

  // 5. ط§ظ„ط¨ظˆظ…ظˆط¯ظˆط±ظˆ ظˆط§ظ„ظ€ Flashcards
  const [showPomodoro, setShowPomodoro] = useState(false);
  const [pomoTime, setPomoTime] = useState(25 * 60);
  const [isPomoRunning, setIsPomoRunning] = useState(false);
  const [userNote, setUserNote] = useState("");
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);

  // 7. ط±ط³ط§ظ„ط© ط§ظ„طھظ‡ظ†ط¦ط© ط¹ظ†ط¯ ط¥ظ†ط¬ط§ط² ظٹظˆظ…
  const [celebration, setCelebration] = useState<{ topic: string; xp: number } | null>(null);

  // 8. ط³ط¬ظ„ ط§ظ„ظ†ط´ط§ط· ط§ظ„ظٹظˆظ…ظٹ (ظ„ظ„ط±ط³ظˆظ… ط§ظ„ط¨ظٹط§ظ†ظٹط©)
  const [activityLog, setActivityLog] = useState<ActivityLog>({});
  const [analyticsRange, setAnalyticsRange] = useState<"weekly" | "monthly">("weekly");

  /* ًںژ، ط¹ط¬ظ„ط© ظ…ط§ط¬ظٹظƒ â€” ط¹ط¯ظ‘ط§ط¯ ط§ظ„ظƒظˆط±ط³ط§طھ + طھظˆط²ظٹط¹ ط§ظ„ظ…ظˆط§ط¯ (ط¨ظٹط§ظ†ط§طھ ط­ظ‚ظٹظ‚ظٹط©).
     fetchCourses ط¨طھط¬ظٹط¨ study_configs + ط¹ط¯ظ‘ط§ط¯ study_days ظ„ظƒظ„ طھط±ط§ظƒطŒ ظپط¨ظ†ط´طھظ‚
     ط§ظ„ط±ظ‚ظ… ظˆط§ظ„ظ€ donut ظ…ظ† ظ†ظپط³ ط§ظ„ط±ط¯ â€” ظˆظ„ط§ ط¬ط¯ظˆظ„ ط¬ط¯ظٹط¯ ظˆظ„ط§ endpoint ط¥ط¶ط§ظپظٹ.
     null = ظ„ط³ظ‡ ط¨ظٹطھط­ظ…ظ‘ظ„ ط£ظˆ ظپط´ظ„ طµط§ظ…طھطŒ ظˆط§ظ„ظˆط§ط¬ظ‡ط© ط¨طھط¹ط±ط¶ آ«â€”آ» ط¨ط¯ظ„ ط£ظٹ ط±ظ‚ظ… ظˆظ‡ظ…ظٹ. */
  const [coursesCount, setCoursesCount] = useState<number | null>(null);
  const [subjectBreakdown, setSubjectBreakdown] = useState<
    { name: string; value: number; completed: number }[]
  >([]);
  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;
    void (async () => {
      const res = await fetchCourses(supabase, authUser.id);
      if (cancelled) return;
      if (res.error || !res.data) {
        setCoursesCount(null);
        return;
      }
      const courses = res.data;
      setCoursesCount(courses.length);
      const bySubject = new Map<string, { total: number; done: number }>();
      for (const c of courses) {
        const k = c.subject || "ط¨ط¯ظˆظ† ط§ط³ظ…";
        const e = bySubject.get(k) ?? { total: 0, done: 0 };
        e.total += c.totalDays || c.daysCount;
        e.done += c.completedDays;
        bySubject.set(k, e);
      }
      setSubjectBreakdown(
        Array.from(bySubject.entries())
          .map(([name, v]) => ({ name, value: v.total, completed: v.done }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 9),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser, supabase]);

  // 9. طھظ†ط¨ظٹظ‡ط§طھ طھط°ظƒظٹط± ط§ظ„ط³طھط±ظٹظƒ
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("20:00");
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">("default");

  // 10. ظ„ظˆط­ط© ط§ظ„ظ…طھطµط¯ط±ظٹظ†
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);

  // 11. ًں‘¤ ظ‚ط§ظٹظ…ط© ط§ظ„طھظ†ظ‚ظ„ ظ‡ظٹ ظ…طµط¯ط± ظƒظ„ ط§ظ„ط£ط¯ظˆط§طھ ط¯ظ„ظˆظ‚طھظٹ â€” ط§ظ„ط´ط±ظٹط· ط§ظ„ط¹ظ„ظˆظٹ ط§طھط´ط§ظ„
  // ظپظٹ ظ¨ ط£ط؛ط³ط·ط³طŒ ظپظ…ط§ظپظٹط´ ظ…ظ†ظٹظˆظ‡ط§طھ ظ…ظ†ط³ط¯ظ„ط© ظپظٹ ط§ظ„طھط±ظˆظٹط³ط© طھط­طھط§ط¬ ط­ط§ظ„ط© ط£ظˆ refs.

  // 12. ظپطھط­ ط§ظ„ط£ظٹط§ظ… ط¨ط¯ط±ظٹ ط¨ظˆط§ط³ط·ط© XP
  const [earlyUnlockedDays, setEarlyUnlockedDays] = useState<number[]>([]);

  // âڑ”ï¸ڈ طھط­ط¯ظٹ ط§ظ„ط¨ظˆط³ ط§ظ„ظ†ط´ط· ط­ط§ظ„ظٹظ‹ط§
  const [activeBossChapter, setActiveBossChapter] = useState<number | null>(null);

  // ًںڈ… ط¹ط¯ط¯ ط£ظˆط³ظ…ط© طھط­ط¯ظٹ ط§ظ„ظپطµظ„ â€” ط¨ظٹط³طھط®ط¯ظ…ظ‡ ط´ط±ظٹط· ط§ظ„ط¥ظ†ط¬ط§ط²ط§طھ ظپظٹ ظ…ط¹ظ„ظژظ… "ط£ظˆظ„ طھط­ط¯ظٹ ظپطµظ„".
  // ط¨ظ†ط¬ظٹط¨ ط§ظ„ط¹ط¯ط¯ ط¨ط³ (head: true) ظ…ط´ ط§ظ„طµظپظˆظپطŒ ظ„ط£ظ† ط§ظ„ظ‚ط§ظٹظ…ط© ط§ظ„ظƒط§ظ…ظ„ط© ظپظٹ
  // /dashboard/achievements ظˆظ‡ظٹ ط§ظ„ظ„ظٹ ط¨طھظ‚ط±ط§ ط§ظ„طµظپظˆظپ ط¨ظ€ fetchBadges.
  const [badgeCount, setBadgeCount] = useState(0);

  // 13. ط§ظ„ظ…ظ„ط®طµ ط§ظ„ط£ط³ط¨ظˆط¹ظٹ ط§ظ„طھظ„ظ‚ط§ط¦ظٹ
  const [showWeeklySummary, setShowWeeklySummary] = useState(false);
  const [weeklySummaryData, setWeeklySummaryData] = useState<{ days: number; minutes: number } | null>(null);

  const [isChangingSubject, setIsChangingSubject] = useState(false);
  const [isAddingPlanStep, setIsAddingPlanStep] = useState(false);

  // 14. ًں‘¤ ط§ظ„ط´ط®طµظٹط© â€” ط¨طھطھظ‚ط±ط§ ظ…ظ† profiles.persona ظˆط¨طھط؛ظٹظ‘ط± ظ†طµظˆطµ ط§ظ„ظˆط§ط¬ظ‡ط© ظƒظ„ظ‡ط§
    const [persona, setPersona] = useState<Persona>(DEFAULT_PERSONA);

    // ًںژ¯ ظ„ظ„ظ…ط³ط§ط¹ط¯ ط§ظ„ط´ط®طµظٹ (Phase 2A): ط§ظ„ط£ظ‡ط¯ط§ظپ ط§ظ„ظ…ط¹ظ„ظ‚ط© ظˆط§ظ„ظ…ط³طھظˆظ‰ ط§ظ„ط¯ط±ط§ط³ظٹ â€” ط®ط§ظ…طŒ
    // ظˆط§ظ„طھط­ظˆظٹظ„ ظ„ط³ظٹط§ظ‚ ظ…ط³ط¤ظˆظ„ظٹط© buildPersonalContext طھط­طھ.
    const [pendingGoals, setPendingGoals] = useState<PendingGoalRow[]>([]);
    const [studentLevel, setStudentLevel] = useState<string | null>(null);

  // ًں”´ ط¯ط§ظ„ط© طھظˆظ„ظٹط¯ ط§ظ„ط£ظٹط§ظ…
  // âڑ ï¸ڈ ط§ظ„ط´ط®طµظٹط© ط¨طھطھظ…ط±ظ‘ط± طµط±ظٹط­ ظ…ط´ ط¨طھطھظ‚ط±ط§ ظ…ظ† ط§ظ„ط­ط§ظ„ط©: ط£ظˆظ„ ظ†ط¯ط§ط، ط¨ظٹط­طµظ„ ط¬ظˆظ‡ ظ†ظپط³ ط¯ط§ظ„ط©
  // ط§ظ„طھط­ظ…ظٹظ„ ط§ظ„ظ„ظٹ ط¨طھط¹ظ…ظ„ setPersonaطŒ ظˆ setState ظ…ط´ ظپظˆط±ظٹط© â€” ظپظ„ظˆ ظ‚ط±ظٹظ†ط§ ظ…ظ† ط§ظ„ط­ط§ظ„ط©
  // ظ‡ظ†ط§طŒ ط®ط±ظٹط¬ ط£ظˆ ظپط±ظٹ ظ„ط§ظ†ط³ط± ظƒط§ظ† ظ‡ظٹط§ط®ط¯ ط£ظٹط§ظ… ط¨ط§ط³ظ… آ«ط§ظ„ط¯ط±ط³ ظ،آ» ط¨ط¯ظ„ آ«ط§ظ„ظ…ط´ط±ظˆط¹ ظ،آ».
  const generateDays = (parsedConfig: StudyConfig, forPersona: Persona): StudyDay[] => {
    const uiText = getUiText(parsedConfig.category, forPersona);
    const generatedDays: StudyDay[] = Array.from({ length: parsedConfig.daysCount || 7 }, (_, i) => ({
      day: i + 1,
      title: `${uiText.stepPrefix} ${i + 1}`,
      topic: `${uiText.stepPrefix} ${i + 1}: ظپظٹ ${parsedConfig.subject}`,
      description: `${uiText.taskDescPrefix} ${parsedConfig.subject}.`,
      isCompleted: false,
      xpReward: 100,
      learningStyle: "practical",
    }));
    setDays(generatedDays);
    return generatedDays;
  };

  // ًں”´ ط¥ط¯ط±ط§ط¬ ط£ظٹط§ظ… ط§ظ„ط®ط·ط© ظپظٹ ظ‚ط§ط¹ط¯ط© ط§ظ„ط¨ظٹط§ظ†ط§طھ (Supabase)
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

  // ًں”´ طھط­ظ…ظٹظ„ ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…ط³طھط®ط¯ظ… ظ…ظ† Supabase ط¹ظ†ط¯ ط¨ط¯ط§ظٹط© ط§ظ„طھط´ط؛ظٹظ„
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
              setLoadError("طھط¹ط°ط± ط¥ظ†ط´ط§ط، ط¬ظ„ط³ط© ط²ط§ط¦ط±. ط­ط§ظˆظ„ طھط­ط¯ظ‘ط« ط§ظ„طµظپط­ط©.");
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
          // ًںھ™ Phase 4.0 â€” ظ…ظƒط§ظپط£ط© ط§ظ„طھط³ط¬ظٹظ„ +20 (ظ…ط±ط©/ط¹ظ…ط± ط¹ط¨ط± trigger + fallback idempotent).
          // ط§ظ„ظ€ trigger trg_signup_bonus ظٹظ…ظ†ط­ظ‡ط§ server-side ط¹ظ†ط¯ insertطŒ ظˆظ‡ط°ط§ fallback ظٹط؛ط·ظٹ
          // ط­ط³ط§ط¨ط§طھ ظ‚ط¯ظٹظ…ط© ظ‚ط¨ظ„ ط§ظ„ظ€ trigger ط£ظˆ ظ„ظˆ ط§ظ„ظ€ trigger ظ„ظ… ظٹظڈط´ط؛ظ„ ط¨ط¹ط¯.
          if (profile) {
            void awardCoins(supabase, "signup_bonus").catch(() => {});
          }
        }

        // ًں‘¤ ط§ظ„ط´ط®طµظٹط© ط¨طھط­ط¯ط¯ ظ†طµظˆطµ ط§ظ„ظˆط§ط¬ظ‡ط© (ظˆط­ط¯ط© ط§ظ„طھظ‚ط¯ظ…طŒ ط§ط³ظ… ط§ظ„ظ†ظ‚ط§ط·طŒ ظ†ط¨ط±ط© ط§ظ„ط²ط±ط§ظٹط±).
        // ط¨طھطھط®طھط§ط± ظپظٹ ط§ظ„ظ„ط§ظ†ط¯ظٹظ†ط¬ ظˆط¨طھطھط­ظپط¸ ظپظٹ /assessment.
        // ط§ظ„ظ…طھط؛ظٹط± ط§ظ„ظ…ط­ظ„ظٹ ط¯ظ‡ ظ‡ظˆ ط§ظ„ظ„ظٹ ط¨ظٹطھظ…ط±ظ‘ط± ظ„ظ€ generateDays طھط­طھ â€” ط§ظ„ط­ط§ظ„ط© ظ†ظپط³ظ‡ط§
        // ظ…ط´ ط¨طھط¨ظ‚ظ‰ ط¬ط§ظ‡ط²ط© ظ‚ط¨ظ„ ظ†ظ‡ط§ظٹط© ط§ظ„ط¯ط§ظ„ط© ط¯ظٹ.
        const loadedPersona: Persona = isPersona(profile?.persona) ? profile.persona : DEFAULT_PERSONA;
                setPersona(loadedPersona);
                // ط§ظ„ظ…ط³طھظˆظ‰ ط§ظ„ط¯ط±ط§ط³ظٹ (ظ„ظ„ط·ط§ظ„ط¨ ط¹ظ„ظٹظ‡) â€” ط¨ظٹظپط¶ظ„ null ظ„ط؛ظٹط±ظ‡ظ…طŒ ظˆط§ظ„ظ…ط³ط§ط¹ط¯ ط¨ظٹظ„ظپظ‡ ط¨ط³ظ‡ظˆظ„ط©.
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

            /* ًںھ™ ظƒظˆظٹظ†ط² ط£ظˆظ„ ط²ظٹط§ط±ط© ظپظٹ ط§ظ„ظٹظˆظ…. ط§ظ„ظپط±ط¹ ط¯ظ‡ ط¨ظٹطھظ†ظپظ‘ط° ظ…ط±ط© ظˆط§ط­ط¯ط© ظٹظˆظ…ظٹط§ظ‹
               (`lastVisit !== today`) ظپظ‡ظˆ ط¨ط§ظ„ط¸ط¨ط· ظ…ط¹ظ†ظ‰ آ«ط¯ط®ظˆظ„ ظٹظˆظ…ظٹآ».

               âڑ ï¸ڈ ظ…ط´ ط¨ظ€ await: ط¯ظ‡ ط¬ظˆظ‡ ظ…ط³ط§ط± طھط­ظ…ظٹظ„ ط§ظ„ط¯ط§ط´ط¨ظˆط±ط¯طŒ ظˆط§ظ„ط§ظ†طھط¸ط§ط± ط¹ظ„ظ‰
               ظ†ط¯ط§ط،ظٹظ† RPC ط¨ظٹط£ط®ظ‘ط± ط£ظˆظ„ ط±ط³ظ…. ط§ظ„ظƒظˆظٹظ†ط² ط¥ط¶ط§ظپط©طŒ ظپط¨طھط±ظˆط­ ظ„ظˆط­ط¯ظ‡ط§
               ظˆط§ظ„طµظپط­ط© طھظƒظ…ظ‘ظ„. ط£ظٹ ظپط´ظ„ (db/shop.sql ظ„ط³ظ‡ ظ…ط§ ط§طھط´ط؛ظ‘ظ„ط´) ط¨ظٹطھط³ط¬ظ‘ظ„
               ظپظٹ ط§ظ„ظƒظˆظ†ط³ظˆظ„ ظˆط®ظ„ط§طµ â€” ط§ظ„طھظ‚ط¯ظ‘ظ… ظ†ظپط³ظ‡ ط§طھط­ظپط¸ ظپظˆظ‚.

               `streak_day` ط¹ظ†ط¯ ط§ظ„ظ†ظ…ظˆ ط¨ط³: ظ„ظˆ ط§ظ„ط³ظ„ط³ظ„ط© ط§طھطµظپظ‘ط±طھ ظ„ظ€ ظ، ظٹط¨ظ‚ظ‰
               ظ…ط§ظپظٹط´ ط³ظ„ط³ظ„ط© طھطھظƒط§ظپط£ ط¹ظ„ظٹظ‡ط§. */
            void (async () => {
              try {
                await awardCoins(supabase, "daily_login");
                if (streakGrew) {
                  await awardCoins(supabase, "streak_day");
                  /* ظƒظ„ ظ§ ط£ظٹط§ظ… ظ…طھظˆط§طµظ„ط© = ط£ط³ط¨ظˆط¹ ظƒط§ظ…ظ„. ظ†ظپط³ ط¹ط¯ظ‘ط§ط¯ ط¥ظ†ط¬ط§ط²
                     آ«week-streakآ» ظپظٹ طµظپط­ط© ط§ظ„ط¥ظ†ط¬ط§ط²ط§طھطŒ ظپط§ظ„ظ…ط³طھط®ط¯ظ… ط¨ظٹط´ظˆظپ
                     ط§ظ„ظˆط³ط§ظ… ظˆط§ظ„ظƒظˆظٹظ†ط² ظپظٹ ظ†ظپط³ ط§ظ„ظٹظˆظ… ظ…ط´ ظپظٹ ظٹظˆظ…ظٹظ† ظ…ط®طھظ„ظپظٹظ†. */
                  if (currentStreak % 7 === 0) await awardCoins(supabase, "perfect_week");
                }
              } catch (coinErr) {
                console.error("award daily coins failed (ظ…طھط¬ط§ظ‡ظژظ„):", coinErr);
              }
            })();
          }
          setStreak(currentStreak);
        }

        // ًں“ڑ ط§ظ„طھط±ط§ظƒ ط§ظ„ظ…ظپطھظˆط­: طµظپط­ط© ط§ظ„ظƒظˆط±ط³ط§طھ ط¨طھظƒطھط¨ ط§ط®طھظٹط§ط±ظƒ ظپظٹ
        // profiles.active_config_idطŒ ظˆط¥ط­ظ†ط§ ط¨ظ†ظ‚ط±ط§ظ‡ ظ…ظ† ط§ظ„ط¨ط±ظˆظپط§ظٹظ„ ط§ظ„ظ„ظٹ ظ…ط­ظ…ظ‘ظ„ ظپظˆظ‚
        // ط®ظ„ط§طµ (select *) â€” ظپظ…ط§ظپظٹط´ ط§ط³طھط¹ظ„ط§ظ… ط²ظٹط§ط¯ط©.
        //
        // ط§ظ„ط§ط®طھظٹط§ط± ظپظٹ ط§ظ„ط­ط³ط§ط¨ ظ…ط´ ط¹ظ„ظ‰ ط§ظ„ط¬ظ‡ط§ط²: طھط®طھط§ط± ظ…ظ† ط§ظ„ظ„ط§ط¨طھظˆط¨ طھظ„ط§ظ‚ظٹظ‡ ظ…ظپطھظˆط­
        // ط¹ظ„ظ‰ ط§ظ„ظ…ظˆط¨ط§ظٹظ„. ظˆظ„ظˆ ط§ظ„ط¹ظ…ظˆط¯ ظ„ط³ظ‡ ظ…ط´ ظ…ظˆط¬ظˆط¯ (ط§ظ„ظ€ SQL ظ…ط§ ط§طھط´ط؛ظ‘ظ„ط´)طŒ ط§ظ„ظ‚ظٹظ…ط©
        // ط¨طھط·ظ„ط¹ undefined ظˆط§ظ„ط¯ط§ط´ط¨ظˆط±ط¯ طھظپطھط­ ط£ط­ط¯ط« طھط±ط§ظƒ â€” ظ†ظپط³ ط§ظ„ط³ظ„ظˆظƒ ط§ظ„ط£طµظ„ظٹ.
        const savedConfigId: string | null = profile?.active_config_id ?? null;

        let existingConfig: Record<string, any> | null = null;

        if (savedConfigId) {
          const { data: chosen } = await supabase
            .from("study_configs")
            .select("*")
            .eq("user_id", currentUser.id)
            .eq("id", savedConfigId)
            .maybeSingle();

          // ظ„ظˆ ظ…ط´ ظ…ظˆط¬ظˆط¯ ظ…ط§ط¨ظ†طµظپظ‘ط±ط´ ط§ظ„ط¹ظ…ظˆط¯ ظ‡ظ†ط§: ط§ظ„ظ€ FK (on delete set null)
          // ط¨ظٹط¹ظ…ظ„ ط¯ظ‡ ظ„ظˆط­ط¯ظ‡ ظˆظ‚طھ ط§ظ„ط­ط°ظپ. ط§ظ„ط­ط§ظ„ط© ط§ظ„ظˆط­ظٹط¯ط© ط§ظ„ظ„ظٹ ظ†ظˆطµظ„ ظ„ظ‡ط§ ظ‡ظ†ط§ ظ‡ظٹ
          // ط³ط¨ط§ظ‚ ط¨ظٹظ† طھط§ط¨ظٹظ†طŒ ظˆط£ط­ط¯ط« طھط±ط§ظƒ ط­ظ„ ظ…ظ‚ط¨ظˆظ„ ظ„ظ‡ط§.
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

                        // ًںژ¯ ط§ظ„ط£ظ‡ط¯ط§ظپ ط؛ظٹط± ط§ظ„ظ…ظƒطھظ…ظ„ط© ط¨طھط±ظˆط­ ظ„ظ„ظ…ط³ط§ط¹ط¯ ط§ظ„ط´ط®طµظٹ (طھط¹ط¯ط§ط¯ + ط§ط³طھط¹ط¬ط§ظ„).
                        // ظ†ظپط³ ط£ط¹ظ…ط¯ط© fetchGoals ظپظٹ lib/pages-data.ts â€” ظˆط§ظ„طµظپظˆظپ ط®ط§ظ… ط¹ط´ط§ظ†
                        // buildPersonalContext ظ‡ظٹ ط§ظ„ظ„ظٹ ط¨طھط­ط³ط¨ ط§ظ„ظ€ urgency ط¨ظ…ظˆط¹ط¯ظ‡ط§ ط§ظ„ظ†ظ‡ط§ط¦ظٹ.
                        const { data: goalRows, error: goalsError } = await supabase
                          .from("planner_goals")
                          .select("title, due_date, priority, is_done")
                          .eq("user_id", currentUser.id)
                          .eq("is_done", false);
                        if (goalsError) {
                          // ط¬ط¯ظˆظ„ planner_goals ظ…ط´ ظ…طھط´ط؛ظ‘ظ„ (db/pages.sql) â†’ ظƒط§ط±طھ ط§ظ„ط£ظ‡ط¯ط§ظپ ظٹط®طھظپظٹ ط¨ظ‡ط¯ظˆط،.
                          console.warn("طھط¹ط°ط± ط¬ظ„ط¨ ط£ظ‡ط¯ط§ظپ ط§ظ„ظ…ط®ط·ط· (ط´ط؛ظ‘ظ„ db/pages.sql):", goalsError.message);
                        } else if (goalRows) {
                          setPendingGoals(goalRows as PendingGoalRow[]);
                        }

        // ًںڈ… ط¹ط¯ط¯ ط§ظ„ط£ظˆط³ظ…ط©. ط¨ظٹظپط´ظ„ ط¨ظ‡ط¯ظˆط، ط¹ظ† ظ‚طµط¯: ط¬ط¯ظˆظ„ badges ط¬ط§ظٹ ظ…ظ†
        // db/pages.sqlطŒ ظˆظ„ظˆ ط§ظ„ظ…ظ„ظپ ط¯ظ‡ ظ„ط³ظ‡ ظ…ط§ ط§طھط´ط؛ظ‘ظ„ط´ ظپظٹ Supabase ط§ظ„ط¯ط§ط´ط¨ظˆط±ط¯
        // ظƒظ„ظ‡ط§ ظ…ط§ طھظ‚ط¹ط´ â€” ط§ظ„ط´ط±ظٹط· ط¨ظٹط¹ط±ط¶ ظ…ط¹ظ„ظژظ… "ط£ظˆظ„ طھط­ط¯ظٹ ظپطµظ„" ظ…ظ‚ظپظˆظ„ ظˆط®ظ„ط§طµ.
        const { count: badgeRows, error: badgeError } = await supabase
          .from("badges")
          .select("*", { count: "exact", head: true })
          .eq("user_id", currentUser.id);
        if (badgeError) console.warn("طھط¹ط°ظ‘ط± ط¬ظ„ط¨ ط¹ط¯ط¯ ط§ظ„ط£ظˆط³ظ…ط© (ط´ط؛ظ‘ظ„ db/pages.sql):", badgeError.message);
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
        setLoadError("ط­طµظ„ ط®ط·ط£ ط؛ظٹط± ظ…طھظˆظ‚ط¹ ط£ط«ظ†ط§ط، طھط­ظ…ظٹظ„ ط¨ظٹط§ظ†ط§طھظƒ. ط§ظپطھط­ Console (F12) ظ„ظ…ط²ظٹط¯ ظ…ظ† ط§ظ„طھظپط§طµظٹظ„.");
      } finally {
        setIsInitialized(true);
      }
    }

    loadData();
  }, []);

  // Phase B: XP ظ…ط­ظ…ظٹ â€” ظ„ط§ طھط­ط¯ظٹط« ظ…ط¨ط§ط´ط± ظ„ظ€ profiles.xp (ظٹظ…ط± ط¹ط¨ط± increment_xp RPC ظپظ‚ط·)
  // ظ‡ط°ط§ ط§ظ„ظ€ effect ظٹط­ظپط¸ streak/theme ظپظ‚ط·. ط§ظ„ظ€ XP ظٹظڈط­ظپط¸ ط¹ط¨ط± increment_xp ط¹ظ†ط¯ ظƒط³ط¨ظ‡.
  useEffect(() => {
    if (isInitialized && authUser) {
      supabase.from("profiles").update({ streak, theme }).eq("id", authUser.id).then();
    }
  }, [streak, theme, isInitialized, authUser]);

  /* ًں“– طھطµظپظٹط± ط§ظ„ظپطھط­ط© ط§ظ„ظ…ظˆط¬ظ‘ظ‡ط© ط¹ظ†ط¯ ظ‚ظپظ„ ط§ظ„ط¯ط±ط¬.
     ظƒط§ط±طھ ط§ظ„ظ‚ط±ط¢ظ† ط¨ظٹظ‚ظˆظ„ آ«ط§ظپطھط­ ط¹ظ„ظ‰ ط§ظ„طµظˆطھآ»طŒ ظˆط§ظ„ط¯ط±ط¬ ط¨ظٹظپطھط­ ط§ظ„ظ‚ط³ظ… ط¯ظ‡. ظ„ظˆ ط§ظ„ظ‚ظٹظ…ط©
     ظپط¶ظ„طھ ظ…طھط¹ظ„ظ‘ظ‚ط©طŒ ط£ظٹ ظپطھط­ط© ط¨ط¹ط¯ ظƒط¯ظ‡ ظ…ظ† âڑ™ï¸ڈ ظƒط§ظ†طھ ظ‡طھظپطھط­ آ«ط§ظ„طµظˆطھآ» طھط§ظ†ظٹ â€” ظˆط£ط³ظˆط£:
     ظ„ظˆ ط§ظ„ظ…ط³طھط®ط¯ظ… ظ‚ظپظ„ ط§ظ„ظ‚ط³ظ… ط¨ظ†ظپط³ظ‡طŒ ط¥ط¹ط§ط¯ط© ظپطھط­ ط§ظ„ط¯ط±ط¬ ظƒط§ظ†طھ ظ‡طھظپطھط­ظ‡ ظپظٹ ظˆط´ظ‡ طھط§ظ†ظٹ
     ظˆطھظ„ط؛ظٹ ط§ط®طھظٹط§ط±ظ‡ ط§ظ„طµط±ظٹط­. ط§ظ„ط´ط±ط· ط¹ظ„ظ‰ ط§ظ„ظ‚ظپظ„ ظ…ط´ ط¹ظ„ظ‰ ط§ظ„ظپطھط­ ط¹ط´ط§ظ† ظٹط´طھط؛ظ„ ظ…ط¹ ط£ظٹ
     ط·ط±ظٹظ‚ط© ظ‚ظپظ„ (ط²ط±ط§ط± ط§ظ„ط¥ظƒط³طŒ ط§ظ„ط¶ط؛ط· ط¹ظ„ظ‰ ط§ظ„ط®ظ„ظپظٹط©طŒ ط£ظˆ ط¥ط´ط§ط±ط© طھظ†ظ‚ظ‘ظ„). */
  useEffect(() => {
    if (!isMenuOpen) setSettingsFocus(null);
  }, [isMenuOpen]);

  // ًں”´ ط­ظپط¸ ط§ظ„ظپظ„ط§ط´ ظƒط§ط±ط¯ط² ظ…ط­ظ„ظٹط§ظ‹
  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem("study_progress", JSON.stringify({ flashcards }));
    }
  }, [flashcards, isInitialized]);

  // ًں”´ ط­ظپط¸ طھظپط¶ظٹظ„ط§طھ ط§ظ„طھظ†ط¨ظٹظ‡ط§طھ
  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem("study_notif_prefs", JSON.stringify({ enabled: notificationsEnabled, time: reminderTime }));
    }
  }, [notificationsEnabled, reminderTime, isInitialized]);

  // âœ… ط­ظپط¸ ط§ظ„ط£ظٹط§ظ… ط§ظ„ظ…ظپطھظˆط­ط© ط¨ط¯ط±ظٹ ظ…ط­ظ„ظٹظ‹ط§
  useEffect(() => {
    if (isInitialized && configId) {
      localStorage.setItem(`early_unlocked_${configId}`, JSON.stringify(earlyUnlockedDays));
    }
  }, [earlyUnlockedDays, isInitialized, configId]);

  // âœ… ظ…ظ„ط®طµ ط£ط³ط¨ظˆط¹ظٹ طھظ„ظ‚ط§ط¦ظٹ
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

  // âœ… ط¬ظ„ط¨ ظ„ظˆط­ط© ظ…طھطµط¯ط±ظٹظ† ط­ظ‚ظٹظ‚ظٹط© ظ…ظ† ظ‚ط§ط¹ط¯ط© ط§ظ„ط¨ظٹط§ظ†ط§طھ
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
            name: row.id === authUser?.id ? "ط£ظ†طھ" : `ظ„ط§ط¹ط¨ #${String(row.id).slice(0, 4)}`,
            xp: row.xp || 0,
            streak: row.streak || 0,
            isYou: row.id === authUser?.id,
          }));
          if (authUser && !entries.some((e) => e.isYou)) {
            entries.push({ id: authUser.id, name: "ط£ظ†طھ", xp, streak, isYou: true });
          }
          entries.sort((a, b) => b.xp - a.xp);
          setLeaderboardEntries(entries);
        }
        setIsLoadingLeaderboard(false);
      });
  }, [showLeaderboard]);

  // ًں”” ظ…ط±ط§ظ‚ط¨ط© ظ…ظˆط¹ط¯ ط§ظ„طھط°ظƒظٹط± ظƒظ„ ط¯ظ‚ظٹظ‚ط©
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
        new Notification("ًں”¥ ط­ط§ظپط¸ ط¹ظ„ظ‰ ط³ظ„ط³ظ„طھظƒ!", {
          body: `ظ„ط³ظ‡ ظ…ط§ ط°ط§ظƒط±طھط´ ط§ظ„ظ†ظ‡ط§ط±ط¯ظ‡... ط®ظ„ظٹ ط³ظ„ط³ظ„ط© ط§ظ„ظ€ ${streak} ظٹظˆظ… ظ…ط§طھظ†ظƒط³ط±ط´!`,
          icon: "/favicon.ico",
        });
        localStorage.setItem("last_reminder_date", todayKey);
      }
    };
    checkReminder();
    const interval = setInterval(checkReminder, 60 * 1000);
    return () => clearInterval(interval);
  }, [notificationsEnabled, reminderTime, activityLog, streak]);

  /** ط§ظ„ظ…ط³ط§ط¹ط¯ ط§ظ„ظ…ظˆط­ط¯ ط§ظ„ظˆط­ظٹط¯ â€” ط§ظ„ط¯ط§ط´ط¨ظˆط±ط¯ ظٹظپطھط­ /chat ظ…ط¹ ط³ظٹط§ظ‚ ط§ظ„ط¯ط±ط³ (user decision). */
  const openUnifiedChat = (day?: StudyDay | null, subject?: string) => {
    const params = new URLSearchParams();
    if (configId) params.set("configId", configId);
    if (day && Number.isInteger(day.day)) params.set("lessonDay", String(day.day));
    const subjectName = subject || config?.subject || "";
    if (subjectName) params.set("subject", subjectName);
    if (day?.topic) params.set("lesson", day.topic);
    if (day?.title) params.set("title", day.title);
    const desc = (day as (StudyDay & { description?: unknown }) | null | undefined)?.description;
    if (typeof desc === "string" && desc.trim()) params.set("content", desc.slice(0, 4000));
    const qs = params.toString();
    router.push(qs ? `/chat?${qs}` : "/chat");
  };

  const handleOpenAiAssistant = () => {
    const current = days.find((d) => d.day === currentDayNumber) || days[0];
    openUnifiedChat(current ?? null);
  };

  /* ًں“‘ ظƒظ„ ط¨ظ†ط¯ آ«ظ…ظˆط¯ط§ظ„آ» ظپظٹ ط§ظ„ظ‚ط§ظٹظ…ط© ط§ظ„ط¬ط§ظ†ط¨ظٹط© ط¨ظٹظˆطµظ„ ظ‡ظ†ط§.
     âڑ ï¸ڈ ط§ظ„ط·ظˆط§ط±ط¦ ظ…ظپطھط§ط­ ظ…ط´ ظ…ظˆط¯ط§ظ„: ظ…ظ† ط§ظ„ظ‚ط§ظٹظ…ط© ط¨ظٹطھظ‚ظ„ط¨طŒ ظˆط¨ظٹظٹط¬ظٹ ط¥ط¬ط¨ط§ط±ظٹ `true` ظ„ظ…ط§
     ط§ظ„ظ…ط³طھط®ط¯ظ… ظٹط¯ظˆط³ ط¹ظ„ظٹظ‡ ظˆظ‡ظˆ ظپظٹ طµظپط­ط© ظپط±ط¹ظٹط© (ط´ظˆظپ ط§ط³طھظ‡ظ„ط§ظƒ ط§ظ„ظ†ظٹط© طھط­طھ) â€” ط¹ط´ط§ظ†
     آ«ط´ط؛ظ‘ظ„ ط§ظ„ط·ظˆط§ط±ط¦آ» ظ…ط§طھطھط­ظˆظ„ط´ ظ„ظ€ آ«ط§ظ‚ظپظ„ظ‡آ» ط¨ط³ط¨ط¨ طھظ†ظ‚ظ‘ظ„ ط¨ظٹظ†ظ‡ظ…. */
  const handleNavSignal = (signal: NavSignal, opts?: { force?: boolean }) => {
    switch (signal) {
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

  /* ًں“‘ ط§ظ„ظ†ظٹط© ط§ظ„ظ…ط­ظپظˆط¸ط©: ط¨ظ†ط¯ ط§ظ„ظ‚ط§ظٹظ…ط© ط§ظ„ظ„ظٹ ظ…ط§ظ„ظˆط´ طµظپط­ط© (ظ…ظˆط¯ط§ظ„ ط£ظˆ ظ‚ط³ظ…) ط¨ظٹطھط¶ط؛ط·
     ظ…ظ† طµظپط­ط© ظپط±ط¹ظٹط©طŒ ظپط¨ظٹظƒطھط¨ ظ†ظٹطھظ‡ ظپظٹ sessionStorage ظˆظٹظ†ظ‚ظ„ ظ‡ظ†ط§. ط§ظ„ط¥ظپظƒطھ ط¯ظ‡ ظ‡ظˆ
     ط§ظ„ظ„ظٹ ط¨ظٹظ†ظپظ‘ط°ظ‡ط§ â€” ظ…ظ† ط؛ظٹط±ظ‡ ط§ظ„ط¶ط؛ط· ظƒط§ظ† ط¨ظٹظ†ظ‚ظ„ ظ„ظ„ط¯ط§ط´ط¨ظˆط±ط¯ ظˆط¨ط³.
     ط¨ظٹط³طھظ†ظ‰ `authUser` ظ„ط£ظ† ظ…ظˆط¯ط§ظ„ط§طھ ط²ظٹ ط§ظ„طھظ‚ط±ظٹط± ظˆط§ظ„ظ…طھطµط¯ط±ظٹظ† ظ…ط§ظ„ظ‡ط§ط´ ظ…ط¹ظ†ظ‰ ظ‚ط¨ظ„
     ظ…ط§ ط§ظ„ط¨ظٹط§ظ†ط§طھ طھط­ظ…ظ‘ظ„. */
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
    // ط§ظ„ظ‚ط³ظ… ظ„ط§ط²ظ… ظٹظƒظˆظ† ط§طھط±ظƒظ‘ط¨ ظ‚ط¨ظ„ ظ…ط§ ظ†ط³ظƒط±ظˆظ„ ظ„ظ‡
    // Phase 4: Analytics is now inside <details id="analytics"> collapsed by default
    // â€” if intent targets analytics, open the disclosure first so content is visible.
    requestAnimationFrame(() => {
      if (intent.target === "analytics") {
        const details = document.getElementById("analytics") as HTMLDetailsElement | null;
        if (details && details.tagName.toLowerCase() === "details") details.open = true;
      }
      document.getElementById(intent.target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [authUser]);

  async function handleToggleNotifications(): Promise<void> {
    if (typeof window === "undefined" || !("Notification" in window)) {
      alert("ًںک… ط§ظ„ظ…طھطµظپط­ ط¯ظ‡ ظ„ط§ ظٹط¯ط¹ظ… ط§ظ„طھظ†ط¨ظٹظ‡ط§طھ.");
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
      new Notification("ًں”” طھظ… طھظپط¹ظٹظ„ طھط°ظƒظٹط± ط§ظ„ط³طھط±ظٹظƒ!", { body: `ظ‡ظ†ظ†ط¨ظ‡ظƒ ط§ظ„ط³ط§ط¹ط© ${reminderTime} ظ„ظˆ ظ„ط³ظ‡ ظ…ط§ ط°ط§ظƒط±طھط´.` });
    } else {
      alert("ظ…ط­طھط§ط¬ظٹظ† ط¥ط°ظ†ظƒ ظ„ط¥ط±ط³ط§ظ„ ط§ظ„طھظ†ط¨ظٹظ‡ط§طھ ظ…ظ† ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„ظ…طھطµظپط­.");
    }
  }

  const handleEnableWebPush = async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      alert("ًںک… ط§ظ„ظ…طھطµظپط­ ط¯ظ‡ ظ„ط§ ظٹط¯ط¹ظ… ط§ظ„طھظ†ط¨ظٹظ‡ط§طھ ظپظٹ ط§ظ„ط®ظ„ظپظٹط© (Web Push).");
      return;
    }
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      alert("âڑ ï¸ڈ ط§ظ„ظ…ظٹط²ط© ط¯ظٹ ظ„ط³ظ‡ ظ…ط­طھط§ط¬ط© ط¥ط¹ط¯ط§ط¯ ظ…ظ† ظ†ط§ط­ظٹط© ط§ظ„ط³ظٹط±ظپط± (VAPID key + API route). ط±ط§ط¬ط¹ ط§ظ„طھط¹ظ„ظٹظ‚ط§طھ ظپظˆظ‚ ط§ظ„ط¯ط§ظ„ط© ط¯ظٹ ظپظٹ ط§ظ„ظƒظˆط¯.");
      return;
    }
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey,
      });
      // ط§ظ„ظ€ user_id ط¨ظٹط§ط®ط¯ظ‡ ط§ظ„ط³ظٹط±ظپط± ظ…ظ† ط§ظ„ط¬ظ„ط³ط©طŒ ظپظ…ط´ ط¨ظ†ط¨ط¹طھظ‡ ظ…ظ† ظ‡ظ†ط§
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription }),
      });
      if (!res.ok) {
        alert("âڑ ï¸ڈ ظ…ظ‚ط¯ط±ظ†ط§ط´ ظ†ط­ظپط¸ ط§ظ„ط§ط´طھط±ط§ظƒ. طھط£ظƒط¯ ط¥ظ†ظƒ ظ…ط³ط¬ظ‘ظ„ ط¯ط®ظˆظ„ ظˆط­ط§ظˆظ„ طھط§ظ†ظٹ.");
        return;
      }
      alert("ًںژ‰ طھظ… طھظپط¹ظٹظ„ ط§ظ„طھظ†ط¨ظٹظ‡ط§طھ ظپظٹ ط§ظ„ط®ظ„ظپظٹط©!");
    } catch (err) {
      console.error("Web Push subscribe failed:", err);
      alert("âڑ ï¸ڈ ط­طµظ„ ط®ط·ط£ ط£ط«ظ†ط§ط، طھظپط¹ظٹظ„ ط§ظ„طھظ†ط¨ظٹظ‡ط§طھطŒ ط­ط§ظˆظ„ طھط§ظ†ظٹ.");
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

  // ًں”´ طھط­ط¯ظٹط« ط§ظ„ط®ط·ظˆط© ط§ظ„ط­ط§ظ„ظٹط©
  useEffect(() => {
    if (days.length > 0) {
      const lastCompletedIndex = days.filter((d) => d.isCompleted).length;
      setCurrentDayNumber(Math.min(lastCompletedIndex + 1, days.length));
    }
  }, [days]);

  // ًں”´ ظ…ظ†ط·ظ‚ ظ…ط¤ظ‚طھ ط§ظ„ط¨ظˆظ…ظˆط¯ظˆط±ظˆ
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (isPomoRunning && pomoTime > 0) {
      timer = setInterval(() => setPomoTime((prev) => prev - 1), 1000);
    } else if (pomoTime === 0) {
      setIsPomoRunning(false);
      logActivity({ focusMinutes: 25 });
      alert("ًںژ‰ ط§ظ†طھظ‡طھ ط§ظ„ط¬ظ„ط³ط©! ط®ط° ط§ط³طھط±ط§ط­ط© ظ„ظ…ط¯ط© 5 ط¯ظ‚ط§ط¦ظ‚.");
    }
    return () => clearInterval(timer);
  }, [isPomoRunning, pomoTime]);

  const handleSubjectChange = async () => {
    if (!newSubjectInput.trim() || !config || !configId || !authUser || isChangingSubject) return;
    setIsChangingSubject(true);

    const newConfig: StudyConfig = { ...config, subject: newSubjectInput.trim() };

    const { error: updateError } = await supabase.from("study_configs").update({ subject: newConfig.subject }).eq("id", configId);

    if (updateError) {
      alert("âڑ ï¸ڈ ط­طµظ„ ط®ط·ط£ ط£ط«ظ†ط§ط، ط­ظپط¸ ط§ط³ظ… ط§ظ„ظ…ط§ط¯ط©طŒ ط­ط§ظˆظ„ طھط§ظ†ظٹ.");
      setIsChangingSubject(false);
      return;
    }

    const { error: deleteError } = await supabase.from("study_days").delete().eq("config_id", configId);
    if (deleteError) {
      console.error("Failed to delete old days:", deleteError);
      alert("âڑ ï¸ڈ ط­طµظ„ ط®ط·ط£ ط£ط«ظ†ط§ط، ظ…ط³ط­ ط£ظٹط§ظ… ط§ظ„ظ…ط§ط¯ط© ط§ظ„ظ‚ط¯ظٹظ…ط©طŒ ط­ط§ظˆظ„ طھط§ظ†ظٹ.");
      setIsChangingSubject(false);
      return;
    }

    const generated = generateDays(newConfig, persona);
    const savedDays = await insertDaysToDb({ userId: authUser.id, cfgId: configId, generatedDays: generated });

    if (savedDays.length > 0 && !savedDays[0].id) {
      alert("âڑ ï¸ڈ ط§طھط؛ظٹظ‘ط± ط§ط³ظ… ط§ظ„ظ…ط§ط¯ط©طŒ ظ„ظƒظ† ط­طµظ„ ط®ط·ط£ ط£ط«ظ†ط§ط، ط­ظپط¸ ط£ظٹط§ظ…ظ‡ط§ ط§ظ„ط¬ط¯ظٹط¯ط©. ط§ظپطھط­ Console (F12) ظˆط§ط¨ط¹طھ ط§ظ„ط®ط·ط£ ط§ظ„ظ„ظٹ ظپظٹظ‡.");
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
      if (!response.ok || !payload?.success || !payload.data) throw new Error(payload?.error || "طھط¹ط°ط± ط¥ط¶ط§ظپط© ط§ظ„ط®ط·ظˆط©.");

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
      if (error || !data) throw error || new Error("طھط¹ط°ط± ط­ظپط¸ ط§ظ„ط®ط·ظˆط©.");

      const savedDay = { ...newDay, id: data.id };
      const newDays = [...days, savedDay];
      setDays(newDays);
      const nextConfig = { ...config, daysCount: newDays.length };
      setConfig(nextConfig);
      await supabase.from("study_configs").update({ days_count: newDays.length }).eq("id", configId);
    } catch (error) {
      console.error("addPlanStep failed:", error);
      alert(error instanceof Error ? error.message : "طھط¹ط°ط± ط¥ط¶ط§ظپط© ط§ظ„ط®ط·ظˆط©. ط­ط§ظˆظ„ ظ…ط±ط© ط£ط®ط±ظ‰.");
    } finally {
      setIsAddingPlanStep(false);
    }
  };

  const toggleDayCompletion = (dayNumber: number) => {
    if (dayNumber > currentDayNumber && !earlyUnlockedDays.includes(dayNumber)) return;

    const target = days.find((d) => d.day === dayNumber);
    if (!target) return;
    const nextState = !target.isCompleted;

    // Phase C: ظ„ط§ ط±ط¬ظˆط¹ ظ„ظ„ظ€ XP ط¹ظ†ط¯ ط¥ظ„ط؛ط§ط، ط§ظ„ط¥ظƒظ…ط§ظ„ â€” XP ط؛ظٹط± ظ‚ط§ط¨ظ„ ظ„ظ„ط³ط­ط¨ ط¨ط¹ط¯ ط§ظ„ظ…ظ†ط­
    // ط§ظ„ط¥ظƒظ…ط§ظ„ ظپظ‚ط· ظٹظ…ط± ط¹ط¨ط± complete_study_day (server-validated + idempotent)
    if (!nextState) {
      setDays((prev) => prev.map((d) => (d.day === dayNumber ? { ...d, isCompleted: false } : d)));
      logActivity({ tasksCompleted: -1 });
      return;
    }

    // طھظپط§ط¤ظ„ظٹ: ط­ط¯ظ‘ط« ط§ظ„ظˆط§ط¬ظ‡ط© ظپظˆط±ط§ظ‹ ط«ظ… ط£ظƒط¯ ط¹ط¨ط± ط§ظ„ط³ظٹط±ظپط±
    setDays((prev) => prev.map((d) => (d.day === dayNumber ? { ...d, isCompleted: true } : d)));
    setCelebration({ topic: target.topic, xp: target.xpReward });
    logActivity({ tasksCompleted: 1 });

    if (!target.id) {
      // ظٹظˆظ… ظ…ط­ظ„ظٹ ظ„ظ… ظٹظڈط­ظپط¸ ط¨ط¹ط¯ ظپظٹ DB â€” fallback ظ…ط­ظ„ظٹ ظپظ‚ط·
      setXp((prev) => prev + target.xpReward);
      return;
    }

    supabase
      .rpc("complete_study_day", { p_day_id: target.id })
      .then(({ data, error }) => {
        if (error) {
          console.warn("complete_study_day failed:", error.message);
          // طھط±ط§ط¬ط¹ طھظپط§ط¤ظ„ظٹ
          setDays((prev) => prev.map((d) => (d.day === dayNumber ? { ...d, isCompleted: false } : d)));
          return;
        }
        const row = Array.isArray(data) ? data[0] : data;
        if (row) {
          if (row.xp_awarded > 0) setXp((prev) => prev + row.xp_awarded);
          // ط§ظ„ظƒظˆظٹظ†ط² طھظڈظ‚ط±ط£ ظ…ظ† coin_balance ط¹ط¨ط± ط§ظ„ظ‡ظˆظƒ ط§ظ„ط­ط§ظ„ظٹ â€” ظ„ط§ ط­ط§ط¬ط© ظ„طھط­ط¯ظٹط« ظٹط¯ظˆظٹ
        }
      });
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
      // Phase B: ط®طµظ… XP ط¹ط¨ط± RPC ظ…ط­ظ…ظٹ
      supabase.rpc("increment_xp", { p_delta: -200 }).then(({ error }) => {
        if (error) console.warn("increment_xp (-200) failed:", error.message);
      });
      alert("طھظ… ط´ط±ط§ط، طھط¬ظ…ظٹط¯ ط§ظ„ط³طھط±ظٹظƒ ط¨ظ†ط¬ط§ط­! ًںژ‰ طھظ… ط®طµظ… 200 XP.");
      setShowShopModal(false);
    } else {
      alert("ط¹ط°ط±ط§ظ‹طŒ ظ„ط§ طھظ…طھظ„ظƒ ط±طµظٹط¯ ظƒط§ظپظٹ ظ…ظ† ط§ظ„ظ†ظ‚ط§ط·! ًںک…");
    }
  };

  const handleShareReport = async () => {
    const text = `ًں“ٹ طھظ‚ط±ظٹط±ظٹ ظپظٹ ${config?.subject || "ط®ط·طھظٹ"}\nط§ظ„ظ…ط³طھظˆظ‰: L${level}\nط§ظ„ظ†ظ‚ط§ط·: ${xp} XP\nط§ظ„ظ…ظ‡ط§ظ… ط§ظ„ظ…ظ†ط¬ط²ط©: ${completedCount} ظ…ظ† ${days.length}\nط§ظ„ط³ظ„ط³ظ„ط©: ًں”¥ ${streak} ظٹظˆظ…`;
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ text });
      } catch {
        /* ط§ظ„ظ…ط³طھط®ط¯ظ… ظ„ط؛ظ‰ ط§ظ„ظ…ط´ط§ط±ظƒط© - طھط¬ط§ظ‡ظ„ */
      }
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        alert("طھظ… ظ†ط³ط® ط§ظ„طھظ‚ط±ظٹط±! ط§ظ„طµظ‚ظ‡ ظپظٹ ط£ظٹ ظ…ظƒط§ظ† ظ„ظ„ظ…ط´ط§ط±ظƒط© ًں“‹");
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

  // ًں–چï¸ڈ ط£ظ„ظˆط§ظ† ط§ظ„ط«ظٹظ… ط¨ظ‚طھ ظپظٹ theme-helpers.ts ظƒظ…طµط¯ط± ظˆط§ط­ط¯. ظƒط§ظ†طھ ظ…طھط¹ط±ظ‘ظپط© ظ‡ظ†ط§
  // ط¨ظ‚ظٹظ… ظ…ط®طھظ„ظپط© ط´ظˆظٹط© ط¹ظ† ط§ظ„ظ„ظٹ ظپظٹ ط§ظ„ظ…ظ„ظپطŒ ظپظƒط§ظ†طھ ط¨ط§ظ„ظٹطھظ‘ظٹظ† ط¨ظٹظپط±ظ‚ظˆط§ ط¹ظ† ط¨ط¹ط¶.
  const themeStyles = THEME_STYLES[theme];

  // âœ… ط­ط§ظ„ط© "ظ„ط³ظ‡ ط¨ظٹط­ظ…ظ‘ظ„"
  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper" dir="rtl">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-rule border-t-redpen rounded-full animate-spin mx-auto" />
          <p className="tag justify-center">ط¨ظٹط­ظ…ظ‘ظ„ ط¨ظٹط§ظ†ط§طھظƒ</p>
        </div>
      </div>
    );
  }

  // âœ… ط­ط§ظ„ط© ط§ظ„ط®ط·ط£
  if (loadError || !config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper px-4" dir="rtl">
        <div className="sheet-card sheet-card-live p-6 max-w-sm w-full space-y-3">
          <p className="eyebrow eyebrow-flush">ط®ط·ط£</p>
          <h1 className="h3">ظ…ط§ ظ‚ط¯ط±ظ†ط§ط´ ظ†ط­ظ…ظ‘ظ„ ط¨ظٹط§ظ†ط§طھظƒ</h1>
          <p className="text-xs text-ink-soft leading-relaxed">
            {loadError || "ط§ظپطھط­ Console (F12) ظˆط§ط¨ط¹طھظ„ظٹ ط±ط³ط§ظ„ط© ط§ظ„ط®ط·ط£."}
          </p>
          <button onClick={() => window.location.reload()} className="btn btn-marker btn-block text-sm">
            ط­ظ…ظ‘ظ„ ط§ظ„طµظپط­ط© طھط§ظ†ظٹ
          </button>
        </div>
      </div>
    );
  }

  // ًں‘¤ ط¨ظٹط§ظ†ط§طھ ط§ظ„ط¹ط±ط¶. ظƒط§ط±طھ ط§ظ„ط­ط³ط§ط¨ ظپظٹ ط§ظ„ظ‚ط§ظٹظ…ط© ط§ظ„ط¬ط§ظ†ط¨ظٹط© ط¨ظٹط´طھظ‚ظ‘ظ‡ط§ ط¨ظ†ظپط³ظ‡ ظ…ظ† ظ†ظپط³
  // ط§ظ„ط¯ط§ظ„ط©طŒ ظپط§ظ„ط§ط³ظ… ط§ظ„ظ„ظٹ ظپظٹ ط§ظ„طھط±ط­ظٹط¨ ظ‡ظˆ ظ†ظپط³ ط§ظ„ط§ط³ظ… ط§ظ„ظ„ظٹ ظپظٹ ط§ظ„ظƒط§ط±طھ â€” ظ…طµط¯ط± ظˆط§ط­ط¯.
  const displayName = railAccountFromUser(authUser)?.displayName ?? "ظ…ط³طھط®ط¯ظ…";

  // â•گâ•گâ•گ ط³ظٹط§ظ‚ ط§ظ„ظ…ط³ط§ط¹ط¯ ط§ظ„ط´ط®طµظٹ ط§ظ„ط­ظ‚ظٹظ‚ظٹ â€” ظ†ظپط³ ط­ط§ظ„ط© ظ‡ط°ظ‡ ط§ظ„طµظپط­ط© ط¨ط§ظ„ط¶ط¨ط· (Phase 2A) â•گâ•گâ•گ
  // ط£ظٹ ط±ظ‚ظ… ط¨ظٹظˆطµظ„ ظ„ظ„ظ…ط³ط§ط¹ط¯ ظ…طµط¯ط±ظ‡ ط­ط§ظ„ط© ط§ظ„ط¯ط§ط´ط¨ظˆط±ط¯ ط¯ظٹ: profile/study_days/activity/
  // planner_goals â€” ظˆظ…ظپظٹط´ ط£ظٹ ط±ظ‚ظ… ظ…ظ„ظپظژظ‘ظ‚. ظ„ظˆ ظ…ظپظٹط´ ط®ط·ط© ط£ظˆ ظ†ط´ط§ط·طŒ ط§ظ„ط³ظٹط§ظ‚ ط¨ظٹط³ظ‚ط·
  // ط§ظ„ط£ظ‚ط³ط§ظ… ط§ظ„ظپط§ط¶ظٹط© ظ…ط´ ط¨ظٹط¹ط±ط¶ ط£ط±ظ‚ط§ظ… ظˆظ‡ظ…ظٹط©.
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

  // ط³ط·ط± طھط­طھ ط§ظ„ط§ط³ظ… ظپظٹ ط§ظ„طھط±ظˆظٹط³ط©: ظ…ظƒط§ظ†ظƒ ظپظٹ ط§ظ„ط®ط·ط©.
  // âڑ ï¸ڈ ط§ظ„ظپط§طµظ„ ظƒظ„ظ…ط© "ظ…ظ†" ظ…ط´ ط´ط±ط·ط© ظ…ط§ظٹظ„ط©طŒ ظˆط§ظ„ط£ط±ظ‚ط§ظ… ط¹ط±ط¨ظٹط©-ظ‡ظ†ط¯ظٹط© â€”
  // ط´ط¸ظٹط© ط²ظٹ "3 / 14" ط¬ظˆظ‡ RTL ط§ظ„ظ…طھطµظپط­ ط¨ظٹظ‚ظ„ط¨ظ‡ط§ ظپطھط·ظ„ط¹ "14 / 3". ط§ظ„ط­ظ„
  // ط§ظ„ظ…ط¹طھط§ط¯ ظƒظ„ط§ط³ .ltr-numطŒ ط¨ط³ ط¯ظ‡ prop ظ†طµظٹ ظ…ط´ JSX ظپظ…ط§ظپظٹط´ ظ…ظƒط§ظ† ظ„ظ€ spanطŒ
  // ظپط§ظ„ظƒظ„ظ…ط§طھ ط§ظ„ط¹ط±ط¨ظٹط© ظ‡ظٹ ط§ظ„ظ„ظٹ ط¨طھط¹ط²ظ„ ط§ظ„ط£ط±ظ‚ط§ظ… ظ‡ظ†ط§.
  const headerSubtitle =
    days.length > 0
      ? `${uiText.stepPrefix} ${currentDayNumber.toLocaleString("ar-EG")} ظ…ظ† ${days.length.toLocaleString("ar-EG")} ظپظٹ ${config.subject}`
      : `ط®ط·طھظƒ ظپظٹ ${config.subject} ط¬ط§ظ‡ط²ط© طھط¨ط¯ط£`;

  const chapters = Array.from({ length: Math.ceil(days.length / CHAPTER_SIZE) }, (_, i) => {
    const chapterDays = days.slice(i * CHAPTER_SIZE, i * CHAPTER_SIZE + CHAPTER_SIZE);
    return {
      chapterNumber: i + 1,
      isComplete: chapterDays.length > 0 && chapterDays.every((d) => d.isCompleted),
      topics: chapterDays.map((d) => d.topic),
    };
  });

  // âœ… ط¨ظ†ط§ط، ظ‚ط§ط¦ظ…ط© ظ…ظ‡ط§ظ… ط§ظ„ظٹظˆظ… ظ„ظƒط§ط±طھ "ظ…ط§ط¬ظٹظƒ" (AI Study Coach)
  const currentTaskForCoach = days.find((d) => d.day === currentDayNumber);
  const reviewFlashcardsCount = flashcards.filter((c) => c.status === "review").length;

  const coachTasks: CoachTask[] = [];
  if (currentTaskForCoach && !currentTaskForCoach.isCompleted) {
    coachTasks.push({
      id: `lesson-${currentTaskForCoach.day}`,
      label: `${uiText.stepPrefix} ${currentTaskForCoach.day}: ${currentTaskForCoach.topic}`,
      icon: "ًں“ک",
    });
  }
  if (reviewFlashcardsCount > 0) {
    coachTasks.push({ id: "flashcards-review", label: `ظ…ط±ط§ط¬ط¹ط© ${reviewFlashcardsCount} ط¨ط·ط§ظ‚ط© ظ…ط­طھط§ط¬ط© طھط±ظƒظٹط²`, icon: "ًں”پ" });
  }

  const nextLockedDay = currentDayNumber + 1;
  const canUnlockNextDayEarly = nextLockedDay <= days.length && !earlyUnlockedDays.includes(nextLockedDay);

  const handleUnlockNextDayEarly = () => {
    if (!canUnlockNextDayEarly) return;
    if (xp < 150) {
      alert("ط¹ط°ط±ط§ظ‹طŒ ظ…ط­طھط§ط¬ 150 XP ط¹ظ„ظ‰ ط§ظ„ط£ظ‚ظ„ ط¹ط´ط§ظ† طھظپطھط­ ط§ظ„ظٹظˆظ… ط¯ظ‡ ط¨ط¯ط±ظٹ! ًںک…");
      return;
    }
    setXp((prev) => prev - 150);
    setEarlyUnlockedDays((prev) => [...prev, nextLockedDay]);
    alert(`طھظ… ظپطھط­ ${uiText.stepPrefix} ${nextLockedDay} ط¨ط¯ط±ظٹ! ًںژ‰ طھظ‚ط¯ط± ط¯ظ„ظˆظ‚طھظٹ طھط´ظˆظپظ‡ ظˆطھظپطھط­ظ‡.`);
    setShowShopModal(false);
  };

  const sortedActivityDates = Object.keys(activityLog).sort();
  const lastActiveDateKey = sortedActivityDates.length > 0 ? sortedActivityDates[sortedActivityDates.length - 1] : null;
  const daysSinceLastActivity = lastActiveDateKey
    ? Math.floor((new Date(new Date().toISOString().slice(0, 10)).getTime() - new Date(lastActiveDateKey).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const showLagWarning = daysSinceLastActivity !== null && daysSinceLastActivity >= 2 && overallProgress < 100;

  const ARABIC_WEEKDAYS = ["ط£ط­ط¯", "ط§ط«ظ†ظٹظ†", "ط«ظ„ط§ط«ط§ط،", "ط£ط±ط¨ط¹ط§ط،", "ط®ظ…ظٹط³", "ط¬ظ…ط¹ط©", "ط³ط¨طھ"];

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
    return { label: weeksAgo === 0 ? "ظ‡ط°ط§ ط§ظ„ط£ط³ط¨ظˆط¹" : `ظ‚ط¨ظ„ ${weeksAgo} ط£ط³ط¨ظˆط¹`, minutes, tasks };
  });

  const activeChartData = analyticsRange === "weekly" ? weeklyChartData : monthlyChartData;
  const weeklyFocusMinutesTotal = weeklyChartData.reduce((sum, d) => sum + d.minutes, 0);
  const weeklyFocusHoursLabel = `${Math.floor(weeklyFocusMinutesTotal / 60)}ط³ ${weeklyFocusMinutesTotal % 60}ط¯`;

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

  // Primary experience check â€” DISABLED: unified design for all stages
  const isPrimary = false;

  // Primary: handlers to link subject/lesson + AI assistant (real study)
  const handlePrimarySubjectAi = (subjectName: string) => {
    const matched = days.find((d) => d.topic.includes(subjectName) || d.title.includes(subjectName) || config?.subject === subjectName);
    openUnifiedChat(matched ?? null, subjectName);
  };

  const handlePrimaryOpenLesson = (subjectName?: string) => {
    let target: StudyDay | undefined;
    if (subjectName) {
      target = days.find((d) => d.topic.includes(subjectName) || d.title.includes(subjectName));
    }
    if (!target) target = days.find((d) => d.day === currentDayNumber) || days[0];
    if (target?.id && !String(target.id).startsWith("primary-")) {
      router.push(`/lesson/${target.id}`);
    } else if (target) {
      openUnifiedChat(target);
    } else if (subjectName) {
      handlePrimarySubjectAi(subjectName);
    } else if (config?.subject) {
      handlePrimarySubjectAi(config.subject);
    }
  };

  // Safe boundary for primary â€” never crash generic dashboard
  // Note: JSX errors are caught by React error boundaries, not try/catch.
  // We keep a simple null guard here; full boundary is PrimaryDashboard's own internal guards.
  const primaryDashboardSafe = !isPrimary ? null : (
    <PrimaryErrorBoundary>
      <PrimaryDashboard
      displayName={displayName}
      personalContext={personalAssistantContext}
      subjects={eduSubjects}
      subjectsLoading={eduLoading}
      subjectsError={eduError}
      gradeName={primaryGradeName}
      completed={completedCount}
      total={days.length}
      progressPct={overallProgress}
      currentDay={currentDayNumber}
      days={days}
      config={config}
      onOpenAi={handlePrimarySubjectAi}
      onOpenLesson={handlePrimaryOpenLesson}
      />
    </PrimaryErrorBoundary>
  );

  const isPreparatory = false; // DISABLED: unified design for all stages

  const preparatoryDashboardSafe = !isPreparatory ? null : (
    <PrimaryErrorBoundary>
      <PreparatoryDashboard
        displayName={displayName}
        personalContext={personalAssistantContext}
        subjects={eduSubjects}
        subjectsLoading={eduLoading}
        subjectsError={eduError}
        gradeName={primaryGradeName}
        completed={completedCount}
        total={days.length}
        progressPct={overallProgress}
        currentDay={currentDayNumber}
        days={days}
        config={config}
        onOpenAi={handlePrimarySubjectAi}
        onOpenLesson={handlePrimaryOpenLesson}
      />
    </PrimaryErrorBoundary>
  );

  const isSecondary = false; // طھظ… طھط¹ط·ظٹظ„ظ‡ ط¹ظ…ط¯ظ‹ط§: ط§ظ„ط«ط§ظ†ظˆظٹ ظپط£ط¹ظ„ظ‰ ظٹط³طھط®ط¯ظ… ط§ظ„طھطµظ…ظٹظ… ط§ظ„ظƒط§ظ…ظ„ (ط§ظ„ط¹ط¬ظ„ط©)

  const secondaryDashboardSafe = !isSecondary ? null : (
    <PrimaryErrorBoundary>
      <SecondaryDashboard
        displayName={displayName}
        personalContext={personalAssistantContext}
        subjects={eduSubjects}
        subjectsLoading={eduLoading}
        subjectsError={eduError}
        gradeName={primaryGradeName}
        trackName={trackName}
        completed={completedCount}
        total={days.length}
        progressPct={overallProgress}
        currentDay={currentDayNumber}
        days={days}
        config={config}
        onOpenAi={handlePrimarySubjectAi}
        onOpenLesson={handlePrimaryOpenLesson}
      />
    </PrimaryErrorBoundary>
  );

  const isBaccalaureate = false; // ظ†ظپط³ ط§ظ„ط³ط¨ط¨: ط§ظ„ط¨ظƒط§ظ„ظˆط±ظٹط§ ظپط£ط¹ظ„ظ‰ ظٹط³طھط®ط¯ظ… ط§ظ„طھطµظ…ظٹظ… ط§ظ„ظƒط§ظ…ظ„ (ط§ظ„ط¹ط¬ظ„ط©)

  const baccalaureateDashboardSafe = !isBaccalaureate ? null : (
    <PrimaryErrorBoundary>
      <BaccalaureateDashboard
        displayName={displayName}
        personalContext={personalAssistantContext}
        subjects={eduSubjects}
        subjectsLoading={eduLoading}
        subjectsError={eduError}
        gradeName={primaryGradeName}
        trackName={trackName}
        completed={completedCount}
        total={days.length}
        progressPct={overallProgress}
        currentDay={currentDayNumber}
        days={days}
        config={config}
        onOpenAi={handlePrimarySubjectAi}
        onOpenLesson={handlePrimaryOpenLesson}
      />
    </PrimaryErrorBoundary>
  );

  const isUniversity = false; // ظ†ظپط³ ط§ظ„ط³ط¨ط¨: ط§ظ„ط¬ط§ظ…ط¹ط© ظˆط§ظ„ط®ط±ظٹط¬ظٹظ† ظٹط³طھط®ط¯ظ…ظˆظ† ط§ظ„طھطµظ…ظٹظ… ط§ظ„ظƒط§ظ…ظ„ (ط§ظ„ط¹ط¬ظ„ط©)

  const universityDashboardSafe = !isUniversity ? null : (
    <PrimaryErrorBoundary>
      <UniversityDashboard
        displayName={displayName}
        personalContext={personalAssistantContext}
        subjects={eduSubjects}
        subjectsLoading={eduLoading}
        subjectsError={eduError}
        facultyName={facultyName}
        departmentName={departmentName}
        completed={completedCount}
        total={days.length}
        progressPct={overallProgress}
        currentDay={currentDayNumber}
        days={days}
        config={config}
        onOpenAi={handlePrimarySubjectAi}
        onOpenLesson={handlePrimaryOpenLesson}
      />
    </PrimaryErrorBoundary>
  );

  return (
    <div
      className="min-h-screen p-4 sm:p-6 md:p-10 lg:pe-[16.5rem] xl:pe-[18.5rem] font-sans relative pb-24"
      style={{
        backgroundColor: "var(--app-bg)",
        backgroundImage: "var(--app-bg-image)",
        color: "var(--text)",
      }}
      dir="rtl"
    >
      {/* ًںژ§ ط¹ظ†طµط± ط§ظ„ظ€ <audio> ظˆط§ظ„ظ…ط´ط؛ظ‘ظ„ ط§ظ„ط¹ط§ط¦ظ… ط¨ظ‚ظˆط§ ظپظٹ `AudioProvider` ط¬ظˆظ‡
          app/layout.tsx â€” ط¹ط´ط§ظ† ط§ظ„طµظˆطھ ظٹظپط¶ظ„ ط´ط؛ظ‘ط§ظ„ ظ„ظ…ط§ طھظ†طھظ‚ظ„ ظ„ط£ظٹ طµظپط­ط©. */}

      {/* ًں“‘ ظپظ‡ط±ط³ ط§ظ„ط£ظ‚ط³ط§ظ…: ط´ط±ظٹط· ط«ط§ط¨طھ ظٹظ…ظٹظ† ط¹ظ„ظ‰ ط§ظ„ط´ط§ط´ط§طھ ط§ظ„ظƒط¨ظٹط±ط©طŒ ظˆط´ط±ظٹط· ط£ظپظ‚ظٹ
          ط¨ظٹطھط³ظƒط±ظˆظ„ ظپظˆظ‚ ط§ظ„ظ…ط­طھظˆظ‰ ظپظٹ ط§ظ„ظ…ظˆط¨ط§ظٹظ„. ط§ظ„ط­ط´ظˆ ط§ظ„ط¥ط¶ط§ظپظٹ ظپظˆظ‚ (lg:pe) ظ‡ظˆ
          ط§ظ„ظ„ظٹ ط¨ظٹظ…ظ†ط¹ ط§ظ„ظ…ط­طھظˆظ‰ ظ…ظ† ط¥ظ†ظ‡ ظٹط¯ط®ظ„ طھط­طھ ط§ظ„ط´ط±ظٹط· ط§ظ„ط«ط§ط¨طھ. */}
      <NavRail
        themeStyles={themeStyles}
        // ًں—“ï¸ڈ ظ¨ ط£ط؛ط³ط·ط³: ط§ظ„ط´ط±ظٹط· ط§ظ„ط¹ظ„ظˆظٹ ط§طھط´ط§ظ„طŒ ظپظƒظ„ ط£ط¯ظˆط§طھظ‡ ط¨طھظˆطµظ„ ظ…ظ† ظ‡ظ†ط§.
        // ط£ظٹ ط¥ط´ط§ط±ط© ط¬ط¯ظٹط¯ط© طھطھط²ظˆظ‘ط¯ ظپظٹ nav-config.ts ظˆط§ظ„ظ€ switch ط¯ظ‡ ظٹطھظˆط³ظ‘ط¹.
        onSignal={handleNavSignal}
        motivation={{ level, streak }}
        account={railAccountFromUser(authUser)}
        emergencyOn={isEmergencyMode}
        audioOn={isPlayingAudio}
      />

      {/* â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
          ط¨ظˆط§ط¨ط© ط§ظ„طھظ†ظ‚ظ„ ط§ظ„ط¯ط§ط¦ط±ظٹط© â€” ط¹ط¬ظ„ط© ظ…ط§ط¬ظٹظƒ (NEW)
          طھظڈط¶ط§ظپ ظپظˆظ‚ ظƒظ„ ط§ظ„ظ…ط¬ظ…ظˆط¹ط§طھ ط§ظ„ط­ط§ظ„ظٹط© ط¨ط¯ظˆظ† طھط؛ظٹظٹط± ط£ظٹ ظ‚ط³ظ… ظ…ظˆط¬ظˆط¯.
          â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ */}
      <div className="relative -mt-4 mb-6 md:mb-8 dashboard-entrance" style={{ animationDelay: "0ms" }}>
        <div className="motion-safe:animate-[wheelPulse_2.8s_ease-in-out_infinite] motion-reduce:animate-none">
        <MagicWheelDashboard
          currentDay={currentDayNumber}
          totalDays={days.length}
          subject={config?.subject ?? ""}
          completedSteps={completedCount}
          progressPct={overallProgress}
          currentChapter={chapters.find((c) => c.isComplete === false)?.chapterNumber ?? chapters.at(-1)?.chapterNumber ?? 1}
          streak={streak}
          coursesCount={coursesCount}
          subjectBreakdown={subjectBreakdown}
          activeChartData={activeChartData}
          analyticsRange={analyticsRange}
          onChangeRange={setAnalyticsRange}
          weeklyFocusHoursLabel={weeklyFocusHoursLabel}
          notificationsEnabled={notificationsEnabled}
          onOpenSettings={() => setIsMenuOpen(true)}
        />
        </div>
      </div>

      <div className="max-w-6xl mx-auto mb-6">
        <div className="rounded-2xl border border-[#2A3050] bg-[#13182E] p-5">
          <h2 className="text-lg font-extrabold mb-3">رحلة اليوم</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {[
              { label: "1. خطة", done: days.length > 0 },
              { label: "2. درس اليوم", done: days.length > 0 && completedCount < days.length ? false : days.length > 0 && completedCount >= 1 },
              { label: "3. مراجعة", done: completedCount > 0 },
              { label: "4. تقدم", done: overallProgress >= 50 },
            ].map((s) => (
              <span key={s.label} className={`px-3 py-1 rounded-full text-xs font-bold ${s.done ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-500/20 text-slate-300"}`}>{s.label}</span>
            ))}
          </div>
          {days.length === 0 ? (
            <a href="/dashboard/create" className="inline-block px-5 py-2.5 rounded-xl bg-violet-500/20 text-violet-300 font-bold">أنشئ خطة للبدء</a>
          ) : completedCount >= days.length ? (
            <a href="/dashboard/progress" className="inline-block px-5 py-2.5 rounded-xl bg-emerald-500/20 text-emerald-300 font-bold">راجع تقدمك</a>
          ) : (
            <a href="/dashboard/courses" className="inline-block px-5 py-2.5 rounded-xl bg-violet-500/20 text-violet-300 font-bold">ابدأ درس اليوم</a>
          )}
        </div>
      </div>
      <div className="max-w-6xl mx-auto space-y-10">
        {isPrimary && primaryDashboardSafe ? (
          <div className="space-y-6">
            {primaryDashboardSafe}
            {/* Keep NavRail functional but hide heavy generic sections for primary */}
            <details className="group rounded-[var(--r-sm)] border border-rule bg-paper">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-ink hover:bg-paper-3 transition [&::-webkit-details-marker]:hidden">
                <span>ط§ظ„ظ…ط²ظٹط¯ ظ…ظ† ط£ط¯ظˆط§طھظƒ</span>
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-rule bg-paper-3 text-ink-soft transition group-open:rotate-180" aria-hidden>â–¾</span>
              </summary>
              <div className="border-t border-rule p-4">
                <p className="text-xs text-ink-soft">ظ‡ظ†ط§ ظ‡طھظ„ط§ظ‚ظٹ ط£ط¯ظˆط§طھ ط¥ط¶ط§ظپظٹط© ظ„ظ…ط§ طھظƒط¨ط± ط´ظˆظٹط© â€” ط¯ظ„ظˆظ‚طھظٹ ط±ظƒط² ط¹ظ„ظ‰ ظ…ظˆط§ط¯ظƒ ظˆط®ط·ظˆطھظƒ ط§ظ„ظٹظˆظ… ًںŒں</p>
              </div>
            </details>
          </div>
        ) : isPreparatory && preparatoryDashboardSafe ? (
          <div className="space-y-6">
            {preparatoryDashboardSafe}
            <details className="group rounded-[var(--r-sm)] border border-rule bg-paper">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-ink hover:bg-paper-3 transition [&::-webkit-details-marker]:hidden">
                <span>ط§ظ„ظ…ط²ظٹط¯ ظ…ظ† ط£ط¯ظˆط§طھظƒ</span>
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-rule bg-paper-3 text-ink-soft transition group-open:rotate-180" aria-hidden>â–¾</span>
              </summary>
              <div className="border-t border-rule p-4">
                <p className="text-xs text-ink-soft">ط£ط¯ظˆط§طھ ط¥ط¶ط§ظپظٹط© ط³طھط¸ظ‡ط± ظ‡ظ†ط§ ط­ط³ط¨ طھظ‚ط¯ظ…ظƒ â€” ط±ظƒط² ط§ظ„ط¢ظ† ط¹ظ„ظ‰ ط®ط·ط© ط§ظ„ظٹظˆظ… ظˆط§ظ„ظ…ط±ط§ط¬ط¹ط©</p>
              </div>
            </details>
          </div>
        ) : isSecondary && secondaryDashboardSafe ? (
          <div className="space-y-6">
            {secondaryDashboardSafe}
            <details className="group rounded-[var(--r-sm)] border border-rule bg-paper">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-ink hover:bg-paper-3 transition [&::-webkit-details-marker]:hidden">
                <span>ط§ظ„ظ…ط²ظٹط¯ ظ…ظ† ط£ط¯ظˆط§طھظƒ</span>
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-rule bg-paper-3 text-ink-soft transition group-open:rotate-180" aria-hidden>â–¾</span>
              </summary>
              <div className="border-t border-rule p-4">
                <p className="text-xs text-ink-soft">ط£ط¯ظˆط§طھ ط¥ط¶ط§ظپظٹط© â€” ط±ظƒط² ط¹ظ„ظ‰ ط®ط·ط© ط§ظ„ط«ط§ظ†ظˆظٹ ظˆظ…ط±ط§ط¬ط¹ط© ط§ظ„ظ…ط³ط§ط±</p>
              </div>
            </details>
          </div>
        ) : isBaccalaureate && baccalaureateDashboardSafe ? (
          <div className="space-y-6">
            {baccalaureateDashboardSafe}
            <details className="group rounded-[var(--r-sm)] border border-rule bg-paper">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-ink hover:bg-paper-3 transition [&::-webkit-details-marker]:hidden">
                <span>ط§ظ„ظ…ط²ظٹط¯ ظ…ظ† ط£ط¯ظˆط§طھظƒ</span>
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-rule bg-paper-3 text-ink-soft transition group-open:rotate-180" aria-hidden>â–¾</span>
              </summary>
              <div className="border-t border-rule p-4">
                <p className="text-xs text-ink-soft">ط£ط¯ظˆط§طھ ط§ظ„ط¨ظƒط§ظ„ظˆط±ظٹط§ ط§ظ„ط¥ط¶ط§ظپظٹط© â€” ط±ظƒط² ط¹ظ„ظ‰ ظ…ط³ط§ط±ظƒ ظˆط®ط·ط© ط§ظ„ط¬ط§ظ…ط¹ط©</p>
              </div>
            </details>
          </div>
        ) : isUniversity && universityDashboardSafe ? (
          <div className="space-y-6">
            {universityDashboardSafe}
            <details className="group rounded-[var(--r-sm)] border border-rule bg-paper">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-ink hover:bg-paper-3 transition [&::-webkit-details-marker]:hidden">
                <span>ط§ظ„ظ…ط²ظٹط¯ ظ…ظ† ط£ط¯ظˆط§طھظƒ ط§ظ„ط¬ط§ظ…ط¹ظٹط©</span>
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-rule bg-paper-3 text-ink-soft transition group-open:rotate-180" aria-hidden>â–¾</span>
              </summary>
              <div className="border-t border-rule p-4">
                <p className="text-xs text-ink-soft">ط£ط¯ظˆط§طھ ط¬ط§ظ…ط¹ظٹط© ط¥ط¶ط§ظپظٹط© â€” ظ…ط´ط§ط±ظٹط¹طŒ ظ…ط±ط§ط¬ط¹طŒ ظˆطھط®طµطµظƒ</p>
              </div>
            </details>
          </div>
        ) : (
          <>
        {/* â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
            ًںژ¯ First Session â€” "ظ…ط§ط°ط§ طھط±ظٹط¯ ط£ظ† طھظپط¹ظ„ ط§ظ„ظٹظˆظ…طں"
            Control Center entry point: ظٹط¸ظ‡ط± ط£ظˆظ„ط§ظ‹طŒ ظٹظˆط¬ظ‘ظ‡ ط§ظ„ظ†ظٹط©طŒ
            ط«ظ… Stats + Quick Nav + Focus + ط¨ط§ظ‚ظٹ ط§ظ„ط£ظ‚ط³ط§ظ… ظƒظ…ط§ ظ‡ظٹ.
            ط§ظ„ط¨ظٹط§ظ†ط§طھ ظƒظ„ظ‡ط§ ط­ظ‚ظٹظ‚ظٹط© ظ…ظ† ط­ط§ظ„ط© ط§ظ„طµظپط­ط© (days/completedCount).
            â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ */}
        <div className="dashboard-entrance" style={{ animationDelay: "0ms" }}>
          <FirstSession
            completedSteps={completedCount}
            totalSteps={days.length}
            progressPct={overallProgress}
            subject={config?.subject ?? ""}
            currentDayId={(currentTaskForCoach as unknown as { id?: string })?.id ?? null}
            onContinue={() => {
              const el = document.getElementById(`day-${currentDayNumber}`);
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                return;
              }
              // fallback: ظ„ظˆ ط§ظ„ظ‚ط³ظ… ظ…ط·ظˆظٹ ط£ظˆ ط؛ظٹط± ظ…ظˆط¬ظˆط¯طŒ ط§ظپطھط­ظ‡
              const details = document.querySelector("details") as HTMLDetailsElement | null;
              if (details && !details.open) details.open = true;
            }}
            onOpenAi={handleOpenAiAssistant}
          />
        </div>
        <div className="space-y-6 dashboard-entrance" style={{ animationDelay: "40ms" }}>
          <DashboardStats
            streak={streak}
            progressPct={days.length > 0 ? overallProgress : null}
            notificationsCount={null}
            coursesCount={coursesCount}
          />
        </div>
        <div className="space-y-6 dashboard-entrance" style={{ animationDelay: "40ms" }}>
          <QuickNavigation
            items={buildQuickNavItems({
              onOpenAi: handleOpenAiAssistant,
              onOpenSettings: () => setIsMenuOpen(true),
            })}
          />
        </div>
        <div className="space-y-6 dashboard-entrance" style={{ animationDelay: "80ms" }}>
          <TodayFocus
            currentDay={currentTaskForCoach ?? null}
            progressPct={days.length > 0 ? overallProgress : null}
            totalSteps={days.length}
            completedSteps={completedCount}
            subject={config?.subject ?? ""}
            onContinue={() => {
              const el = document.getElementById(`day-${currentDayNumber}`);
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          />
        </div>

        {/* â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
            GROUP A â€” ط§ظ„ظ‡ظˆظٹط© ظˆط§ظ„ظپط¹ظ„
            HeroCard â†’ CurrentStepCard â†’ ExamPlanCard (conditional)
            â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ */}
        <div className="space-y-6 dashboard-entrance" style={{ animationDelay: "0ms" }}>
          {/* â•گâ•گâ•گ ط§ظ„ظ‡ظٹط±ظˆ ط§ظ„ط¬ط¯ظٹط¯: طھط±ط­ظٹط¨ ط¨ط§ظ„ط§ط³ظ… ط§ظ„ط­ظ‚ظٹظ‚ظٹ + ط³ظ„ط³ظ„ط©/ظ…ط³طھظˆظ‰/طھظ‚ط¯ظ‘ظ… +
                  ط¥ط¬ط±ط§ط،ط§طھ ط³ط±ظٹط¹ط© (ط£ظƒظ…ظ„ ط§ظ„طھط¹ظ„ظ‘ظ… آ· ط§ظ„ظ…ط³ط§ط¹ط¯ ط§ظ„ط°ظƒظٹ آ· ط§ظ„ط¹ط¨ط§ط¯ط§طھ آ· ط§ظ„ظ…طھط¬ط±).
                  ظƒظ„ ط§ظ„ط£ط±ظ‚ط§ظ… ظ…ظ† ظ†ظپط³ ط­ط§ظ„ط© ط§ظ„طµظپط­ط© ط§ظ„ظ„ظٹ ط¨طھط؛ط°ظ‘ظٹ ط¨ط§ظ‚ظٹ ط§ظ„ط£ظ‚ط³ط§ظ…. â•گâ•گâ•گ */}
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
          {/* Phase 4.1A â€” Coins + AI Usage (real data, no new backend) */}
          <EconomyStrip />
          <PlanQuotaCard />
          {/* ═══ الخطوة الحالية: حلقة بنسبة الخطة الحقيقية + زر ديناميكي
                  (ابدأ / تابع / راجع) حسب حالة اليوم الفعلية — أهم CTA في الصفحة ═══ */}
          {/* â•گâ•گâ•گ ط§ظ„ط®ط·ظˆط© ط§ظ„ط­ط§ظ„ظٹط©: ط­ظ„ظ‚ط© ط¨ظ†ط³ط¨ط© ط§ظ„ط®ط·ط© ط§ظ„ط­ظ‚ظٹظ‚ظٹط© + ط²ط± ط¯ظٹظ†ط§ظ…ظٹظƒظٹ
                  (ط§ط¨ط¯ط£ / طھط§ط¨ط¹ / ط±ط§ط¬ط¹) ط­ط³ط¨ ط­ط§ظ„ط© ط§ظ„ظٹظˆظ… ط§ظ„ظپط¹ظ„ظٹط© â€” ط£ظ‡ظ… CTA ظپظٹ ط§ظ„طµظپط­ط© â•گâ•گâ•گ */}
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

          {/* Phase 0.1 â€” Daily Micro-Challenge */}
          <DailyMicroChallenge />

          {/* Phase 0.2 â€” Smart Contextual Notification (in-app only; zero DB; no push/cron) */}
          <ContextualNotification />

          {/* Phase 0.4 â€” Light Social Comparison (reuses weekly_quiz_leaderboard; no new DB) */}
          <LightSocialComparison />

          {/* ًںڑ¨ ط®ط·ط© ط§ظ„ط§ظ…طھط­ط§ظ† ط§ظ„ظ‚ط±ظٹط¨ â€” ط£ظ‡ظ… deadline ط¥ط°ط§ ظˆظڈط¬ط¯.
              ظ…ظƒط§ظ†ظ‡ط§ ط¨ط¹ط¯ CTA ظ…ط¨ط§ط´ط±ط© ط¹ظ† ظ‚طµط¯: ط§ظ„ظ„ظٹ ط¹ظ†ط¯ظ‡ ط§ظ…طھط­ط§ظ† ط¨ط¹ط¯ ظ£ ط£ظٹط§ظ… ظ„ط§ط²ظ… ظٹط´ظˆظپ
              ط§ظ„ظ…ط·ظ„ظˆط¨ ظ…ظ†ظ‡ ط§ظ„ظ†ظ‡ط§ط±ط¯ط© ظ‚ط¨ظ„ ط£ظٹ ط¥ط­طµط§ط¦ظٹط©. ط§ظ„ظƒط§ط±طھ ط¨ظٹط®ظپظٹ ظ†ظپط³ظ‡
              ظ„ظˆط­ط¯ظ‡ ظ„ظˆ ظ…ظپظٹط´ ط®ط·ط© ط´ط؛ط§ظ„ط©. */}
          {authUser && (
            // âڑ ï¸ڈ ط§ظ„ظ€ key ظپظٹظ‡ examPlanKey: ط§ظ„ظƒط§ط±طھ ط¨ظٹط¬ظٹط¨ ط§ظ„ط®ط·ط© ظ…ط±ط© ظˆط§ط­ط¯ط© ط¹ظ†ط¯
            // ط§ظ„طھط±ظƒظٹط¨طŒ ظپظ„ظˆ ط§ظ„ظ…ط³طھط®ط¯ظ… ط¹ظ…ظ„ ط®ط·ط© ظ…ظ† ط§ظ„ط´ط§طھ ط§ظ„ظƒط§ط±طھ ظƒط§ظ† ظ‡ظٹظپط¶ظ„ ظپط§ط¶ظٹ
            // ظ„ط­ط¯ ط±ظٹظپط±ظٹط´. طھط؛ظٹظٹط± ط§ظ„ظ€ key ط¨ظٹط¹ظٹط¯ طھط±ظƒظٹط¨ظ‡ ظپط¨ظٹط¬ظٹط¨ ط§ظ„ط®ط·ط© ط§ظ„ط¬ط¯ظٹط¯ط©.
            <ExamPlanCard
              key={examPlanKey}
              userId={authUser.id}
              themeStyles={themeStyles}
            />
          )}

          {/* â”€â”€ ط§ظ„طھط´ط®ظٹطµ: ظ†ظ‚ط·ط© ط¯ط®ظˆظ„ ظˆط§ط­ط¯ط© ط¨ط³ ظپظٹ Phase 3 â”€â”€
              ط¹ط§ظٹط²ظٹظ† ط§ظ„ط·ط§ظ„ط¨ ظٹظ„ط§ظ‚ظٹ ط§ظ„طھط´ط®ظٹطµ ظ…ظ† ط§ظ„ط¯ط§ط´ط¨ظˆط±ط¯طŒ ط¨ط³ ظ…ظ† ط؛ظٹط± ظƒط§ط±طھ
              ظ†طھظٹط¬ط© ظ‡ظ†ط§ â€” ط§ظ„ظ†طھظٹط¬ط© ظپظٹ /diagnostic ظ†ظپط³ظ‡ط§ (ط§ظ„ظ‚ط±ط§ط±: طھط£ط¬ظٹظ„
              ظƒط§ط±طھ ط§ظ„ط¯ط§ط´ط¨ظˆط±ط¯ ظ„ظ€ Wave طھط§ظ†ظٹط©). ط§ظ„ط±ط§ط¨ط· ط¨ظٹط®ظپظٹ ظ†ظپط³ظ‡ ظ„ظˆ ظ…ظپظٹط´
              ط£ط³ط¦ظ„ط© ظ…ظ†ط´ظˆط±ط©طŒ ط¹ط´ط§ظ† ظ…ط§ظٹط´ط¯ط´ ط­ط¯ ظ„طµظپط­ط© ظپط§ط¶ظٹط©. */}
          {authUser && (
            <Link
              href="/diagnostic"
              className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--rule)] bg-[var(--card)] px-4 py-3 transition hover:opacity-90"
            >
              <span className="flex items-center gap-2">
                <span aria-hidden>ًںژ¯</span>
                <span className="font-semibold">ط§ط¹ظ…ظ„ طھط´ط®ظٹطµ ط³ط±ظٹط¹</span>
              </span>
              <span className="text-sm text-[var(--muted-foreground)]">
                ظ،ظ  ط£ط³ط¦ظ„ط© آ· ط®ط·طھظƒ طھطھط¸ط¨ط· ط¹ظ„ظ‰ ط£ط³ط§ط³ ط§ظ„ظ†طھظٹط¬ط©
              </span>
            </Link>
          )}
        </div>

        {/* â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
            GROUP B â€” ط§ظ„ط³ظٹط§ظ‚ ط§ظ„ظٹظˆظ…ظٹ
            PersonalAssistant â†’ HeroSection / AIStudyCoach
            â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ */}
        <div className="space-y-6 dashboard-entrance" style={{ animationDelay: "60ms" }}>
          {/* â•گâ•گâ•گ ط§ظ„ظ…ط³ط§ط¹ط¯ ط§ظ„ط´ط®طµظٹ â”€ ط¨ظٹظ† ط§ظ„ظ‡ظٹط±ظˆ ظˆظƒط±ظˆطھ ط§ظ„ط£ط±ظ‚ط§ظ… â•گâ•گâ•گ */}
          <PersonalAssistant context={personalAssistantContext} />

          <HeroSection displayName={displayName} coachTasks={coachTasks} />
          <MagIdCard />
          <SubscriptionQuotaCard />
        </div>

        {/* â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
            GROUP C â€” ط§ظ„ط¹ظ…ظ„ ط§ظ„ط­ظ‚ظٹظ‚ظٹ (ظ…ط­ظپظˆط¸ ظ„ظƒظ† ط¨ط¯ظˆظ† ط§ط­طھظ„ط§ظ„ ظ…ط³ط§ط­ط© ط¶ط®ظ…ط© ظپظٹ Preview)
            StudySections wrapped in collapsible <details> per task آ§5.
            â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ */}
        <details className="group rounded-2xl border border-[var(--rule)] bg-[var(--card-primary)]" open>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold" style={{ color: "var(--text)" }}>
            <span className="flex items-center gap-2"><span aria-hidden>ًں“ڑ</span> ط§ظ„ظ…ظˆط§ط¯ ط§ظ„ط¯ط±ط§ط³ظٹط©</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--rule)] bg-[var(--card-secondary)] text-[var(--muted)] transition group-open:rotate-180" aria-hidden>â–¾</span>
          </summary>
          <div className="border-t border-[var(--rule)] p-4">
            <p className="mb-3 text-xs leading-5" style={{ color: "var(--muted)" }}>ظ‡ط°ط§ ط§ظ„ظ‚ط³ظ… ظƒط§ظ† ظٹط­طھظ„ ظ…ط³ط§ط­ط© ظƒط¨ظٹط±ط© ظپظٹ ط§ظ„ظ€Dashboard. ظپظٹ Preview طھظ… طھطµط؛ظٹط±ظ‡ ط¯ط§ط®ظ„ ط¹ظ†طµط± ظ‚ط§ط¨ظ„ ظ„ظ„ط·ظٹ â€” ط§ظ„ظ…ط­طھظˆظ‰ ظˆط§ظ„ط¨ظٹط§ظ†ط§طھ ظ†ظپط³ظ‡ط§ ظ…ط­ظپظˆط¸ط©طŒ ظˆط§ظ„ظˆطµظˆظ„ ط§ظ„ظƒط§ظ…ظ„ ط¹ط¨ط± <span style={{ color: "var(--text)" }}>/dashboard/courses</span>.</p>
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
          onOpenAiLesson={(day) => openUnifiedChat(day)}
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
          </div>
        </details>

      {/* â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
          GROUP C-EXTRA â€” ظƒط§ط±ط¯ط§طھ ط¥ط¶ط§ظپظٹط© (ط±ط¨ط· ط¨ط¨ظٹط§ظ†ط§طھ DB ط­ظ‚ظٹظ‚ظٹط©)
          â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ */}
      <div className="dashboard-entrance grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TodayPlanCard
          currentDayNumber={currentDayNumber}
          daysLength={days.length}
          subject={config?.subject ?? ""}
          completedCount={completedCount}
          chapters={chapters}
          currentChapter={chapters.find((c) => !c.isComplete)?.chapterNumber ?? chapters.at(-1)?.chapterNumber ?? 1}
        />
        <DailyMissionsCard
          pendingGoals={pendingGoals as any}
          completedToday={days.filter((d) => d.isCompleted).length}
        />
        <WeeklyProgressCard
          weeklyChartData={weeklyChartData}
          monthlyChartData={monthlyChartData}
          analyticsRange={analyticsRange}
          weeklyFocusHoursLabel={weeklyFocusHoursLabel}
        />
        <CompanionStatusCard
          level={level}
          xp={xp}
          streak={streak}
          levelProgressPct={currentLevelProgress}
          companionName={companion?.name ?? "ط±ظپظٹظ‚ظƒ"}
          hidden={companion?.hidden ?? true}
        />
      </div>

        {/* â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
            GROUP D â€” ط§ظ„ط£ط±ظ‚ط§ظ… ظˆط§ظ„طھظ‚ط¯ظ‘ظ…
            ظƒظ„ progress/metrics ظپظٹ ظ…ظ†ط·ظ‚ط© ظˆط§ط­ط¯ط© ط¨ط¹ط¯ ط§ظ„ط¹ظ…ظ„ ط§ظ„ط­ظ‚ظٹظ‚ظٹ
            â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ */}
        <div className="space-y-6 dashboard-entrance" style={{ animationDelay: "180ms" }}>
          {/* â•گâ•گâ•گ AI Tools Hub طھظ… ظ†ظ‚ظ„ظ‡ط§ ظ„طµظپط­ط© /dashboard/agents â€” ظ„ط§ طھط¹ط±ط¶ ظ‡ظ†ط§ â•گâ•گâ•گ */}

          {/* â•گâ•گâ•گ ظƒط±ظˆطھ ط§ظ„ط£ط±ظ‚ط§ظ…: XP آ· ط§ظ„ط³ظ„ط³ظ„ط© آ· ط®ط·ظˆط§طھ ظ…ظƒطھظ…ظ„ط© آ· طھط±ظƒظٹط² ط§ظ„ط£ط³ط¨ظˆط¹
                  â€” ط¹ط¯ظ‘ ظ…ظ† طµظپط± ظ…ط±ط© ظˆط§ط­ط¯ط© ط¨ط®ط· ط§ظ„ظ…ظˆظ†ظˆ â•گâ•گâ•گ */}
          <StatCards
            xp={xp}
            streak={streak}
            completedSteps={completedCount}
            weeklyFocusMinutes={weeklyFocusMinutesTotal}
          />

          {/* 📊 طبقة المراجعة: "إنت عملت إيه الأسبوع ده" و "إيه الجاي" */}

          {/* كارت الكود الشخصي (QR) — يظهر في مكان واضح فور دخول الداشبورد */}
          <UserQrCard />
          {/* ًں“ٹ ط·ط¨ظ‚ط© ط§ظ„ظ…ط±ط§ط¬ط¹ط©: "ط¥ظ†طھ ط¹ظ…ظ„طھ ط¥ظٹظ‡ ط§ظ„ط£ط³ط¨ظˆط¹ ط¯ظ‡" ظˆ "ط¥ظٹظ‡ ط§ظ„ط¬ط§ظٹ" */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <WeeklyProgress data={weeklyChartData} themeStyles={themeStyles} />
            {/* ًںگ£ ط§ظ„ط±ظپظٹظ‚ طھط­طھ ط§ظ„ط¥ظ†ط¬ط§ط²ط§طھ ظپظٹ ظ†ظپط³ ط§ظ„ط¹ظ…ظˆط¯ ظ…ط´ ط®ط§ظ†ط© طھط§ظ„طھط© ظپظٹ
                ط§ظ„ط´ط¨ظƒط©: ط§ظ„ط´ط¨ظƒط© ط¹ظ…ظˆط¯ظٹظ†طŒ ظˆط§ظ„طھط§ظ„طھ ظƒط§ظ† ظ‡ظٹط³ظٹط¨ ظپط±ط§ط؛ ط¬ظ†ط¨ظ‡ ط¹ظ„ظ‰
                ط§ظ„ط´ط§ط´ط© ط§ظ„ظƒط¨ظٹط±ط©. ظˆط§ظ„ط¹ظ…ظˆط¯ ط¯ظ‡ ط£ظ‚طµط± ظ…ظ† ط§ظ„ط±ط³ظ… ط§ظ„ط¨ظٹط§ظ†ظٹ ط£طµظ„ط§ظ‹. */}
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
                  ط±ط¬ظ‘ط¹ ط±ظپظٹظ‚ظƒ
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

          {/* Phase 4: Progressive disclosure â€” collapsed by default, preserves id="analytics" for nav scroll. */}
          <details id="analytics" className="scroll-mt-6 group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[var(--r-sm)] border border-rule bg-paper px-4 py-3 text-sm font-semibold text-ink hover:bg-paper-3 transition [&::-webkit-details-marker]:hidden marker:content-none">
              <span>ظ…ط²ظٹط¯ ظ…ظ† ط§ظ„طھط­ظ„ظٹظ„ط§طھ</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-rule bg-paper-3 text-ink-soft transition group-open:rotate-180" aria-hidden>
                â–¾
              </span>
            </summary>
            <div className="mt-4">
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
            </div>
          </details>
        </div>

        {/* â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
            GROUP E â€” ط§ظ„ط¹ط¨ط§ط¯ط§طھ
            Worship CTA â†’ QuranSection
            â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ */}
        <div className="space-y-6 dashboard-entrance" style={{ animationDelay: "240ms" }}>
          {/* ًں“– ط¨ظˆط§ط¨ط© ط§ظ„ط¹ط¨ط§ط¯ط§طھ â€” طھط¨ظ‚ظ‰ ظ‚ط¨ظ„ ط§ظ„ظ‚ط±ط¢ظ† ظ…ط¨ط§ط´ط±ط© */}
          <Link href="/worship" className="block">
            <button
              type="button"
              aria-label="ط¹ط¨ط§ط¯ط§طھظٹ â€” Worship Center"
              className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl bg-gradient-to-l from-[#2DD4BF]/10 to-[#7C5CFF]/10 border border-[#2DD4BF]/20 hover:border-[#7C5CFF]/40 transition-colors text-right"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#2DD4BF]/15 text-[#2DD4BF] text-xl">ًں•Œ</span>
              <div className="min-w-0">
                <h3 className="font-bold text-white leading-snug">ط¹ط¨ط§ط¯ط§طھظٹ â€” Worship Center</h3>
                <p className="text-sm text-[#B69CFF]">ظ…ظˆط§ظ‚ظٹطھ ط§ظ„طµظ„ط§ط© آ· ط§ظ„ط£ط°ظƒط§ط± آ· ط§ظ„ظ‚ط±ط¢ظ† آ· ط§ظ„طھط³ط¨ظٹط­</p>
              </div>
              <ArrowLeft size={18} className="mr-auto text-[#9AA0C0] shrink-0" aria-hidden />
            </button>
          </Link>

          {/* ًں“– ط§ظ„ظ‚ط±ط¢ظ†: ط§ظ„ظƒط§ط±طھ ظ…ط®طھطµط± â€” ط¢ط®ط± ط³ظˆط±ط© + ظ¦ ط³ظˆط± + ط±ط§ط¨ط· ط§ظ„ظ…ظƒطھط¨ط©.
              ط§ظ„طµظˆطھ ط¹ط§ظٹط´ ظپظٹ AudioProvider ظپط§ظ„ط³ظˆط±ط© ط¨طھظƒظ…ظ‘ظ„ ظپظٹ ط£ظٹ طµظپط­ط©. */}
          <QuranSection
            themeStyles={themeStyles}
            onOpenLibrary={() => {
              setSettingsFocus("sound");
              setIsMenuOpen(true);
            }}
          />
        </div>

        {/* â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
            GROUP F â€” ط§ظ„ط«ط§ظ†ظˆظٹ
            â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ */}
        {/* ًں‘¥ ط¯ط¹ظˆط© ط§ظ„ط¬ط±ظˆط¨ ظپظٹ ط¢ط®ط± ط§ظ„طµظپط­ط©: ط§ظ„ظ„ظٹ ظˆطµظ„ ظ„ط­ط¯ ظ‡ظ†ط§ ط´ط§ظپ ط§ظ„ظ…ظˆظ‚ط¹
            ظƒظ„ظ‡ ظˆط¨ظ‚ظ‰ ظ…ط¤ظ‡ظ‘ظ„ ظٹط¯ط®ظ„. ط§ظ„ط¨ط§ظ†ط± ط¨ظٹط®ظپظٹ ظ†ظپط³ظ‡ ظ„ظˆ ظ…ظپظٹط´ ظ„ظٹظ†ظƒ ظ…ط¸ط¨ظˆط·. */}
        <div className="dashboard-entrance" style={{ animationDelay: "300ms" }}>
          <CommunityInvite variant="banner" />
        </div>
          </>
        )}
      </div>

      {/* ط²ط±ط§ط± ظ…ط§ط¬ظٹظƒ ط§ظ„ط¹ط§ظٹظ…: ظ†ظپط³ ط£ط®ط¶ط± ط§ظ„ظ…ظˆظ†ظˆط¬ط±ط§ظ… ط§ظ„ظ„ظٹ ظپظٹ ظƒط§ط±طھ ط§ظ„ظ…ط¯ط±ظ‘ط¨
          ظˆطھط±ظˆظٹط³ط© ط§ظ„ظ…ط­ط§ط¯ط«ط©طŒ ط¹ط´ط§ظ† ظٹطھظ‚ط±ط§ ظƒط¥ظ†ظ‡ ظ†ظپط³ ط§ظ„ط´ط®طµظٹط© ظ…ط´ ط²ط±ط§ط± طھط§ظ†ظٹ */}
      {days.length > 0 && (
        <button
          onClick={handleOpenAiAssistant}
          className={`fixed left-6 z-40 bg-emerald-500 hover:opacity-90 text-onmarker text-sm font-bold px-4 py-3 rounded-[var(--r-sm)] shadow-[0_18px_44px_-18px_var(--shade-lift)] flex items-center gap-2.5 transition active:scale-95 ${
            activeTrack ? "bottom-24" : "bottom-6"
          }`}
        >
          <span className="font-display font-extrabold text-lg leading-none">{PERSONA_NAME.charAt(0)}</span>
          <span>ط§ط³ط£ظ„ {PERSONA_NAME}</span>
        </button>
      )}

      {/* ظ„ط­ط¸ط© ط§ظ„ط¥ظ†ط¬ط§ط² = ط®طھظ… ط§ظ„ظ…ط¯ط±ظ‘ط³ ط¹ظ„ظ‰ ط§ظ„ظˆط±ظ‚ط©. ط§ظ„ط®طھظ… ظ‡ظˆ ط§ظ„ط­ط§ط¬ط© ط§ظ„طµظپط±ط§
          ط§ظ„ظˆط­ظٹط¯ط© ظ‡ظ†ط§طŒ ظˆط§ظ„ظ†ظ‚ط§ط· ظ…ظƒطھظˆط¨ط© ط¬ظˆظ‘ط§ظ‡ ط²ظٹ ط¯ط±ط¬ط©طŒ ظپط¨ط¯ظ„ ظ£ ط¹ظ†ط§طµط± ط¨ظ‚ظ‰ ظˆط§ط­ط¯. */}
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
              <span className="font-display font-extrabold text-2xl leading-none">طھظ…</span>
              <span className="mono ltr-num text-[9px] opacity-75">+{celebration.xp} XP</span>
            </div>

            <div>
              <p className="eyebrow eyebrow-flush mb-1.5 justify-center">ط¥ظ†ط¬ط§ط²</p>
              <h3 className="h3">ط®ظ„ظ‘طµطھ {celebration.topic}</h3>
            </div>

            <p className="text-xs text-ink-soft leading-relaxed">
              ظƒظ„ ط®ط·ظˆط© ط²ظٹ ط¯ظٹ ط¨طھظ‚ط±ظ‘ط¨ظƒ ظ…ظ† ظ‡ط¯ظپظƒ. ظƒظ…ظ‘ظ„ ط¨ظ†ظپط³ ط§ظ„ط¥ظٹظ‚ط§ط¹.
            </p>

            <button onClick={() => setCelebration(null)} className="btn btn-quiet btn-block text-sm">
              ظ…طھط§ط¨ط¹ط©
            </button>
          </div>
        </div>
      )}

      <SettingsDrawer
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
            // Phase C: ط«ط¨ظ‘طھ XP ط§ظ„ظپظˆط² ط¹ط¨ط± RPC (ظ…ط¹ idempotency ط¹ط¨ط± badge ظ„ط§ط­ظ‚ط§ظ‹)
            supabase.rpc("increment_xp", { p_delta: xpEarned }).then(({ error }) => {
              if (error) console.warn("increment_xp boss failed:", error.message);
            });
            logActivity({ tasksCompleted: 1 });
            // BossFight ظ‡ظˆ ط§ظ„ظ„ظٹ ط¨ظٹط¹ظ…ظ„ insert ظپظٹ ط¬ط¯ظˆظ„ badgesطŒ ظپط¨ظ†ط²ظˆظ‘ط¯ ط§ظ„ط¹ط¯ط¯
            // ظ…ط­ظ„ظٹط§ظ‹ ط¨ط¯ظ„ ظ…ط§ ظ†ط³طھط¹ظ„ظ… طھط§ظ†ظٹ â€” ط§ظ„ط´ط±ظٹط· ظٹطھط­ط±ظƒ ظپظٹ ظ†ظپط³ ط§ظ„ظ„ط­ط¸ط©.
            setBadgeCount((prev) => prev + 1);
          }}
        />
      )}

      {/* ًںکٹ ط³ط¤ط§ظ„ ط§ظ„ط±ط£ظٹ.
          âڑ ï¸ڈ enabled ط¨ظٹطھظ‚ظپظ„ ظ„ظ…ط§ ظٹظƒظˆظ† ظپظٹظ‡ ظ…ظˆط¯ط§ظ„ ظ…ظپطھظˆط­ â€” ط§ظ„ظˆط¯ط¬طھ fixed
          ظپظƒط§ظ†طھ ظ‡طھظ‚ط¹ط¯ ظپظˆظ‚ ط·ط¨ظ‚ط© ط§ظ„ظ…ظˆط¯ط§ظ„ ط§ظ„ظ…ط¹طھظ…ط© ظˆطھط¨ط§ظ† ط²ظٹ ط¥ظ†ظ‡ط§ ط¨طھظ‚ط§ط·ط¹ظ‡.
          ظˆظƒظ…ط§ظ†: ط²ط±ط§ط± آ«ط§ط³ط£ظ„ ظ…ط§ط¬ظٹظƒآ» ط§ظ„ط¹ط§ظٹظ… ط¹ظ„ظ‰ ظٹط³ط§ط± طھط­طھطŒ ظˆط§ظ„ظˆط¯ط¬طھ ط¹ظ„ظ‰
          ظ†ظپط³ ط§ظ„ظ†ط§ط­ظٹط© â€” ظپظ…ظ‚ظپظˆظ„ط© ظƒظ…ط§ظ† ظˆظ‚طھ ظ…ط§ ط§ظ„ط²ط±ط§ط± ط¸ط§ظ‡ط± ظˆظ…ظپظٹط´ ظ…ظˆط¯ط§ظ„طں
          ظ„ط£: ط§ظ„ظˆط¯ط¬طھ start (ظٹظ…ظٹظ† ظپظٹ RTL) ظˆط§ظ„ط²ط±ط§ط± leftطŒ ظپظ…ط§ظپظٹط´ طھطµط§ط¯ظ…. */}
      <FeedbackWidget
        page="dashboard"
        featureLabel="ط§ظ„ط¯ط§ط´ط¨ظˆط±ط¯"
        enabled={
          !celebration &&
          activeBossChapter === null &&
          !showLeaderboard &&
          !showShopModal &&
          !showParentReport &&
          !showWeeklySummary &&
          !isMenuOpen
        }
      />

          {eduContext && eduContext.stageId && (
            <div className="w-full max-w-3xl mx-auto mt-6 p-4 rounded-xl bg-paper border border-rule">
              <h3 className="font-display text-lg mb-3">{eduContext.stageId ? (eduContext.stageId === "BACCALAUREATE" ? (eduContext.trackId ? "ط§ظ„ط¨ظƒط§ظ„ظˆط±ظٹط§ â€” " : "ط§ظ„ط¨ظƒط§ظ„ظˆط±ظٹط§") : "ظ…ظˆط§ط¯ظƒ") : "ظ…ظˆط§ط¯ظƒ"}</h3>
              {eduLoading ? <div className="mono text-xs text-ink-soft">ط¬ط§ط±ظچ ط§ظ„طھط­ظ…ظٹظ„â€¦</div> : eduError ? <div className="text-sm text-red-600">{eduError}</div> : eduSubjects.length === 0 ? <div className="text-sm text-ink-soft">ظ„ط§ طھظˆط¬ط¯ ظ…ظˆط§ط¯ ظ…ط±طھط¨ط·ط© ط¨ظ‡ط°ط§ ط§ظ„ط³ظٹط§ظ‚ ط­ط§ظ„ظٹط§ظ‹.</div> : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {eduSubjects.map((s: any) => (
                    <div key={s.id} className="p-3 rounded-lg border border-rule bg-paper-2 hover:border-ink-soft transition">
                      <div className="font-semibold text-sm">{s.name}</div>
                      <div className="text-xs text-ink-soft">ظ…ظ† ط§ظ„ظ…ظ†ظ‡ط¬</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {(!eduContext || !eduContext.stageId) && (
            <div className="w-full max-w-3xl mx-auto mt-6 p-4 rounded-xl bg-paper border border-rule text-sm text-ink-soft">ط£ظƒظ…ظ„ ط¥ط¹ط¯ط§ط¯ ظ…ظ„ظپظƒ ط§ظ„طھط¹ظ„ظٹظ…ظٹ ظ„ط¹ط±ط¶ ط§ظ„ظ…ظˆط§ط¯ ط§ظ„ظ…ط®طµطµط©.</div>
          )}
    </div>
  );
}
