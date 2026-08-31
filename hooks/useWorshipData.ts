"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Syncing with external system (Supabase/localStorage) is intentional; see TODO for future useEffectEvent refactor */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  getTodayWorship,
  loadSettings,
  saveSettings,
  subscribeSettings,
  DEFAULT_ISLAMIC_SETTINGS,
  type WorshipDayRecord,
  type IslamicSettings,
} from "@/lib/islamic/worship-progress";
import {
  fetchWorshipSummary,
  fetchCloudSettings,
  syncWorshipProgress,
  saveCloudSettings,
  todayUtc,
  recordToCloud,
  type WorshipSummary,
} from "@/lib/worship-data";
import {
  awardWorshipActivity,
  type WorshipSource,
  type WorshipAwardResult,
} from "@/lib/worship-rewards";

/* ==========================================================================
   هوك مركز العبادات — الهوية الحقيقية + التقدّم الحقيقي + الكوينز الحقيقية

   مصادر الحقيقة:
   • المستخدم: جلسة Supabase (نفس نمط useAuthUser الموجود في المشروع).
   • التقدّم: localStorage المحلي فورًا + مزامنة صاعدة إلى worship_progress.
     العرض بياخد أقصى المحلي والسحابي لكل عنصر — فمافيش ومضة أصفار.
   • الكوينز/السلسلة/مكافآت النهارده: من الداتابيز بس (worship_daily_summary).
   ========================================================================== */

export interface RealProfile {
  id: string;
  name: string;
  initials: string;
  isAnonymous: boolean;
}

export interface UseWorshipDataReturn {
  supabase: SupabaseClient;
  /** null أثناء التحميل؛ بعد انتهاء التحميل null معناها مفيش جلسة */
  user: User | null;
  profile: RealProfile | null;
  authStatus: "loading" | "signed-in" | "signed-out";
  settings: IslamicSettings;
  updateSettingsLocal: (partial: Partial<IslamicSettings>) => void;
  /** تقدّم اليوم بعد دمج المحلي مع السحابي */
  progress: WorshipDayRecord;
  summary: WorshipSummary | null;
  coinsBalance: number;
  coinsToday: number;
  streak: number;
  isCloudReady: boolean;
  refreshSummary: () => Promise<void>;
  /**
   * تسجيل حدث عبادة + مكافأته عبر award_coins الموجود (مرجع حتمي،
   * والتكرار بيرجع awarded=0 بهدوء من الداتابيز).
   */
  recordEvent: (
    mutator: (day: WorshipDayRecord) => WorshipDayRecord,
    source: WorshipSource,
    refId: string,
    metadata: Record<string, unknown>,
    onReward?: (reward: WorshipAwardResult) => void,
  ) => Promise<void>;
}

function initialsOf(name: string): string {
  const trimmed = name.trim();
  return trimmed ? [...trimmed][0] ?? "؟" : "؟";
}

export function useWorshipData(): UseWorshipDataReturn {
  const [supabase] = useState(() => createClient());

  /* ── الجلسة ─────────────────────────────────────────────────────────── */
  const [user, setUser] = useState<User | null>(null);
  const [authStatus, setAuthStatus] = useState<
    "loading" | "signed-in" | "signed-out"
  >("loading");
  const onceRef = useRef(false);

  useEffect(() => {
    if (onceRef.current) return;
    onceRef.current = true;
    void (async () => {
      try {
        const {
          data: { user: authed },
        } = await supabase.auth.getUser();
        const current =
          authed ??
          (await supabase.auth.getSession()).data.session?.user ??
          null;
        setUser(current);
        setAuthStatus(current ? "signed-in" : "signed-out");
      } catch (err) {
        console.error("useWorshipData auth:", err);
        setAuthStatus("signed-out");
      }
    })();
  }, [supabase]);

  /* ── البروفايل (الاسم المعروض) ──────────────────────────────────────── */
  const [profile, setProfile] = useState<RealProfile | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const metaName = (u: User): string => {
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
      for (const key of ["full_name", "name", "display_name"]) {
        if (typeof meta[key] === "string" && (meta[key] as string).trim()) {
          return (meta[key] as string).trim();
        }
      }
      // البريد كاحتياط أخير قبل «قارئ» — الجزء قبل @ مقروء وغير حساس.
      if (typeof u.email === "string" && u.email.includes("@")) {
        return u.email.split("@")[0];
      }
      return "قارئ";
    };

    void (async () => {
      const base: RealProfile = {
        id: user.id,
        name: metaName(user),
        initials: "؟",
        isAnonymous: user.is_anonymous === true,
      };
      try {
        const { data } = await supabase
          .from("profiles")
          .select("display_name, full_name")
          .eq("id", user.id)
          .maybeSingle();
        const row = data as
          | { display_name?: string | null; full_name?: string | null }
          | null;
        const stored =
          row?.display_name?.trim() || row?.full_name?.trim() || "";
        if (!cancelled) {
          setProfile({
            ...base,
            name: stored || base.name,
            initials: initialsOf(stored || base.name),
          });
        }
      } catch {
        if (!cancelled) {
          setProfile({ ...base, initials: initialsOf(base.name) });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, user]);

  /* ── الإعدادات: محلي أولًا، السحابة بتدمج فوقه لو موجودة ───────────── */
  const [settings, setSettings] = useState<IslamicSettings>(
    DEFAULT_ISLAMIC_SETTINGS,
  );
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
          setSettingsLoaded(true);
    const unsub = subscribeSettings((updated) => setSettings(updated));
    const handler = () => setSettings(loadSettings());
    window.addEventListener("islamic-settings-change", handler);
    return () => {
      unsub();
      window.removeEventListener("islamic-settings-change", handler);
    };
  }, []);

  /** حفظ محلي فوري + رفع للسحابة (fire-and-forget، حسابات حقيقية بس). */
  const updateSettingsLocal = useCallback(
    (partial: Partial<IslamicSettings>) => {
      const next = { ...settings, ...partial };
      setSettings(next);
      saveSettings(next);
      window.dispatchEvent(new Event("islamic-settings-change"));
      if (user && !user.is_anonymous) {
        void saveCloudSettings(supabase, next);
      }
    },
    [settings, supabase, user],
  );

  // دمج إعدادات السحابة مرة واحدة بعد جاهزيتها (السحابة أحدث لأنها بتتسجل من أي جهاز).
  useEffect(() => {
    if (!user || user.is_anonymous || !settingsLoaded) return;
    let cancelled = false;
    void fetchCloudSettings(supabase).then((cloud) => {
      if (!cancelled && cloud && Object.keys(cloud).length > 0) {
        setSettings((prev) => ({ ...prev, ...cloud }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, user, settingsLoaded]);

  /* ── الملخص السحابي (رصيد/ستريك/تقدّم مخزَّن) ───────────────────────── */
  const [summary, setSummary] = useState<WorshipSummary | null>(null);

  const refreshSummary = useCallback(async () => {
    if (!user || user.is_anonymous) return;
    const s = await fetchWorshipSummary(supabase);
    if (s) setSummary(s);
  }, [supabase, user]);

  useEffect(() => {
    if (!user || user.is_anonymous) return;
    void refreshSummary();
  }, [user, refreshSummary]);

  /* ── التقدّم المحلي + المزامنة الصاعدة ─────────────────────────────── */
  const [localProgress, setLocalProgress] = useState<WorshipDayRecord>(() =>
    getTodayWorship(),
  );

  useEffect(() => {
      setLocalProgress(getTodayWorship(todayUtc()));
    // القرآن والتسبيح بيكتبوا في التخزين مباشرة — بنسمع للحدث ونعيد القراءة.
      const handler = () => {
      const fresh = getTodayWorship(todayUtc());
      setLocalProgress((prev) =>
        JSON.stringify(recordToCloud(prev)) ===
        JSON.stringify(recordToCloud(fresh))
          ? prev
          : fresh,
      );
    };
    window.addEventListener("worship-progress-change", handler);
    return () => window.removeEventListener("worship-progress-change", handler);
  }, []);

  /** كل كتابة محلية بترفع نسخة للداتابيز — بدون انتظار وبدون مكافآت هنا. */
  const syncUp = useCallback(
    (record: WorshipDayRecord) => {
      if (!user || user.is_anonymous) return;
      void syncWorshipProgress(supabase, record); // fire-and-forget
    },
    [supabase, user],
  );

  /**
   * تحديث تقدّم اليوم: كتابة محلية فورية + رفع سحابي + إعادة قراءة ملخص
   * المكافآت بعد ثانية عشان الأرقام تعكس آخر حدث (لو حصل صرف).
   */
  const mutateProgress = useCallback(
    (mutator: (day: WorshipDayRecord) => WorshipDayRecord) => {
      const before = getTodayWorship();
      const after = mutator({ ...before });
      setLocalProgress(after);
      syncUp(after);
    },
    [syncUp],
  );

  /**
   * تسجيل حدث عبادة + محاولة مكافأته عبر award_coins الموجود.
   *
   * الترتيب مقصود: التقدّم بيتكتب محليًا ويرفع سحابيًا **قبل** نداء
   * المكافأة (نفس نمط day_done في الدرس) — فالدليل موجود وقت ما دالة
   * التحقق في السيرفر تبص عليه. المرجع حتمي (يوم UTC + اسم الحدث)،
   * والفهرس الفريد على coin_ledger بيخلي أي إعادة ترجع awarded=0 بهدوء.
   * `onReward` بيتنادى بعد تأكيد السيرفر فقط وبالمبلغ المصروف فعلاً —
   * الصفر معناه «اتصرفت قبل كده أو السقف خلص» ومفيش توست ولا خطأ.
   */
  const recordEvent = useCallback(
    async (
      mutator: (day: WorshipDayRecord) => WorshipDayRecord,
      source: WorshipSource,
      refId: string,
      metadata: Record<string, unknown>,
      onReward?: (reward: WorshipAwardResult) => void,
    ): Promise<void> => {
      // ضيف/حدّث الحدث محليًا أولًا، وارفعه فورًا للسيرفر قبل النداء.
      mutateProgress(mutator);
      if (user && !user.is_anonymous) {
        await syncWorshipProgress(supabase, getTodayWorship());
      }
      const reward = await awardWorshipActivity(
        supabase,
        source,
        refId,
        metadata,
      );
      if (onReward) onReward(reward);
      // الرصيد الراجع من award_coins هو نفس رصيد المتجر (coin_balance).
      if (reward.coins > 0) {
        setTimeout(() => void refreshSummary(), 400);
      }
    },
    [mutateProgress, supabase, user, refreshSummary],
  );

  /* ── الدمج النهائي للتقدّم ─────────────────────────────────────────── */
  const mergedProgress = useMemo(() => {
    const merged: WorshipDayRecord = { ...localProgress };
    const cloud = summary?.cloud;
    if (cloud) {
      for (const [k, v] of Object.entries(cloud.prayers)) {
        if (v) merged.prayers[k] = true;
      }
      merged.adhkar = { ...merged.adhkar };
      for (const [k, v] of Object.entries(cloud.adhkar)) {
        const localEntry = merged.adhkar[k];
        const count = Math.max(localEntry?.count ?? 0, v);
        // علم الإتمام محلي بالكامل — السحابة بيها العدّاد بس (أكثر تحفّظ).
        merged.adhkar[k] = { completed: localEntry?.completed ?? false, count };
      }
      merged.quran = {
        ...merged.quran,
        dailyCount: Math.max(merged.quran.dailyCount, cloud.quranAyahs),
      };
    }
    return merged;
  }, [localProgress, summary]);

  // رفع الحالة المدموجة لو السحابة كانت ناقصة (جهاز جديد استعاد جزئيًا).
  const lastSyncKey = useRef("");
  useEffect(() => {
    if (!summary || !user || user.is_anonymous) return;
    const key = JSON.stringify(recordToCloud(mergedProgress));
    if (key !== lastSyncKey.current) {
      lastSyncKey.current = key;
      void syncWorshipProgress(supabase, mergedProgress);
    }
  }, [mergedProgress, summary, supabase, user]);

  // كائن ثابت قدر الإمكان — المستهلكون (context/effect) بيتأثروا بالهوية.
  return useMemo(
    () => ({
      supabase,
      user,
      profile,
      authStatus,
      settings,
      updateSettingsLocal,
      progress: mergedProgress,
      summary,
      coinsBalance: summary?.coinsBalance ?? 0,
      coinsToday: summary?.coinsToday ?? 0,
      streak: summary?.streak ?? 0,
      isCloudReady: !!summary,
      refreshSummary,
      recordEvent,
    }),
    [
      supabase,
      user,
      profile,
      authStatus,
      settings,
      updateSettingsLocal,
      mergedProgress,
      summary,
      refreshSummary,
      recordEvent,
    ],
  );
}