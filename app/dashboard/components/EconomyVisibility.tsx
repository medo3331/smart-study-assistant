"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fetchBalance } from "@/lib/shop/shop-data";

type AiUsage = {
  ok: boolean;
  isPremium?: boolean;
  isAnonymous?: boolean;
  text?: { limit: number; used: number; remaining: number; windowHours: number; retryAfter?: number; oldestAt?: string };
  vision?: { limit: number; used: number; remaining: number; windowHours: number; retryAfter?: number; oldestAt?: string };
  guest?: { limit: number; used: number; remaining: number; windowHours: number; retryAfter?: number };
};

function formatRetry(seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `بعد ${h}س ${m}د`;
  if (h > 0) return `بعد ${h}س`;
  if (m > 0) return `بعد ${m}د`;
  return `بعد أقل من دقيقة`;
}

/**
 * Phase 4.1A — Coins Balance (real source: coin_balance via fetchBalance)
 * Compact pill, no large card, no hard-coded amount.
 */
export function CoinsBalanceCard() {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [burst, setBurst] = useState<number | null>(null);
  const reduceMotion = useReducedMotion();
  const burstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    void (async () => {
      try {
        const res = await fetchBalance(supabase);
        if (!alive) return;
        if (res.data !== null) setBalance(res.data);
      } catch {}
      if (alive) setLoading(false);
    })();

    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ awarded?: number; balance?: number }>;
      const d = ce.detail;
      if (!d || typeof d.balance !== "number" || typeof d.awarded !== "number" || d.awarded <= 0) return;
      if (!alive) return;
      setBalance(d.balance);
      // micro burst +N
      setBurst(d.awarded);
      if (burstTimer.current) clearTimeout(burstTimer.current);
      burstTimer.current = setTimeout(() => setBurst(null), 1400);
    };
    window.addEventListener("foundation:coins", handler as EventListener);

    // Also listen to generic shop balance updates if any (purchase, wheel) — not required but keeps pill fresh
    const onShopBalance = (e: Event) => {
      const ce = e as CustomEvent<{ balance?: number }>;
      if (typeof ce.detail?.balance === "number") setBalance(ce.detail.balance);
    };
    window.addEventListener("shop:balance", onShopBalance as EventListener);

    return () => {
      alive = false;
      window.removeEventListener("foundation:coins", handler as EventListener);
      window.removeEventListener("shop:balance", onShopBalance as EventListener);
      if (burstTimer.current) clearTimeout(burstTimer.current);
    };
  }, []);

  return (
    <div
      className="relative overflow-hidden rounded-2xl border backdrop-blur-xl p-4 flex items-center justify-between"
      style={{ backgroundColor: "var(--card-primary)", borderColor: "var(--rule)", boxShadow: "0 8px 24px var(--shade)" }}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/15 text-amber-400 text-lg">🪙</div>
        <div>
          <p className="text-xs font-semibold text-[var(--text-muted)] tracking-wide">Coins</p>
          {loading ? (
            <div className="mt-1 h-5 w-16 animate-pulse rounded bg-[var(--rule)]" aria-hidden />
          ) : (
            <p className="text-lg font-extrabold text-[var(--text)] leading-none mt-0.5">
              {balance ?? 0}
            </p>
          )}
        </div>
      </div>

      <div className="text-left">
        <Link
          href="/shop"
          className="text-xs font-semibold text-[var(--accent)] hover:opacity-80 transition"
        >
          المتجر ←
        </Link>
        <p className="text-[11px] text-[var(--text-muted)] mt-1">الرصيد من coin_balance()</p>
      </div>

      {/* micro +N burst */}
      <AnimatePresence>
        {burst !== null && (
          <motion.div
            key={`burst-${burst}-${Date.now()}`}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.9 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: -12, scale: 1 }}
            exit={{ opacity: 0, y: -22, scale: 0.95 }}
            transition={{ duration: 0.9, ease: [0.22, 0.8, 0.36, 1] }}
            className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 text-amber-950 text-xs font-extrabold px-2 py-0.5 shadow"
            aria-hidden
          >
            +{burst} 🪙
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Phase 4.1A — AI Usage (real source: ai_credit_ledger via /api/ai/usage → checkAiRateLimit)
 * Shows used/limit, remaining, reset hint. No mock, no hard-coded 10.
 */
export function AiUsageCard() {
  const [data, setData] = useState<AiUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await fetch("/api/ai/usage", { cache: "no-store" });
        const j = (await r.json()) as AiUsage;
        if (!alive) return;
        if (j?.ok) setData(j);
        else setData(null);
      } catch {
        if (alive) setData(null);
      }
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const isPremium = Boolean(data?.isPremium);
  const isGuest = Boolean(data?.isAnonymous);

  // Prefer text bucket for main AI chat; vision separate as secondary.
  const text = data?.text;
  const vision = data?.vision;

  return (
    <div
      className="relative overflow-hidden rounded-2xl border backdrop-blur-xl p-4"
      style={{ backgroundColor: "var(--card-primary)", borderColor: "var(--rule)", boxShadow: "0 8px 24px var(--shade)" }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#7C5CFF]/15 text-[#7C5CFF] text-lg">🤖</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-[var(--text-muted)]">AI Usage</p>
          {loading ? (
            <div className="mt-1 h-4 w-24 animate-pulse rounded bg-[var(--rule)]" aria-hidden />
          ) : isPremium ? (
            <p className="text-sm font-bold text-[var(--text)]">غير محدود ✨ <span className="text-xs font-normal text-[var(--text-muted)]">— Premium</span></p>
          ) : isGuest && data?.guest ? (
            <p className="text-sm font-bold text-[var(--text)]">
              {data.guest.used} / {data.guest.limit}
              <span className="text-xs font-normal text-[var(--text-muted)]"> — متبقي {data.guest.remaining}</span>
            </p>
          ) : text ? (
            <p className="text-sm font-bold text-[var(--text)]">
              {text.used} / {text.limit}
              <span className="text-xs font-normal text-[var(--text-muted)]"> — متبقي {text.remaining}</span>
            </p>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">غير متاح حالياً</p>
          )}
        </div>
        <Link href="/dashboard/agents" className="text-xs font-semibold text-[var(--accent)] hover:opacity-80 transition shrink-0">
          المساعد ←
        </Link>
      </div>

      {!loading && !isPremium && text && (
        <>
          {/* progress */}
          <div className="h-1.5 rounded-full bg-[var(--rule)] overflow-hidden" aria-hidden>
            <div
              className="h-full bg-[#7C5CFF] transition-all duration-500"
              style={{ width: `${Math.min(100, Math.round((text.used / Math.max(1, text.limit)) * 100))}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] leading-none">
            <span className="text-[var(--text-muted)]">
              {(() => {
                const retry = formatRetry((text as { retryAfter?: number }).retryAfter);
                if (retry) return `يتجدد ${retry}`;
                return `يتجدد كل ${text.windowHours} ساعات`;
              })()}
            </span>
            <span className="font-semibold text-[var(--text)]">
              {text.remaining > 0 ? `متبقي ${text.remaining}` : "وصلت للحد — انتظر"}
            </span>
          </div>
        </>
      )}

      {!loading && !isPremium && vision && vision.limit > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--rule)] flex items-center justify-between gap-2 text-[11px]">
          <span className="text-[var(--text-muted)]">الصور/الملفات: {vision.used} / {vision.limit}</span>
          <span className="text-[var(--text-muted)]">
            {(() => {
              const r = formatRetry((vision as { retryAfter?: number }).retryAfter);
              return r ? `يتجدد ${r}` : `كل ${vision.windowHours}س`;
            })()}
          </span>
        </div>
      )}

      {loading && <p className="text-[11px] text-[var(--text-muted)] mt-2">جاري الحساب من ai_credit_ledger…</p>}
      {!loading && !text && !isPremium && <p className="text-[11px] text-[var(--text-muted)]">لا يمكن حساب الاستهلاك الآن — حاول لاحقاً.</p>}
    </div>
  );
}

export function EconomyStrip() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <CoinsBalanceCard />
      <AiUsageCard />
    </div>
  );
}
