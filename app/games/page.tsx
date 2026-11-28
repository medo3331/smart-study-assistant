"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/app/dashboard/components/PageShell";
import { useAuthUser } from "@/app/dashboard/components/use-page-data";
import MemoryGame from "@/app/dashboard/components/games/MemoryGame";
import BreakTimer from "./components/BreakTimer";
import ReactionTest from "./components/ReactionTest";
import QuizRush from "./components/QuizRush";
import DailyRiddle from "./components/DailyRiddle";
import PenaltyShootout from "./components/PenaltyShootout";
import EscapeRoomGame from "./components/EscapeRoomGame";
import {
  ACHIEVEMENTS, ARCADE_GAME_NAMES, levelFor, xpForLevel,
  type GameProfileRow,
} from "@/lib/games/arcade";

/**
 * Magicly Arcade 🕹️ — مكان واحد لكل الألعاب.
 *
 * هنا كله: ألعاب الاستراحة (مؤقت/ذاكرة/سرعة/كويز/فزورة/جول ولا لا؟)
 * + غرفة الهروب + الشطرنج + بروفايل اللاعب والترتيب والإنجازات.
 * المكافآت كلها من السيرفر (`claim_break_game` / `arcade_submit_score`) —
 * محدودة عشان تفضل مكافأة للمذاكرة مش بديل عنها.
 */

const UPCOMING = [
  { emoji: "⚽", title: "Magicly Football", desc: "مباريات Mini Football سريعة" },
  { emoji: "🧱", title: "Magic Blocks", desc: "ترتيب وتفجير بلوكات" },
  { emoji: "🎫", title: "Magic Battle Pass", desc: "مسار مكافآت موسمي بمستويات وجوائز" },
  { emoji: "🏆", title: "بطولات موسمية", desc: "مسابقات بين الكليات وجوائز Coins" },
];

const DAILY_MISSIONS = [
  { icon: "⚡", text: "العب جولة واحدة" },
  { icon: "🏆", text: "اكسب مباراة شطرنج" },
  { icon: "🎯", text: "حسّن رقمك القياسي" },
];

type LeaderRow = { rank: number; display_name: string; handle: string | null; code: string; xp: number; level: number; best_score: number; wins: number };

export default function GamesPage() {
  const { supabase, session } = useAuthUser();
  const [profiles, setProfiles] = useState<GameProfileRow[]>([]);
  const [claimed, setClaimed] = useState<string[]>([]);
  const [leaders, setLeaders] = useState<LeaderRow[]>([]);
  const [ready, setReady] = useState(false);
  const [arcadeNote, setArcadeNote] = useState("");

  useEffect(() => {
    if (!supabase || session.status !== "ready") return;
    void Promise.all([
      supabase.from("game_profiles").select("game_id,xp,best_score,plays,wins"),
      supabase.from("game_achievements").select("achievement_id"),
      supabase.rpc("arcade_leaderboard", { p_game: "chess" }),
    ]).then(([prof, ach, board]) => {
      if (!prof.error) setProfiles(prof.data as GameProfileRow[]);
      if (!ach.error) setClaimed((ach.data as { achievement_id: string }[]).map((r) => r.achievement_id));
      if (!board.error) setLeaders(((Array.isArray(board.data) ? board.data : board.data) ?? []) as LeaderRow[]);
      setReady(true);
    });
  }, [supabase, session]);

  // مكافآت ألعاب البريك — نفس عقد claim_break_game (سقف ٢/يوم + شرط المذاكرة)
  const claimBreakGame = useCallback(
    async (game: "reaction" | "penalty" | "memory") => {
      if (!supabase) return;
      const { data, error } = await supabase.rpc("claim_break_game", { p_game: game });
      const row = Array.isArray(data) ? data[0] : data;
      setArcadeNote(error ? error.message : row?.message ?? "تم");
    },
    [supabase],
  );

  const totalXp = profiles.reduce((s, p) => s + p.xp, 0);
  const level = levelFor(totalXp);
  const nextLevelXp = xpForLevel(level + 1);
  const thisLevelXp = xpForLevel(level);
  const progress = Math.min(100, Math.round(((totalXp - thisLevelXp) / Math.max(1, nextLevelXp - thisLevelXp)) * 100));
  const totalWins = profiles.reduce((s, p) => s + p.wins, 0);
  const bestGame = profiles.slice().sort((a, b) => b.best_score - a.best_score)[0];

  return (
    <PageShell
      eyebrow="Magicly Arcade"
      title="🕹️ عالم ألعاب ماجِك"
      lede="Play. Compete. Unlock. Repeat. — كل الألعاب في مكان واحد: استراحة، هروب، شطرنج، وترفيه — وكل المكافآت من السيرفر بعد مذاكرة حقيقية."
      action={<Link href="/shop" className="btn btn-quiet text-sm">🛍️ عناصر الألعاب</Link>}
    >
      {arcadeNote && (
        <p className="rounded-xl border border-rule bg-paper-2/60 px-4 py-2 text-sm text-ink">{arcadeNote}</p>
      )}

      {/* بروفايل اللاعب */}
      {session.status === "ready" && ready && (
        <section className="sheet-card space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="h3">مستواك في Arcade</h2>
              <p className="text-sm text-ink-soft">
                ⭐ {totalXp.toLocaleString("en")} XP · {totalWins} فوز
                {bestGame && <> · أحسن نتيجة: {ARCADE_GAME_NAMES[bestGame.game_id as keyof typeof ARCADE_GAME_NAMES] ?? bestGame.game_id} ({bestGame.best_score})</>}
              </p>
            </div>
            <span className="rounded-full bg-marker/10 px-4 py-1.5 text-lg font-extrabold text-marker">Level {level}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-paper-3">
            <div className="h-full rounded-full bg-marker" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-ink-soft">{Math.max(0, nextLevelXp - totalXp)} XP تفصلك عن مستوى {level + 1}</p>
          {profiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {profiles.map((p) => (
                <span key={p.game_id} className="tag">
                  {ARCADE_GAME_NAMES[p.game_id as keyof typeof ARCADE_GAME_NAMES] ?? p.game_id}: {p.plays} جولة
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {/* المهام اليومية */}
      <section className="sheet-card space-y-2 p-5">
        <h2 className="h3">🎯 مهام اليوم</h2>
        <div className="flex flex-wrap gap-2">
          {DAILY_MISSIONS.map((m) => (
            <span key={m.text} className="tag text-sm">{m.icon} {m.text}</span>
          ))}
        </div>
        <p className="text-xs text-ink-soft">أول فوز في اليوم = 5 🪙 · كل إنجاز مرة واحدة · المكافآت من السيرفر مباشرة</p>
      </section>

      {/* اللعبة المميزة — Magicly Run */}
      <Link href="/games/run" className="block">
        <section className="sheet-card flex flex-col gap-3 border-marker/50 bg-gradient-to-l from-marker/10 to-transparent p-6 transition hover:border-marker">
          <span className="tag w-fit">اللعبة المميزة — جديدة</span>
          <div className="flex items-center gap-4">
            <span className="text-5xl">🏃‍♂️</span>
            <div>
              <h2 className="h2 font-extrabold">Magicly Run</h2>
              <p className="text-sm text-ink-soft">اجرى في عالم Magicly — ٣ حارات · نط وانزلاق · كوينز وPower-ups</p>
            </div>
          </div>
        </section>
      </Link>

      {/* ♟️ الشطرنج */}
      <Link href="/games/chess" className="block">
        <section className="sheet-card flex flex-col gap-3 p-6 transition hover:border-marker">
          <div className="flex items-center gap-4">
            <span className="text-5xl">♟️</span>
            <div>
              <h2 className="h2 font-extrabold">Magicly Chess</h2>
              <p className="text-sm text-ink-soft">شطرنج ضد الكمبيوتر بـ ٣ مستويات — XP وترتيب</p>
            </div>
          </div>
        </section>
      </Link>

      {/* 🚪 غرفة الهروب */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink-soft">🚪 غرفة الهروب</h2>
        <EscapeRoomGame />
      </section>

      {/* 🎮 ألعاب الاستراحة — كلها هنا */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink-soft">🎮 ألعاب الاستراحة</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <PenaltyShootout onWin={claimBreakGame} />
          <ReactionTest onWin={claimBreakGame} />
          <QuizRush />
          <BreakTimer />
        </div>
        <div className="grid gap-4">
          <section className="sheet-card space-y-3 p-5">
            <h2 className="h3">🧠 Memory Match الذكية</h2>
            <p className="text-sm text-ink-soft">لعبة مطابقة المصطلحات المُولّدة بالذكاء الاصطناعي خصيصاً لمادتك — ٤ أزواج فقط.</p>
            <MemoryGame lessonText="أنظمة التشغيل وإدارة العمليات والذاكرة وحل المشكلات البرمجية" onWin={() => claimBreakGame("memory")} />
          </section>
          <DailyRiddle />
        </div>
        <p className="text-xs text-ink-soft">
          مكافآت الاستراحة: ٥ Coins للفوز · سقف ٢ مكافآت يوميًا · بتشتغل بس لو ذاكرت النهارده 💪
        </p>
      </section>

      {/* الترتيب */}
      {leaders.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-ink-soft">🏆 ترتيب Magicly Chess</h2>
          <div className="sheet-card divide-y divide-rule/60 overflow-hidden p-0">
            {leaders.map((row) => (
              <div key={row.code} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className={`w-8 shrink-0 text-center font-extrabold ${row.rank === 1 ? "text-marker" : "text-ink-soft"}`}>
                  {row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : row.rank}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{row.display_name ?? row.code}</span>
                <span className="mono shrink-0 text-xs text-ink-soft">{row.best_score} نقطة</span>
                <span className="shrink-0 text-xs text-ink-soft">Lv {row.level}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* الإنجازات */}
      {session.status === "ready" && ready && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-ink-soft">🏅 الإنجازات</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ACHIEVEMENTS.map((a) => {
              const got = claimed.includes(a.id);
              return (
                <div key={a.id} className={`sheet-card flex items-center gap-3 p-4 ${got ? "border-marker/60" : "opacity-55"}`}>
                  <span className="text-2xl">{got ? a.icon : "🔒"}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{a.title}</p>
                    <p className="truncate text-xs text-ink-soft">{a.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* قادم — Gaming Universe */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink-soft">على الطريق — Gaming Universe</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {UPCOMING.map((g) => (
            <div key={g.title} className="sheet-card flex h-full cursor-default flex-col gap-2 p-5 opacity-60">
              <div className="flex items-center justify-between">
                <span className="text-3xl">{g.emoji}</span>
                <span className="tag opacity-70">قريب ✨</span>
              </div>
              <h3 className="h4 font-extrabold">{g.title}</h3>
              <p className="text-sm text-ink-soft">{g.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="text-xs text-ink-soft">
        الألعاب بتكسبك XP أساسًا — الكوينز محدودة (أول فوز/يوم + إنجازات) عشان الاقتصاد يفضل متوازن مع المذاكرة 💪
      </p>
    </PageShell>
  );
}
