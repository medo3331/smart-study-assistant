"use client";

import React, { useEffect, useState } from "react";
import { PageShell, EmptyState, LoadingSheets, DataNotice } from "../components/PageShell";
import { createClient } from "@/lib/supabase/client";

/* ==========================================================================
   صفحة الدعوات — كودي ورابطي ودعواتي

   - الكود والرابط: من /api/referrals/mine (اللي بيضمن إن الكود موجود).
   - الرابط المبني على الموقع الفعلي (NEXT_PUBLIC_SITE_URL أو الـ origin)
     بيودي على /register?ref=CODE — وReferralBootstrap بيلقط الـ ref
     ويسجّل الإحالة تلقائيًا أول ما الضيف يسجّل.
   - القايمة: تاريخ التسجيل + الحالة (بانتظار / تمت المكافأة).
   - «شعار الموافقة»: لو user_metadata.marketing_consent=true بيظهر Badge.
   ========================================================================== */

type ReferralEntry = {
  id: string;
  created_at: string;
  status: "pending" | "rewarded";
};

const STATUS_LABEL: Record<ReferralEntry["status"], string> = {
  pending: "بانتظار",
  rewarded: "تمت المكافأة",
};

function formatArabicDate(value: string): string {
  try {
    return new Date(value).toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return value;
  }
}

/** رابط الدعوة الكامل — الدومين من الإعداد، والفولباك هو الـ origin الفعلي. */
function buildInviteLink(code: string): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/register?ref=${encodeURIComponent(code)}`;
}

export default function ReferralsPage() {
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [referrals, setReferrals] = useState<ReferralEntry[]>([]);
  const [consentBadge, setConsentBadge] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!cancelled && user?.user_metadata) {
          setConsentBadge((user.user_metadata as { marketing_consent?: unknown }).marketing_consent === true);
        }

        const res = await fetch("/api/referrals/mine", { method: "POST" });
        const payload = (await res.json().catch(() => null)) as {
          success?: boolean;
          code?: string | null;
          referrals?: ReferralEntry[];
          error?: string;
        } | null;

        if (cancelled) return;
        if (!res.ok || !payload?.success) {
          throw new Error(payload?.error || "مقدرناش نجيب بيانات الدعوات.");
        }
        setCode(payload.code ?? null);
        setReferrals(Array.isArray(payload.referrals) ? payload.referrals : []);
      } catch (err) {
        if (!cancelled) {
          setDataError(err instanceof Error ? err.message : "حصل خطأ غير متوقع.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCopy() {
    if (!code) return;
    const link = buildInviteLink(code);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // الكليببورد مقفول (http أو صلاحيات) — الرابط متاح للتحديد اليدوي
      setDataError("مقدرناش ننسخ تلقائيًا — انسخ الرابط من الحقل يدويًا.");
    }
  }

  if (loading) {
    return (
      <PageShell eyebrow="// الدعوات" title="ادعو أصحابك" lede="شارك رابطك واكسب مكافآت على كل صديق يسجّل.">
        <LoadingSheets count={3} />
      </PageShell>
    );
  }

  if (dataError && !code) {
    return (
      <PageShell eyebrow="// الدعوات" title="ادعو أصحابك" lede="شارك رابطك واكسب مكافآت على كل صديق يسجّل.">
        <DataNotice message={dataError} />
      </PageShell>
    );
  }

  const inviteLink = code ? buildInviteLink(code) : "";
  const pendingCount = referrals.filter((r) => r.status === "pending").length;
  const rewardedCount = referrals.length - pendingCount;

  return (
    <PageShell
      eyebrow="// الدعوات"
      title="ادعو أصحابك"
      lede="شارك رابطك واكسب مكافآت على كل صديق يسجّل."
      feedbackPage="dashboard"
      feedbackLabel="صفحة الدعوات"
    >
      {/* ---- كودي ورابطي ---- */}
      <section className="sheet-card card-lift p-5 space-y-4" aria-labelledby="invite-title">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 id="invite-title" className="font-display font-extrabold text-base text-ink">
              رابط الدعوة بتاعك
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              أي حد يسجّل من الرابط ده بيتحسب إحالة ليك تلقائيًا.
            </p>
          </div>
          {consentBadge && (
            <span className="font-mono text-[10px] px-2 py-1 rounded bg-accent-2/10 border border-accent-2/20 text-accent-2">
              ✓ موافق على التواصل التسويقي
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <code
            dir="ltr"
            className="font-mono text-sm px-3 py-2 rounded bg-bg-2 border border-border text-accent select-all"
          >
            {code ?? "…"}
          </code>
          <button type="button" onClick={handleCopy} disabled={!code} className="btn btn-marker text-sm">
            {copied ? "✓ اتنسخ!" : "نسخ الرابط"}
          </button>
        </div>

        <p dir="ltr" className="font-mono text-[11px] text-ink-soft break-all select-all">
          {inviteLink}
        </p>
      </section>

      {/* ---- عدّادات ---- */}
      <section className="grid grid-cols-2 gap-3" aria-label="إحصائيات الدعوات">
        <div className="sheet-card p-4 text-center">
          <p className="font-mono text-2xl font-bold text-ink tabular-nums">{referrals.length}</p>
          <p className="mt-1 text-xs text-ink-soft">إجمالي الدعوات</p>
        </div>
        <div className="sheet-card p-4 text-center">
          <p className="font-mono text-2xl font-bold text-accent tabular-nums">{rewardedCount}</p>
          <p className="mt-1 text-xs text-ink-soft">تمت مكافأتها</p>
        </div>
      </section>

      {/* ---- قايمة الدعوات ---- */}
      <section className="space-y-2" aria-labelledby="invites-title">
        <h2 id="invites-title" className="font-display font-extrabold text-sm text-ink">
          اللي سجّلوا عن طريقك
          {pendingCount > 0 && <span className="text-ink-soft font-normal"> ({pendingCount} بانتظار)</span>}
        </h2>

        {referrals.length === 0 ? (
          <EmptyState
            icon="🎁"
            title="لسه محدش سجّل من رابطك"
            body="ابعت الرابط لأصحابك — وأول ما حد يسجّل هتشوفه هنا على طول."
            action={
              <button type="button" onClick={handleCopy} className="btn btn-marker text-sm">
                نسخ رابط الدعوة
              </button>
            }
          />
        ) : (
          referrals.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-3 p-3 bg-card border border-border rounded-xl"
            >
              <div className="min-w-0">
                <p className="text-sm text-ink">
                  صديق جديد <span className="font-mono text-[10px] text-ink-soft">سجّل {formatArabicDate(entry.created_at)}</span>
                </p>
              </div>
              <span
                className={
                  entry.status === "rewarded"
                    ? "shrink-0 font-mono text-[10px] px-2 py-1 rounded bg-accent/10 border border-accent/20 text-accent"
                    : "shrink-0 font-mono text-[10px] px-2 py-1 rounded bg-bg-2 border border-border text-ink-soft"
                }
              >
                {STATUS_LABEL[entry.status]}
              </span>
            </div>
          ))
        )}
      </section>
    </PageShell>
  );
}
