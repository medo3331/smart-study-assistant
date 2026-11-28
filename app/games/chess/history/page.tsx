"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/app/dashboard/components/PageShell";
import { AI_LEVELS, type Difficulty } from "@/lib/games/chess/ai";

/**
 * 📋 مبارياتي — سجل مباريات الشطرنج المحفوظة محليًا (Phase 1).
 *
 * المرحلة الجاية (Phase 2 — Online): المباريات هتتخزن في جدول `chess_games`
 * على السيرفر مع كامل النقلات (PGN) — السجل المحلي ده نواة الواجهة.
 */

type HistoryEntry = {
  at: string; won: boolean; draw: boolean; level: number; personality: string;
  score: number; plies: number; result: string;
};

const HISTORY_KEY = "magic-chess-history";

function fmtDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function ChessHistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      setEntries(raw ? (JSON.parse(raw) as HistoryEntry[]) : []);
    } catch {
      setEntries([]);
    }
  }, []);

  const clear = () => {
    try { localStorage.removeItem(HISTORY_KEY); } catch { /* تجاهل */ }
    setEntries([]);
  };

  const wins = entries?.filter((e) => e.won).length ?? 0;
  const draws = entries?.filter((e) => e.draw).length ?? 0;
  const losses = (entries?.length ?? 0) - wins - draws;

  return (
    <PageShell
      eyebrow="Magicly Chess"
      title="📋 مبارياتي"
      lede="سجل آخر ٣٠ مباراة ضد الكمبيوتر — النتائج محفوظة على جهازك."
      action={<Link className="btn btn-quiet text-sm" href="/games/chess">♟️ رجوع للعب</Link>}
    >
      {entries === null ? (
        <p className="text-sm text-ink-soft">جاري التحميل…</p>
      ) : entries.length === 0 ? (
        <section className="sheet-card space-y-2 p-6 text-center">
          <p className="text-4xl">♟️</p>
          <p className="text-sm font-bold">لسه مفيش مباريات محفوظة</p>
          <p className="text-xs text-ink-soft">إلعب أول مباراة ضد الكمبيوتر وهتلاقيها هنا تلقائيًا.</p>
          <Link className="btn btn-marker mx-auto w-fit text-sm" href="/games/chess">ابدأ مباراة</Link>
        </section>
      ) : (
        <>
          <section className="grid grid-cols-4 gap-2 text-center">
            <StatCard label="المباريات" value={entries.length} tone="normal" />
            <StatCard label="فوز" value={wins} tone="win" />
            <StatCard label="تعادل" value={draws} tone="normal" />
            <StatCard label="خسارة" value={losses} tone="loss" />
          </section>

          <section className="sheet-card divide-y p-0">
            {entries.map((e, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <span className="text-2xl">{e.won ? "🎉" : e.draw ? "🤝" : "💀"}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">
                    {e.result} ضد ماجيك — {AI_LEVELS[e.level as Difficulty]?.label ?? e.level}
                  </p>
                  <p className="truncate text-xs text-ink-soft">
                    {fmtDate(e.at)} · {e.personality} · {Math.ceil(e.plies / 2)} نقلات
                  </p>
                </div>
                <span className="mono text-xs font-bold text-ink-soft">{e.score}</span>
              </div>
            ))}
          </section>

          <button className="btn btn-quiet mx-auto w-fit text-xs" onClick={clear}>🗑️ مسح السجل</button>
        </>
      )}
    </PageShell>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "normal" | "win" | "loss" }) {
  const color = tone === "win" ? "text-emerald-600" : tone === "loss" ? "text-red-500" : "text-ink";
  return (
    <div className="sheet-card p-3">
      <p className={`mono text-xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-ink-soft">{label}</p>
    </div>
  );
}
