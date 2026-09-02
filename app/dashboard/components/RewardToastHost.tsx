"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

type RewardDetail = {
  source: string; // "signup_bonus" | "daily_login"
  awarded: number;
  balance: number;
};

type ToastItem = {
  id: number;
  source: string;
  awarded: number;
  balance: number;
};

/**
 * Phase 4.1A — Reward Toast + Micro animation
 * Listens to window "foundation:coins" dispatched by FoundationRewardsBootstrap
 * only when awarded > 0 (real reward). No hard-coded logic, no refresh spam.
 *
 * Once per reward event: deduplicated via sessionStorage + in-memory ref.
 * No sound, no confetti, no layout shift — just quiet motion.
 */
export default function RewardToastHost() {
  const reduceMotion = useReducedMotion();
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const [current, setCurrent] = useState<ToastItem | null>(null);
  const shownRef = useRef<Set<string>>(new Set());
  const idRef = useRef(1);

  // Show next in queue
  useEffect(() => {
    if (current) return;
    if (queue.length === 0) return;
    const next = queue[0];
    setCurrent(next);
    setQueue((q) => q.slice(1));
    const t = setTimeout(() => setCurrent(null), 3800);
    return () => clearTimeout(t);
  }, [queue, current]);

  // Also auto-advance after current dismissed
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => setCurrent(null), 3800);
    return () => clearTimeout(t);
  }, [current]);

  // When current cleared, allow next to show immediately
  useEffect(() => {
    if (current === null && queue.length > 0) {
      const timer = setTimeout(() => {
        setCurrent(queue[0]);
        setQueue((q) => q.slice(1));
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [current, queue]);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<RewardDetail>;
      const d = ce.detail;
      if (!d || typeof d.awarded !== "number" || d.awarded <= 0) return;
      const src = String(d.source || "");
      if (src !== "signup_bonus" && src !== "daily_login") return;

      // Deduplicate: per source + awarded + balance hash in this session
      const hash = `${src}:${d.awarded}:${d.balance}`;
      if (shownRef.current.has(hash)) return;
      // Also check sessionStorage for refresh guard (daily per UTC date, signup per lifetime)
      try {
        if (src === "signup_bonus") {
          const key = "magicly_toast_signup";
          if (sessionStorage.getItem(key) === hash) return;
          sessionStorage.setItem(key, hash);
          // also localStorage to never show again for old user on new session
          try {
            localStorage.setItem("magicly_signup_toast_done", "1");
          } catch {}
        } else if (src === "daily_login") {
          const today = new Date().toISOString().slice(0, 10);
          const key = `magicly_toast_daily_${today}`;
          if (sessionStorage.getItem(key) === hash) return;
          sessionStorage.setItem(key, hash);
        }
      } catch {}
      shownRef.current.add(hash);

      const item: ToastItem = {
        id: idRef.current++,
        source: src,
        awarded: d.awarded,
        balance: d.balance,
      };
      setQueue((q) => [...q, item]);
    };

    window.addEventListener("foundation:coins", handler as EventListener);
    return () => window.removeEventListener("foundation:coins", handler as EventListener);
  }, []);

  if (!current) {
    // Still need to keep AnimatePresence for exit animation, but return placeholder
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        <AnimatePresence>
          {null}
        </AnimatePresence>
      </div>
    );
  }

  const isSignup = current.source === "signup_bonus";
  const title = isSignup ? "🎉 أهلاً بيك في Magiclly!" : "☀️ مكافأة الدخول اليومية";
  const line2 = `+${current.awarded} Coins 🪙`;
  const line3 = `رصيدك الآن: ${current.balance} Coins`;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence>
        {current && (
          <motion.div
            key={current.id}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="pointer-events-auto relative overflow-hidden rounded-2xl border bg-[var(--card-primary)] backdrop-blur-xl px-5 py-4 shadow-[0_18px_44px_-18px_var(--shade-lift)] max-w-sm w-full"
            style={{ borderColor: "var(--rule)" }}
          >
            {/* Micro animation: floating +N */}
            <motion.div
              key={`float-${current.id}`}
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: [0, 1, 1, 0], y: [10, -6, -14, -22], scale: [0.9, 1.05, 1, 0.98] }
              }
              transition={{ duration: 1.4, ease: [0.22, 0.8, 0.36, 1], times: [0, 0.2, 0.6, 1] }}
              className="absolute -top-1 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 text-amber-950 text-xs font-extrabold px-2.5 py-1 shadow"
              aria-hidden
            >
              +{current.awarded} 🪙
            </motion.div>

            <div className="pt-3 text-center space-y-1">
              <p className="text-sm font-bold text-[var(--text)] leading-snug">{title}</p>
              <p className="text-sm font-extrabold text-amber-400">{line2}</p>
              <p className="text-xs text-[var(--text-muted)]">{line3}</p>
            </div>

            {/* subtle progress bar */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 3.6, ease: "linear" }}
              className="absolute bottom-0 inset-x-0 h-[2px] bg-[var(--accent)] origin-right opacity-40"
              aria-hidden
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
