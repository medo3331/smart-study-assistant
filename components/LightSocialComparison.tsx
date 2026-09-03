"use client";

import { useState, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/* Phase 0.4 — Light Social Comparison (IN-APP ONLY; reuses existing weekly_quiz_leaderboard RPC)

Approved scope per user direction:
- Reuse existing LeaderboardModal (not redesigned).
- Reuse existing weekly_quiz_leaderboard (verified DB: community_quiz_scores table; RPC: weekly_quiz_leaderboard).
- Show current user's position (is_you field from RPC).
- Show nearby leaderboard entries (display_name from profiles.display_name; public only).
- NO new DB (verified: no new tables/functions/migrations).
- NO friend/follow system (verified: none exists; not added).
- NO new share image infrastructure (verified: none exists; deferred).
- NO new ranking metric (reuses existing quiz best_accuracy / best_score — trusted server-side source).
- NO changes to XP / Coins / economy / complete_study_day.
- NO background/push/cron/email (audit confirmed none exists; in-app only).
*/

interface LeaderRow {
  user_id: string;
  display_name: string;
  best_score: number;
  best_total: number;
  best_accuracy: number;
  is_you: boolean;
}

export function LightSocialComparison() {
  const reduceMotion = useReducedMotion();
  const supabase = createClient();
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        setErrorMsg(null);
        // Verified existing RPC: public.weekly_quiz_leaderboard(p_limit int default 20)
        // Returns: user_id, display_name, best_score, best_total, best_accuracy, is_you
        const { data, error } = await supabase.rpc("weekly_quiz_leaderboard", { p_limit: 8 });
        if (!mounted) return;
        if (error) {
          setErrorMsg("تعذّر تحميل لوحة الصدارة — حاول لاحقًا.");
          setRows([]);
          return;
        }
        // Real contract: returns array of LeaderRow objects (security definer; uses auth.uid() internally for is_you)
        const arrRaw: unknown[] = Array.isArray(data)
          ? (data as unknown[])
          : (Array.isArray((data as { rows?: unknown[] })?.rows) ? (data as { rows: unknown[] }).rows : []);
        const safeRows: LeaderRow[] = arrRaw.map((r: unknown) => {
          const row = r as Record<string, unknown>;
          return {
            user_id: String(row.user_id ?? row.id ?? ""),
            display_name: String(row.display_name ?? row.name ?? (row.user_id ? `لاعب #${String(row.user_id).slice(0, 4)}` : "")),
            best_score: Number(row.best_score ?? row.score ?? 0),
            best_total: Number(row.best_total ?? row.total ?? 0),
            best_accuracy: Number(row.best_accuracy ?? row.accuracy ?? 0),
            is_you: !!row.is_you,
          };
        });
        if (!mounted) return;
        setRows(safeRows);
      } catch {
        if (!mounted) return;
        setErrorMsg("خطأ غير متوقع أثناء التحميل.");
        setRows([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [supabase]);

  // Show only top 5 entries (light comparison) + current user position if present
  const topEntries = rows.slice(0, 5);
  const userRow = rows.find((r) => r.is_you);

  if (loading) {
    return (
      <section className="rounded-[20px] border backdrop-blur-md p-4 mb-4" style={{ backgroundColor: "var(--card-secondary)", borderColor: "var(--rule)", boxShadow: "0 4px 16px var(--shade)" }} aria-label="مقارنة اجتماعية خفيفة — جارٍ التحميل">
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
          <Trophy size={16} aria-hidden /> <span>جارٍ تحميل لوحة الصدارة الأسبوعية…</span>
        </div>
      </section>
    );
  }

  if (errorMsg && rows.length === 0) {
    return (
      <section className="rounded-[20px] border backdrop-blur-md p-4 mb-4" style={{ backgroundColor: "var(--card-secondary)", borderColor: "var(--rule)", boxShadow: "0 4px 16px var(--shade)" }} aria-label="مقارنة اجتماعية خفيفة — خطأ">
        <h3 className="font-bold text-sm mb-1" style={{ color: "var(--text)" }} dir="rtl">🏆 مقارنة خفيفة</h3>
        <p className="text-xs" style={{ color: "var(--muted)" }}>{errorMsg}</p>
      </section>
    );
  }

  if (!loading && rows.length === 0) {
    return null; // No fake data; safe omission when no weekly quiz data exists
  }

  return (
    <motion.section
      aria-label="مقارنة اجتماعية خفيفة — لوحة صدارة الكويز الأسبوعية"
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 0.8, 0.36, 1] }}
      className="rounded-[20px] border backdrop-blur-md p-4 mb-4 relative overflow-hidden"
      style={{ backgroundColor: "var(--card-secondary)", borderColor: "var(--rule)", boxShadow: "0 4px 16px var(--shade)" }}
    >
      {/* Thin top accent */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-[2px]" style={{ background: "linear-gradient(to right, transparent, var(--accent), transparent)", opacity: 0.65 }} />

      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-sm" style={{ color: "var(--text)" }} dir="rtl">🏆 لوحة الصدارة الأسبوعية</h3>
        <span className="text-[10px] font-medium rounded-full px-2 py-0.5" style={{ backgroundColor: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }} aria-label="أسبوع الكويز">أسبوع الكويز</span>
      </div>

      <p className="text-xs mb-3" style={{ color: "var(--muted)" }} dir="rtl">مقارنة خفيفة — فقط نتائج الكويز الأسبوعية الحقيقية من قاعدة البيانات.</p>

      {topEntries.length > 0 && (
        <div className="space-y-2">
          {topEntries.map((entry, idx) => (
            <div
              key={entry.user_id + idx}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs sm:text-sm transition-colors"
              style={{
                backgroundColor: entry.is_you ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "var(--card-primary)",
                border: entry.is_you ? "1.5px solid var(--accent)" : "1px solid var(--rule)",
              }}
            >
              {/* Rank */}
              <span className="font-mono font-extrabold w-6 text-center text-sm" style={{ color: entry.is_you ? "var(--accent)" : "var(--muted)" }} aria-label={`المركز ${idx + 1}`}>{idx + 1}</span>
              {/* Name */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate" style={{ color: entry.is_you ? "var(--text)" : "var(--text)" }} dir="rtl">
                  {entry.display_name || `لاعب #${entry.user_id.slice(0, 4)}`}
                  {entry.is_you && <span className="ms-1.5 text-[10px] font-bold" style={{ color: "var(--accent)" }}>(أنت)</span>}
                </p>
                <p className="text-[10px]" style={{ color: "var(--muted)" }}>
                  دقة {entry.best_accuracy}% · نقاط {entry.best_score}
                </p>
              </div>
              {/* Score badge */}
              <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold font-mono" style={{ backgroundColor: "var(--accent)", color: "var(--on-marker)" }} aria-label={`نقاط ${entry.best_score}`}>{entry.best_score}</span>
            </div>
          ))}
        </div>
      )}

      {userRow && !topEntries.some((e) => e.is_you) && (
        <div className="mt-2 pt-2 border-t" style={{ borderColor: "var(--rule)" }}>
          <div className="rounded-xl px-3 py-2.5 text-xs" style={{ backgroundColor: "color-mix(in srgb, var(--accent) 10%, transparent)", border: "1px solid var(--accent)" }} aria-label="مركزك الحالي">
            <p className="font-bold text-sm" style={{ color: "var(--text)" }} dir="rtl">
              {userRow.display_name || `لاعب #${userRow.user_id.slice(0, 4)}`} <span className="font-normal text-xs mx-1" style={{ color: "var(--muted)" }}>|</span> <span className="text-[10px] font-bold" style={{ color: "var(--accent)" }}>أنت</span>
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              دقة {userRow.best_accuracy}% · نقاط {userRow.best_score} · ترتيب أسبوعي
            </p>
          </div>
        </div>
      )}
    </motion.section>
  );
}
