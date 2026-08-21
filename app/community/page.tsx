"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { CommunityQuiz, type QuizResult } from "@/components/CommunityQuiz";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { CommunityInvite } from "@/components/CommunityInvite";

interface LeaderboardEntry {
  id: string;
  name: string;
  xp: number;
  streak: number;
  isYou?: boolean;
}

// صف من لوحة صدارة المسابقة (RPC: weekly_quiz_leaderboard)
interface CompEntry {
  user_id: string;
  display_name: string;
  best_score: number;
  best_total: number;
  best_accuracy: number;
  is_you: boolean;
}

// أحسن نتيجة ليك الأسبوع ده (RPC: my_weekly_best)
interface MyBest {
  best_score: number;
  best_total: number;
  best_accuracy: number;
  attempts: number;
  rank: number;
}

// ⏳ الوقت المتبقي لنهاية الأسبوع (السبت 23:59) — نفس أسبوع المسابقة في الداتابيز
function getTimeUntilWeekEnd() {
  const now = new Date();
  const daysUntilSaturday = (6 - now.getDay() + 7) % 7;
  const endOfWeek = new Date(now);
  endOfWeek.setDate(now.getDate() + daysUntilSaturday);
  endOfWeek.setHours(23, 59, 59, 999);
  const diffMs = Math.max(0, endOfWeek.getTime() - now.getTime());
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
  return { days, hours, minutes };
}

export default function CommunityPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(1);
  const [quizSubject, setQuizSubject] = useState("مراجعة عامة");

  const [activeTab, setActiveTab] = useState<"leaderboard" | "competition">("leaderboard");
  const [timeLeft, setTimeLeft] = useState(getTimeUntilWeekEnd());

  // لوحة الصدارة الرئيسية (XP) — مستخدمين حقيقيين من profiles
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [boardLoading, setBoardLoading] = useState(true);
  const [yourRank, setYourRank] = useState<number | null>(null);
  const [totalPlayers, setTotalPlayers] = useState<number | null>(null);

  // المسابقة الأسبوعية
  const [comp, setComp] = useState<CompEntry[]>([]);
  const [compLoading, setCompLoading] = useState(true);
  const [myBest, setMyBest] = useState<MyBest | null>(null);
  const [showQuiz, setShowQuiz] = useState(false);

  // 🏆 لوحة الصدارة الرئيسية: أعلى ٢٠ بالـ XP + ترتيبك الحقيقي عبر عدّ الأعلى منك
  const loadBoard = useCallback(
    async (uid: string | null, myXp: number, myStreak: number) => {
      setBoardLoading(true);
      const { data } = await supabase
        .from("profiles")
        .select("id, xp, streak, display_name")
        .order("xp", { ascending: false })
        .limit(20);

      const entries: LeaderboardEntry[] = (data || []).map((row: {
        id: string;
        xp: number | null;
        streak: number | null;
        display_name: string | null;
      }) => ({
        id: row.id,
        name:
          row.id === uid
            ? "أنت"
            : row.display_name?.trim() || `لاعب #${String(row.id).slice(0, 4)}`,
        xp: row.xp || 0,
        streak: row.streak || 0,
        isYou: row.id === uid,
      }));

      // لو مش ضمن العشرين، ضيف صفّك عشان تشوف نفسك في القايمة
      if (uid && !entries.some((e) => e.isYou)) {
        entries.push({ id: uid, name: "أنت", xp: myXp, streak: myStreak, isYou: true });
      }
      entries.sort((a, b) => b.xp - a.xp);
      setBoard(entries);
      setBoardLoading(false);

      // الترتيب الحقيقي = عدد اللي الـ XP بتاعهم أعلى منك + ١
      if (uid) {
        const [{ count: above }, { count: total }] = await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true }).gt("xp", myXp),
          supabase.from("profiles").select("id", { count: "exact", head: true }),
        ]);
        setYourRank((above ?? 0) + 1);
        setTotalPlayers(total ?? entries.length);
      }
    },
    [supabase]
  );

  // 🎯 المسابقة: لوحة صدارة الكويز الأسبوعية + أحسن نتيجة ليك
  const loadCompetition = useCallback(async () => {
    setCompLoading(true);
    const [{ data: lb }, { data: mine }] = await Promise.all([
      supabase.rpc("weekly_quiz_leaderboard", { p_limit: 20 }),
      supabase.rpc("my_weekly_best"),
    ]);
    setComp((lb as CompEntry[]) || []);
    const mineRow = Array.isArray(mine) ? mine[0] : mine;
    setMyBest((mineRow as MyBest) || null);
    setCompLoading(false);
  }, [supabase]);

  // 🔴 تحميل المستخدم الحالي + الاسم + المادة، وبعدين اللوحات
  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let uid: string | null = null;
      let curXp = 0;
      let curStreak = 1;
      let guest = false;

      if (user) {
        uid = user.id;
        guest = !!user.is_anonymous;
        const fullName = (user.user_metadata?.full_name as string | undefined)?.trim();

        const { data: profile } = await supabase
          .from("profiles")
          .select("xp, streak, display_name, subject, field")
          .eq("id", user.id)
          .maybeSingle();

        if (profile) {
          curXp = profile.xp || 0;
          curStreak = profile.streak || 1;
          setQuizSubject(profile.subject?.trim() || profile.field?.trim() || "مراجعة عامة");

          // انسخ الاسم لـ profiles أول مرة عشان يظهر لباقي الناس في الصدارة
          const savedName = (profile.display_name as string | undefined)?.trim();
          if (!savedName && fullName && !guest) {
            supabase.from("profiles").update({ display_name: fullName }).eq("id", user.id).then();
          }
        }
      }

      setUserId(uid);
      setIsGuest(guest);
      setXp(curXp);
      setStreak(curStreak);
      setLoading(false);

      await Promise.all([loadBoard(uid, curXp, curStreak), loadCompetition()]);
    };
    load();
  }, [supabase, loadBoard, loadCompetition]);

  // ⏳ تحديث العدّاد كل دقيقة
  useEffect(() => {
    const interval = setInterval(() => setTimeLeft(getTimeUntilWeekEnd()), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // بعد ما الكويز يتسجّل: زوّد XP محلياً وحدّث اللوحتين
  const handleQuizSubmitted = useCallback(
    (result: QuizResult) => {
      const newXp = xp + result.xpEarned;
      setXp(newXp);
      loadBoard(userId, newXp, streak);
      loadCompetition();
    },
    [xp, userId, streak, loadBoard, loadCompetition]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center" dir="rtl">
        <p className="tag animate-pulse">بيحمّل</p>
      </div>
    );
  }

  const rankBadge = (index: number) =>
    index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : String(index + 1);

  return (
    <div className="min-h-screen p-4 sm:p-6 md:p-10 font-sans bg-paper text-ink" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* ترويسة الصفحة */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow eyebrow-flush mb-2">المجتمع</p>
            <h1 className="h2">
              <span className="mark mark-tilt">اتنافس وذاكر</span>
            </h1>
          </div>
          <button onClick={() => router.push("/dashboard")} className="btn btn-quiet text-sm shrink-0">
            الرجوع للداشبورد
          </button>
        </div>

        {/* تبديل العرض */}
        <div className="flex bg-paper-2 border border-rule p-1 rounded-[var(--r-sm)] gap-1">
          {([
            { id: "leaderboard", label: "الصدارة" },
            { id: "competition", label: "المسابقة" },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              aria-pressed={activeTab === t.id}
              className={`mono flex-1 py-2.5 rounded-[6px] transition ${
                activeTab === t.id ? "bg-ink text-paper-2" : "text-ink-soft hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "leaderboard" ? (
            <motion.div
              key="leaderboard"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              {/* بطاقة ترتيبك */}
              <div className="sheet-card sheet-card-live p-5 flex items-end justify-between gap-4">
                <div>
                  <p className="tag mb-1.5">ترتيبك على المنصة</p>
                  <p className="ltr-num font-display font-extrabold text-3xl text-ink leading-none tnum">
                    {yourRank ? `#${yourRank}` : "—"}
                  </p>
                </div>
                <div className="text-left space-y-1">
                  {totalPlayers != null && <p className="mono ltr-num">من {totalPlayers}</p>}
                  <p className="mono ltr-num font-bold text-ink">{xp} XP</p>
                  <p className="mono ltr-num">{streak} يوم سلسلة</p>
                </div>
              </div>

              {/* الترتيب الكامل — مستخدمين حقيقيين */}
              <div className="sheet-card p-5 space-y-1.5">
                <p className="tag mb-2.5">أعلى المتصدّرين</p>
                {boardLoading ? (
                  <p className="text-xs text-ink-soft text-center py-6">بيحمّل الترتيب…</p>
                ) : board.length === 0 ? (
                  <p className="text-xs text-ink-soft text-center py-6">مفيش بيانات كفاية لعرض الترتيب دلوقتي.</p>
                ) : (
                  board.map((entry, index) => (
                    <div
                      key={entry.id}
                      className={`flex items-center justify-between gap-3 p-2.5 rounded-[var(--r-sm)] border transition ${
                        entry.isYou ? "border-ink bg-paper-3" : "bg-paper border-rule"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-7 h-7 shrink-0 rounded-[var(--r-sm)] flex items-center justify-center font-mono text-xs font-bold ${
                            index === 0 ? "bg-ink text-paper-2" : "bg-paper-3 text-ink-soft"
                          }`}
                        >
                          {index + 1}
                        </span>
                        <span className="text-xs font-bold text-ink truncate">{entry.name}</span>
                        {entry.isYou && <span className="tag shrink-0">إنت</span>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="mono tnum ltr-num">{entry.streak} يوم</span>
                        <span className="mono tnum ltr-num font-bold text-ink">{entry.xp} XP</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="competition"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              {/* العدّاد */}
              <div className="sheet-card sheet-card-live p-5">
                <p className="tag mb-3">المسابقة بتتصفّر خلال</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "يوم", value: timeLeft.days },
                    { label: "ساعة", value: timeLeft.hours },
                    { label: "دقيقة", value: timeLeft.minutes },
                  ].map((unit) => (
                    <div key={unit.label} className="bg-paper rounded-[var(--r-sm)] p-3 text-center">
                      <p className="ltr-num font-display font-extrabold text-2xl text-ink leading-none tnum">
                        {unit.value}
                      </p>
                      <p className="tag justify-center mt-1.5">{unit.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* بطاقة الكويز — الحدث الرئيسي */}
              <div className="sheet-card p-6 space-y-4">
                <div>
                  <p className="eyebrow eyebrow-flush mb-1.5">تحدي الأسبوع</p>
                  <h2 className="h3">كويز {quizSubject}</h2>
                </div>
                <p className="text-xs text-ink-soft leading-relaxed">
                  {`جاوب ١٠ أسئلة في ${quizSubject}. كل إجابة صح بتديك XP يرفعك في الصدارة الرئيسية، وأحسن نتيجة ليك الأسبوع ده هي اللي بتترتّب في المسابقة. الأسئلة بتتغيّر كل مرة.`}
                </p>

                {/* أحسن نتيجة ليك الأسبوع ده */}
                <div className="bg-paper border border-rule rounded-[var(--r-sm)] p-4">
                  {myBest ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="tag mb-1">أحسن نتيجة ليك الأسبوع ده</p>
                        <p className="text-sm font-bold text-ink">
                          <span className="ltr-num tnum">{myBest.best_score}</span> /{" "}
                          <span className="ltr-num tnum">{myBest.best_total}</span>{" "}
                          <span className="text-ink-soft">
                            (<span className="ltr-num tnum">{myBest.best_accuracy}</span>%)
                          </span>
                        </p>
                      </div>
                      <div className="text-left shrink-0">
                        <p className="tag mb-1 justify-end">ترتيبك</p>
                        <p className="ltr-num font-display font-extrabold text-xl text-ink leading-none tnum">
                          #{myBest.rank}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-ink-soft leading-relaxed m-0">
                      لسه ما لعبتش الأسبوع ده. أول كويز بيحجزلك مكان في الصدارة.
                    </p>
                  )}
                </div>

                <button onClick={() => setShowQuiz(true)} className="btn btn-marker btn-block text-sm">
                  {myBest ? "حسّن نتيجتك" : `ابدأ كويز ${quizSubject}`}
                </button>
                {isGuest && (
                  <p className="mono text-ink-soft text-center">
                    داخل كزائر — الكويز تمرين لحد ما تسجّل حساب
                  </p>
                )}
              </div>

              {/* لوحة صدارة المسابقة */}
              <div className="sheet-card p-5 space-y-1.5">
                <p className="tag mb-2.5">صدارة المسابقة الأسبوع ده</p>
                {compLoading ? (
                  <p className="text-xs text-ink-soft text-center py-6">بيحمّل…</p>
                ) : comp.length === 0 ? (
                  <div className="notice">
                    <p className="m-0 text-[11px] leading-relaxed">
                      لسه محدش سجّل نتيجة الأسبوع ده. كن أول واحد يتصدّر!
                    </p>
                  </div>
                ) : (
                  comp.map((entry, index) => (
                    <div
                      key={entry.user_id}
                      className={`flex items-center justify-between gap-3 p-2.5 rounded-[var(--r-sm)] border transition ${
                        entry.is_you ? "border-ink bg-paper-3" : "bg-paper border-rule"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-7 h-7 shrink-0 rounded-[var(--r-sm)] flex items-center justify-center font-mono text-xs font-bold ${
                            index === 0 ? "bg-ink text-paper-2" : "bg-paper-3 text-ink-soft"
                          }`}
                        >
                          {rankBadge(index)}
                        </span>
                        <span className="text-xs font-bold text-ink truncate">
                          {entry.is_you ? "أنت" : entry.display_name}
                        </span>
                        {entry.is_you && <span className="tag shrink-0">إنت</span>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="mono tnum ltr-num">
                          {entry.best_score}/{entry.best_total}
                        </span>
                        <span className="mono tnum ltr-num font-bold text-ink">{entry.best_accuracy}%</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <CommunityInvite variant="banner" />
      </div>

      {showQuiz && (
        <CommunityQuiz
          subject={quizSubject}
          isGuest={isGuest}
          onClose={() => setShowQuiz(false)}
          onSubmitted={handleQuizSubmitted}
        />
      )}

      <FeedbackWidget page="community" featureLabel="صفحة المجتمع" />
    </div>
  );
}
