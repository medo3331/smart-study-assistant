"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/* ==========================================================================
   الكريديت والاستهلاك — /dashboard/credits

   يعرض للمستخدم:
     1) رصيده الحالي من الكريديت (من ai_credit_ledger).
     2) استهلاكه هذا الشهر بالتفصيل: إجمالي + حسب النوع + يوم بيوم.
     3) بيانات باقته لو مشترك: اسم الباقة + تاريخ الانتهاء + الأيام المتبقية.
     4) آخر العمليات على الرصيد.

   المصدر: GET /api/me/credits — فشله يعرض حالة خطأ ولا يسقط الصفحة.
   ========================================================================== */

const CARD =
  "rounded-[var(--r-lg)] border border-rule bg-paper-2 p-4 sm:p-5 space-y-3";

type UsageSlice = { key: string; label: string; used: number };
type DailyPoint = { date: string; used: number };
type RecentOp = { at: string; delta: number; label: string; reason: string; refId: string | null };

type CreditsPayload = {
  ok?: boolean;
  balance: number;
  month: {
    used: number;
    granted: number;
    byKind: UsageSlice[];
    daily: DailyPoint[];
    daysElapsed: number;
    daysInMonth: number;
  };
  subscription: {
    tier: string;
    planName: string;
    creditsMonthly: number;
    expiresAt: string | null;
    daysRemaining: number | null;
    expired: boolean;
    usedPercent: number | null;
  };
  recent: RecentOp[];
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
}

function fmtShortDate(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString("ar-EG", { day: "numeric", month: "numeric" });
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ar-EG", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function CreditsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CreditsPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
          if (!cancelled) router.replace("/login?next=/dashboard/credits");
          return;
        }
        const res = await fetch("/api/me/credits", { credentials: "include" });
        if (!res.ok) {
          if (!cancelled) setError("تعذّر تحميل بيانات الرصيد. حاول تحديث الصفحة.");
          return;
        }
        const payload = (await res.json()) as CreditsPayload;
        if (!cancelled) setData(payload);
      } catch {
        if (!cancelled) setError("تعذّر تحميل بيانات الرصيد. حاول تحديث الصفحة.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase, router]);

  const sub = data?.subscription;
  const month = data?.month;
  const maxDaily = Math.max(1, ...(month?.daily ?? []).map((d) => d.used));
  const maxKind = Math.max(1, ...(month?.byKind ?? []).map((k) => k.used));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow eyebrow-flush">الحساب</p>
          <h1 className="h2 mt-1">رصيد الكريديت والاستهلاك</h1>
        </div>
        <Link href="/dashboard/settings" className="tag tag-box shrink-0">← الإعدادات</Link>
      </div>

      {loading && (
        <div className={CARD} aria-busy>
          <p className="text-sm text-ink-soft">جارٍ التحميل…</p>
        </div>
      )}

      {!loading && error && (
        <div className={CARD} role="alert">
          <p className="text-sm font-semibold text-ink">{error}</p>
        </div>
      )}

      {!loading && data && (
        <>
          {/* ---- الرصيد الحالي ---- */}
          <section className={CARD} aria-label="الرصيد الحالي">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="eyebrow eyebrow-flush">الرصيد الحالي</p>
                <p className="text-4xl font-black text-ink tabular-nums mt-1" dir="ltr">
                  {data.balance.toLocaleString("ar-EG")}
                </p>
                <p className="text-xs text-ink-soft mt-1">كريديت متاح للاستخدام</p>
              </div>
              {sub && sub.creditsMonthly > 0 && (
                <div className="text-left">
                  <p className="text-xs text-ink-soft">من أصل شهري</p>
                  <p className="mono text-lg font-bold text-ink" dir="ltr">
                    {sub.creditsMonthly.toLocaleString("ar-EG")}
                  </p>
                </div>
              )}
            </div>
            {sub && sub.creditsMonthly > 0 && sub.usedPercent !== null && (
              <div>
                <div
                  className="h-2.5 w-full rounded-full bg-paper overflow-hidden border border-rule"
                  role="progressbar"
                  aria-valuenow={sub.usedPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="نسبة استهلاك الشهر"
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${sub.usedPercent}%`,
                      background: sub.usedPercent >= 80 ? "#E23A3A" : "#10B981",
                    }}
                  />
                </div>
                <p className="text-xs text-ink-soft mt-1.5">
                  استهلكت <b className="text-ink" dir="ltr">{month?.used.toLocaleString("ar-EG")}</b> هذا الشهر
                  {" "}({sub.usedPercent}% من باقتك)
                </p>
              </div>
            )}
          </section>

          {/* ---- الباقة والانتهاء ---- */}
          <section className={CARD} aria-label="الباقة">
            <p className="eyebrow eyebrow-flush">الباقة</p>
            {sub && sub.tier !== "free" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-ink">{sub.planName}</span>
                  <span className="tag tag-box">{sub.tier}</span>
                </div>
                {sub.expiresAt ? (
                  sub.expired ? (
                    <p className="text-sm font-semibold" style={{ color: "#E23A3A" }}>
                      انتهت صلاحية الباقة في {fmtDate(sub.expiresAt)}
                    </p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-ink-soft">تاريخ الانتهاء</span>
                        <span className="font-semibold text-ink">{fmtDate(sub.expiresAt)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-ink-soft">المتبقي</span>
                        <span className="font-semibold text-ink" dir="ltr">
                          {sub.daysRemaining} يوم
                        </span>
                      </div>
                      {sub.daysRemaining !== null && sub.daysRemaining <= 7 && (
                        <p className="text-xs font-semibold" style={{ color: "#E23A3A" }}>
                          ⚠️ باقتك على وشك الانتهاء — جدّد للاستمرار في المزايا.
                        </p>
                      )}
                    </>
                  )
                ) : (
                  <p className="text-sm text-ink-soft">باقة بدون تاريخ انتهاء.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-ink-soft">
                أنت على الباقة المجانية — لا يوجد تاريخ انتهاء.
              </p>
            )}
          </section>

          {/* ---- استهلاك الشهر بالتفصيل ---- */}
          <section className={CARD} aria-label="استهلاك الشهر">
            <p className="eyebrow eyebrow-flush">استهلاك الشهر بالتفصيل</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[var(--r-sm)] border border-rule bg-paper p-3">
                <p className="text-xs text-ink-soft">استُهلك هذا الشهر</p>
                <p className="text-xl font-black text-ink tabular-nums" dir="ltr">
                  {(month?.used ?? 0).toLocaleString("ar-EG")}
                </p>
              </div>
              <div className="rounded-[var(--r-sm)] border border-rule bg-paper p-3">
                <p className="text-xs text-ink-soft">أُضيف هذا الشهر</p>
                <p className="text-xl font-black text-ink tabular-nums" dir="ltr">
                  {(month?.granted ?? 0).toLocaleString("ar-EG")}
                </p>
              </div>
            </div>

            {month && month.byKind.length > 0 && (
              <div className="space-y-2 pt-1">
                <p className="text-xs font-bold text-ink">استهلكت في إيه؟</p>
                {month.byKind.map((k) => (
                  <div key={k.key} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-ink">{k.label}</span>
                      <span className="mono text-ink-soft" dir="ltr">{k.used.toLocaleString("ar-EG")}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-paper overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(4, (k.used / maxKind) * 100)}%`, background: "#4FA9F5" }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {month && month.daily.length > 0 && (
              <div className="space-y-2 pt-1">
                <p className="text-xs font-bold text-ink">
                  يوم بيوم ({month.daysElapsed} من {month.daysInMonth} يوم)
                </p>
                <div className="flex items-end gap-1 h-20" aria-hidden>
                  {month.daily.map((d) => (
                    <div
                      key={d.date}
                      className="flex-1 rounded-t"
                      style={{
                        height: d.used > 0 ? `${Math.max(8, (d.used / maxDaily) * 100)}%` : "4px",
                        background: d.used > 0 ? "#4FA9F5" : "var(--rule, #e5e7eb)",
                        minWidth: "4px",
                      }}
                      title={`${d.date}: ${d.used}`}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-ink-soft">
                  <span>{fmtShortDate(month.daily[0]?.date ?? "")}</span>
                  <span>{fmtShortDate(month.daily[month.daily.length - 1]?.date ?? "")}</span>
                </div>
              </div>
            )}
          </section>

          {/* ---- آخر العمليات ---- */}
          <section className={CARD} aria-label="آخر العمليات">
            <p className="eyebrow eyebrow-flush">آخر العمليات</p>
            {data.recent.length === 0 ? (
              <p className="text-sm text-ink-soft">لا توجد عمليات بعد.</p>
            ) : (
              <ul className="m-0 list-none p-0 space-y-0 divide-y divide-rule">
                {data.recent.map((op, i) => (
                  <li key={`${op.at}-${i}`} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{op.label}</p>
                      <p className="text-[11px] text-ink-soft">{fmtDateTime(op.at)}</p>
                    </div>
                    <span
                      className="mono text-sm font-bold shrink-0"
                      dir="ltr"
                      style={{ color: op.delta < 0 ? "#E23A3A" : "#10B981" }}
                    >
                      {op.delta > 0 ? "+" : ""}{op.delta}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
