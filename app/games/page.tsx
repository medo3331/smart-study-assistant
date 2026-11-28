"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageShell } from "@/app/dashboard/components/PageShell";
import { useAuthUser } from "@/app/dashboard/components/use-page-data";
import {
  ACHIEVEMENTS, ARCADE_GAMES, ARCADE_GAME_NAMES, levelFor, xpForLevel,
  type GameProfileRow,
} from "@/lib/games/arcade";

/**
 * Magicly Arcade 🕹️ — Gaming Hub.
 *
 * المرحلة ١ (Arcade Foundation — db/124): بروفايل لاعب موحد (XP/مستوى/نتائج)
 * + ترتيب الشطرنج + إنجازات السيرفر + مكافآت محدودة عشان الألعاب تفضل
 * مكافأة للمذاكرة مش بديل عنها.
 *
 * الألعاب الحقيقية كلها بتكافئ من السيرفر (`arcade_submit_score` أو
 * `claim_break_game`) — الكروت "قريب" بتوسّط خطة Gaming Universe.
 */

type ArcadeCard = {
  href: string;
  emoji: string;
  title: string;
  desc: string;
  live: boolean;
  featured?: boolean;
};

const GAMES: ArcadeCard[] = [
  { href: "/games/chess", emoji: "♟️", title: "Magicly Chess", desc: "شطرنج ضد الكمبيوتر بـ ٣ مستويات — XP وترتيب", live: true, featured: true },
  { href: "/break#penalty", emoji: "⚽", title: "جول ولا لا؟", desc: "ركلات ترجيح — هاتريك ٣ جول = مكافأة", live: true },
  { href: "/break", emoji: "🧠", title: "Memory Match", desc: "مطابقة مصطلحات مولّدة من مادتك بالـ AI", live: true },
  { href: "/break", emoji: "⚡", title: "Reaction Test", desc: "سرعة بديهة — كل ما تسرع تكسب أسرع", live: true },
  { href: "/break", emoji: "🏃", title: "Quiz Rush", desc: "سؤال سريع من خطة مذاكرتك اليومية", live: true },
  { href: "/break", emoji: "🧩", title: "فزورة اليوم", desc: "لغز يومي بتلميح ومحاولات محدودة", live: true },
  { href: "/escape-room", emoji: "🚪", title: "غرفة الهروب", desc: "٣ ألغاز متسلسلة في مراجعة كاملة", live: true },
  { href: "/shop", emoji: "📦", title: "الصناديق والعجلة", desc: "صناديق مفاجآت وعجلة الحظ من المتجر", live: true },
];

const UPCOMING: ArcadeCard[] = [
  { href: "/games", emoji: "🏃‍♂️", title: "Magicly Run", desc: "اللعبة الرئيسية — ٣ حارات وشخصيات Magicly", live: false },
  { href: "/games", emoji: "⚽", title: "Magicly Football", desc: "مباريات Mini Football سريعة", live: false },
  { href: "/games", emoji: "🧱", title: "Magic Blocks", desc: "ترتيب وتفجير بلوكات", live: false },
  { href: "/games", emoji: "🎫", title: "Magic Battle Pass", desc: "مسار مكافآت موسمي بمستويات وجوائز", live: false },
  { href: "/games", emoji: "🏆", title: "بطولات موسمية", desc: "مسابقات بين الكليات وجوائز Coins", live: false },
];

const DAILY_MISSIONS = [
  { icon: "⚡", text: "العب جولة واحدة" },
  { icon: "🏆", text: "اكسب مباراة شطرنج" },
  { icon: "🎯", text: "حسّن رقمك القياسي" },
];

type LeaderRow = { rank: number; display_name: string; handle: string | null; code: string; xp: number; level: number; best_score: number; wins: number };

function Card({ game }: { game: ArcadeCard }) {
  const inner = (
    <div className={`sheet-card flex h-full flex-col gap-2 p-5 transition ${game.live ? "hover:border-marker/60" : "opacity-60"}`}>
      <div className="flex items-center justify-between">
        <span className="text-3xl">{game.emoji}</span>
        {game.live ? <span className="tag">متاحة الآن</span> : <span className="tag opacity-70">قريب ✨</span>}
      </div>
      <h2 className="h4 font-extrabold">{game.title}</h2>
      <p className="text-sm text-ink-soft">{game.desc}</p>
    </div>
  );
  return game.live ? (
    <Link href={game.href} className="block h-full">{inner}</Link>
  ) : (
    <div className="h-full cursor-default">{inner}</div>
  );
}

export default function GamesPage() {
  const { supabase, session } = useAuthUser();
  const [profiles, setProfiles] = useState<GameProfileRow[]>([]);
  const [claimed, setClaimed] = useState<string[]>([]);
  const [leaders, setLeaders] = useState<LeaderRow[]>([]);
  const [ready, setReady] = useState(false);

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
      lede="Play. Compete. Unlock. Repeat. — العب، اتنافس، افتح شخصياتك، وكل ده مكافأة بعد المذاكرة."
      action={<Link href="/shop" className="btn btn-quiet text-sm">🛍️ عناصر الألعاب</Link>}
    >
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

      {/* اللعبة المميزة */}
      <Link href="/games/chess" className="block">
        <section className="sheet-card flex flex-col gap-3 border-marker/50 bg-gradient-to-l from-marker/10 to-transparent p-6 transition hover:border-marker">
          <span className="tag w-fit">اللعبة المميزة</span>
          <div className="flex items-center gap-4">
            <span className="text-5xl">♟️</span>
            <div>
              <h2 className="h2 font-extrabold">Magicly Chess</h2>
              <p className="text-sm text-ink-soft">Run • Collect • Unlock — استراتيجية وترتيب ضد الكمبيوتر</p>
            </div>
          </div>
        </section>
      </Link>

      {/* المكتبة */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink-soft">مكتبة الألعاب</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GAMES.map((g) => (
            <Card key={g.title} game={g} />
          ))}
        </div>
      </section>

      {/* مهام يومية */}
      <section className="sheet-card space-y-3 p-5">
        <h2 className="h3">🎯 مهام اليوم</h2>
        <div className="flex flex-wrap gap-2">
          {DAILY_MISSIONS.map((m) => (
            <span key={m.text} className="tag text-sm">{m.icon} {m.text}</span>
          ))}
        </div>
        <p className="text-xs text-ink-soft">
          أول فوز في اليوم = 5 🪙 · كل إنجاز مرة واحدة · المكافآت من السيرفر مباشرة
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

      {/* قادم */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink-soft">على الطريق — Gaming Universe</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {UPCOMING.map((g) => (
            <Card key={g.title} game={g} />
          ))}
        </div>
      </section>

      <p className="text-xs text-ink-soft">
        الألعاب بتكسبك XP أساسًا — الكوينز محدودة (أول فوز/يوم + إنجازات) عشان الاقتصاد يفضل متوازن مع المذاكرة 💪
      </p>
    </PageShell>
  );
}
