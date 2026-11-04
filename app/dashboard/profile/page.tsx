"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  nextUpgrade,
  findPlanPrice,
  buildWhatsappHref,
  type PublicPlan,
} from "@/lib/config/public-config";

export default function ProfilePage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [plan, setPlan] = useState<string>("free");
  const [quota, setQuota] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  /** رصيد الكريدت من /api/me/plan-quota — null = غير متاح (يُعرض «—»). */
  const [credits, setCredits] = useState<number | null>(null);
  /** إعدادات المنصة العامة من /api/config/public — null = تُخفى أزرارها. */
  const [config, setConfig] = useState<{
    whatsapp_number?: string;
    whatsapp_template?: string;
    plans?: PublicPlan[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;
        if (!user) { if (!cancelled) setLoading(false); return; }
        // نقرأ البروفايل أولًا لأن display_name مصدر أدق للاسم من metadata.
        const { data: prof } = await supabase
          .from("profiles")
          .select("public_user_code, avatar_url, display_name")
          .eq("id", user.id)
          .maybeSingle();
        if (!cancelled) {
          setEmail(user.email ?? null);
          setName(
            (((prof as any)?.display_name as string | null) ?? null) ||
              ((user.user_metadata?.full_name as string) ?? null)
          );
        }
        if (!cancelled && prof) {
          setCode((prof as any).public_user_code ?? null);
          setAvatarUrl((prof as any).avatar_url ?? null);
        }
        const res = await fetch("/api/usage", { credentials: "include" });
        if (res.ok) {
          const j = await res.json();
          if (!cancelled) { setPlan(j.planKey ?? "free"); setQuota(j); }
        }

        // الرصيد والباقة الفعلية — مسار قائم ومستقل؛ فشله لا يُسقط الصفحة.
        try {
          const qRes = await fetch("/api/me/plan-quota", { credentials: "include" });
          if (qRes.ok) {
            const q = await qRes.json();
            if (!cancelled) {
              if (typeof q?.credits === "number") setCredits(q.credits);
              if (typeof q?.tier === "string" && q.tier) setPlan(q.tier);
            }
          }
        } catch { /* اختياري */ }

        // إعدادات المنصة العامة (واتساب/الأسعار) — اختيارية أيضًا.
        try {
          const cRes = await fetch("/api/config/public");
          if (cRes.ok) {
            const c = await cRes.json();
            if (!cancelled) setConfig(c);
          }
        } catch { /* اختياري */ }
      } catch { if (!cancelled) setMsg("Failed to load profile."); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMsg(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) throw new Error("not authenticated");
      const path = `${user.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = pub.publicUrl;
      const { data: updated, error: updErr } = await supabase
        .from("profiles")
        .update({ avatar_url: url })
        .eq("id", user.id)
        .select("id");
      if (updErr) throw updErr;
      if (!updated || updated.length === 0) {
        const { error: insErr } = await supabase.from("profiles").insert({ id: user.id, avatar_url: url });
        if (insErr) throw insErr;
      }
      setAvatarUrl(url);
      setMsg("Avatar updated.");
    } catch (err: any) {
      setMsg(err?.message ?? "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleCopyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1500);
    } catch {
      setCodeCopied(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-4">
        <div className="h-32 rounded-[var(--r-lg)] bg-[var(--color-surface-2)] animate-pulse" />
        <div className="h-40 rounded-[var(--r-lg)] bg-[var(--color-surface-2)] animate-pulse" />
        <div className="h-44 rounded-[var(--r-lg)] bg-[var(--color-surface-2)] animate-pulse" />
      </div>
    );
  }

  const initial = (name || email || "U").charAt(0).toUpperCase();
  const isFree = plan === "free";

  // الاشتراك والرصيد: الباقة التالية + سعرها (من الإعدادات العامة) + رابط واتساب.
  const upgrade = nextUpgrade(plan);
  const targetPlanName = upgrade?.targetKey === "ultra" ? "Ultra" : "Pro";
  const targetPrice = upgrade ? findPlanPrice(config?.plans ?? null, upgrade.targetKey) : null;
  const whatsappHref = buildWhatsappHref({
    whatsappNumber: config?.whatsapp_number,
    template: config?.whatsapp_template,
    vars: {
      name: name ?? "",
      mag_code: code ?? "",
      plan_name: targetPlanName,
      price: targetPrice?.price ?? "",
    },
  });

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6 text-[var(--color-text-primary)]">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">الملف الشخصي</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">إدارة معلوماتك واشتراكك وحصصك</p>
        </div>
      </header>

      <section className="rounded-[var(--r-lg)] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-5 md:p-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <div className="relative shrink-0">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt="avatar"
                className="w-24 h-24 md:w-28 md:h-28 rounded-full object-cover border-2 border-[var(--color-border)]"
              />
            ) : (
              <div className="w-24 h-24 md:w-28 md:h-28 rounded-full bg-[var(--color-surface-2)] border-2 border-[var(--color-border)] flex items-center justify-center text-3xl font-bold">
                {initial}
              </div>
            )}
            <label
              className="absolute -bottom-1 -right-1 cursor-pointer rounded-full bg-[var(--color-primary)] text-[var(--on-marker,#fff)] w-9 h-9 flex items-center justify-center shadow-lg hover:opacity-90 transition"
              title="تغيير الصورة"
            >
              {uploading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <span aria-hidden>📷</span>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
                disabled={uploading}
              />
            </label>
          </div>

          <div className="flex-1 min-w-0 text-center sm:text-start space-y-2">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h2 className="text-xl font-bold truncate">{name || "—"}</h2>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  isFree
                    ? "bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-text-muted)]"
                    : "bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] border-[var(--color-primary)] text-[var(--color-primary)]"
                }`}
              >
                {plan}
              </span>
            </div>
            <p className="text-sm text-[var(--color-text-muted)] truncate" dir="ltr">{email || "—"}</p>
            {code && (
              <div className="flex items-center justify-center sm:justify-start gap-2 mt-1">
                <code
                  dir="ltr"
                  className="font-mono text-sm px-2.5 py-1 rounded-[var(--r-md)] bg-[var(--color-surface-2)] border border-[var(--color-border)]"
                >
                  {code}
                </code>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="text-xs px-2.5 py-1 rounded-[var(--r-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-1)] transition"
                >
                  {codeCopied ? "تم النسخ" : "نسخ"}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[var(--r-lg)] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-5 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-lg">الاشتراك والرصيد</h2>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
              isFree
                ? "bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-text-muted)]"
                : "bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] border-[var(--color-primary)] text-[var(--color-primary)]"
            }`}
          >
            {plan}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-[var(--r-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
            <p className="text-xs text-[var(--color-text-muted)]">رصيد الكريدت</p>
            <p className="mt-0.5 text-2xl font-bold" dir="ltr">
              {credits === null ? "—" : credits.toLocaleString("ar-EG")}
            </p>
          </div>
          <div className="rounded-[var(--r-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
            <p className="text-xs text-[var(--color-text-muted)]">الباقة الحالية</p>
            <p className="mt-0.5 text-2xl font-bold">{plan}</p>
          </div>
        </div>

        {(upgrade || whatsappHref) && (
          <div className="flex flex-wrap gap-2">
            {upgrade && (
              <Link
                href="/pricing"
                className="rounded-[var(--r-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-[var(--on-marker,#fff)] transition hover:opacity-90"
              >
                {upgrade.label}
              </Link>
            )}
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                className="rounded-[var(--r-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-sm font-bold transition hover:bg-[var(--color-surface-1)]"
              >
                تواصل عبر واتساب
              </a>
            )}
          </div>
        )}
      </section>

      <section className="rounded-[var(--r-lg)] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-5 md:p-6 space-y-3">
        <h2 className="font-semibold text-lg">معلومات الحساب</h2>
        <dl className="divide-y divide-[var(--color-border)]">
          <div className="flex items-center justify-between py-2.5 gap-3">
            <dt className="text-sm text-[var(--color-text-muted)]">الاسم</dt>
            <dd className="text-sm font-medium truncate">{name || "—"}</dd>
          </div>
          <div className="flex items-center justify-between py-2.5 gap-3">
            <dt className="text-sm text-[var(--color-text-muted)]">البريد الإلكتروني</dt>
            <dd className="text-sm font-medium truncate" dir="ltr">{email || "—"}</dd>
          </div>
          <div className="flex items-center justify-between py-2.5 gap-3">
            <dt className="text-sm text-[var(--color-text-muted)]">MAG ID</dt>
            <dd className="text-sm font-mono font-medium" dir="ltr">{code || "—"}</dd>
          </div>
          <div className="flex items-center justify-between py-2.5 gap-3">
            <dt className="text-sm text-[var(--color-text-muted)]">الخطة</dt>
            <dd className="text-sm font-medium">{plan}</dd>
          </div>
        </dl>
      </section>

      {quota && (
        <section className="rounded-[var(--r-lg)] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-5 md:p-6 space-y-4">
          <h2 className="font-semibold text-lg">حصص الرسائل</h2>

          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <span>يومي</span>
              <span className="text-[var(--color-text-muted)]">
                {quota.daily.used} / {quota.daily.limit === -1 ? "∞" : quota.daily.limit}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-[var(--color-surface-2)] overflow-hidden">
              <div
                className="h-full bg-[var(--color-progress)] transition-all"
                style={{ width: `${quota.daily.limit > 0 ? Math.min(100, (quota.daily.used / quota.daily.limit) * 100) : 0}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <span>شهري</span>
              <span className="text-[var(--color-text-muted)]">
                {quota.monthly.used} / {quota.monthly.limit === -1 ? "∞" : quota.monthly.limit}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-[var(--color-surface-2)] overflow-hidden">
              <div
                className="h-full bg-[var(--hl-green-fill)] transition-all"
                style={{ width: `${quota.monthly.limit > 0 ? Math.min(100, (quota.monthly.used / quota.monthly.limit) * 100) : 0}%` }}
              />
            </div>
          </div>
        </section>
      )}

      {msg && (
        <p className="text-sm text-[var(--color-text-muted)] text-center">{msg}</p>
      )}
    </div>
  );
}
