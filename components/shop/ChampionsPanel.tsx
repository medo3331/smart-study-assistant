"use client";

/* ==========================================================================
   Magicly Weekly Champions — التصميم §7
   الترتيب بمكافآت الدراسة الحقيقية (source_class='study') — مش بعدد
   الكوينز المشتراة. الأسبوع الحالي (حتى الآن) + الفائزون بالأسبوع الماضي.
   البيانات من weekly_champions_board() (db/118) — بدون جداول جديدة في الكلاينت.
   ========================================================================== */

import { useEffect, useState } from "react";
import { Trophy, Medal } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";

type BoardRow = {
  scope: string;
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  coins: number;
};

const RANK_COINS: Record<number, string> = { 1: "200", 2: "150", 3: "100" };

function Row({ row, me }: { row: BoardRow; me: string | null }) {
  const mine = me === row.user_id;
  return (
    <li
      className={`flex items-center gap-3 rounded-[var(--r-sm,8px)] border px-3 py-2 ${
        mine ? "border-amber-400/60 bg-amber-400/10" : "border-rule bg-paper-2"
      }`}
    >
      <span className="mono text-[11px] text-ink-soft w-8 text-center" aria-label={`المركز ${row.rank}`}>
        {row.rank === 1 ? <Medal className="w-4 h-4 text-amber-500 inline" aria-hidden /> : row.rank}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink" dir="auto">
        {row.display_name}
        {mine && <span className="text-amber-500"> — أنت</span>}
      </span>
      <span className="mono text-[11px] text-ink-soft">
        {RANK_COINS[row.rank] ? `🪙 ${RANK_COINS[row.rank]}` : `🪙 ${row.coins}`}
      </span>
    </li>
  );
}

export function ChampionsPanel({ supabase }: { supabase: SupabaseClient | null }) {
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void (async () => {
      const [{ data: board }, { data: auth }] = await Promise.all([
        supabase.rpc("weekly_champions_board"),
        supabase.auth.getUser(),
      ]);
      if (!alive) return;
      setRows((board as BoardRow[]) ?? []);
      setUserId(auth?.user?.id ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  const current = (rows ?? []).filter((r) => r.scope === "current");
  const last = (rows ?? []).filter((r) => r.scope === "last_week");

  return (
    <section className="space-y-3" aria-labelledby="champions-title">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 id="champions-title" className="font-display font-extrabold text-[15px] text-ink flex items-center gap-2">
          <Trophy className="w-4 h-4 text-ink-soft" aria-hidden />
          أبطال الأسبوع
        </h2>
        <span className="mono text-[11px] text-ink-soft">
          الترتيب بالمذاكرة — الجوائز: <b className="text-ink">200 / 150 / 100</b> كوين
        </span>
      </div>

      <div className="rounded-[var(--r-md,12px)] border border-rule bg-paper-2 p-4 space-y-4">
        {!rows ? (
          <p className="text-[12px] text-ink-soft">بيحمّل الترتيب…</p>
        ) : rows.length === 0 ? (
          <p className="text-[12px] text-ink-soft">
            لسه مفيش ترتيب — كمل دروس واختبارات الأسبوع ده وتبقى أول بطل.
          </p>
        ) : (
          <>
            <div>
              <p className="text-[11px] font-bold text-ink-soft mb-2">ترتيب الأسبوع الحالي (حتى الآن)</p>
              {current.length === 0 ? (
                <p className="text-[12px] text-ink-soft">لسه مفيش كوينز مذاكرة الأسبوع ده — كن الأول.</p>
              ) : (
                <ul className="space-y-1.5">
                  {current.map((r) => <Row key={`c-${r.user_id}`} row={r} me={userId} />)}
                </ul>
              )}
            </div>
            {last.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-ink-soft mb-2">فائزو الأسبوع الماضي 🏆</p>
                <ul className="space-y-1.5">
                  {last.map((r) => <Row key={`l-${r.user_id}`} row={r} me={userId} />)}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
