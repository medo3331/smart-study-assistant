"use client";

import React, { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/**
 * أزرار مزوّدي الدخول المشتركة بين /login و /register.
 *
 * - Google: OAuth عبر Supabase. الزرار ده هيشتغل أول ما مفاتيح Google
 *   تتضاف في مشروع Supabase (Authentication → Providers → Google) —
 *   قبل كده Supabase بيرجع خطأ واضح بنعرضه في مكان الرسائل.
 *   خطوات الإعداد في docs/auth-google-setup.md.
 * - Phone: معطّل بقرار المرحلة دي (محتاج مزود SMS مدفوع) — بيظهر بحالة «قريبًا».
 */

/** رابط واحد لكل رسائل Supabase — نفس منطق authCallbackUrl في صفحة اللوجين. */
function authCallbackUrl(next: string): string {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const appUrl = configuredSiteUrl || window.location.origin;
  return `${appUrl}/auth/callback?next=${encodeURIComponent(next)}`;
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function GoogleAuthButton({ next = "/onboarding" }: { next?: string }) {
  const supabase = createClient();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogle(): Promise<void> {
    setLoading(true);
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: authCallbackUrl(next) },
    });
    // النجاح بيعمل redirect كامل للخارج، فإحنا هنا معناه فشل فقط.
    if (oauthError) {
      console.error("Google OAuth error:", oauthError.message);
      setError(oauthError.message);
      setLoading(false);
    }
  }

  return (
    <div className="stack" style={{ gap: "8px" }}>
      <button type="button" className="btn btn-quiet btn-block" onClick={handleGoogle} disabled={loading}>
        <GoogleIcon />
        {loading ? t.login_loading : t.auth_google_cta}
      </button>
      {error && (
        <p className="small muted" style={{ margin: 0 }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * 🟡 حالة «قريبًا» — قرار المرحلة دي: جوجل زي الموبايل، الزرار بيظهر
 *   معطّل لحد ما مفاتيح Google تتضاف في Supabase (docs/auth-google-setup.md).
 *   الكود الفعلي فوق جاهز — التفعيل سطر واحد: استبدل GoogleSoonButton
 *   بـ GoogleAuthButton في ProviderRow تحت.
 */
export function GoogleSoonButton() {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      className="btn btn-quiet btn-block"
      disabled
      aria-disabled="true"
      title={t.auth_phone_soon}
      style={{ justifyContent: "space-between" }}
    >
      <span className="row" style={{ gap: "10px" }}>
        <GoogleIcon />
        {t.auth_google_cta}
      </span>
      <span className="mono muted">{t.auth_phone_soon}</span>
    </button>
  );
}

export function PhoneSoonButton() {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      className="btn btn-quiet btn-block"
      disabled
      aria-disabled="true"
      title={t.auth_phone_soon}
      style={{ justifyContent: "space-between" }}
    >
      <span className="row" style={{ gap: "10px" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="5" y="2" width="14" height="20" rx="2" />
          <path d="M12 18h.01" />
        </svg>
        {t.auth_phone_cta}
      </span>
      <span className="mono muted">{t.auth_phone_soon}</span>
    </button>
  );
}

/** الصف كامل: فاصل + جوجل + الهاتف — الشكل الموحد في الشاشات.
    ⚠️ قرار المرحلة: الاتنين «قريبًا» لحد ما المفاتيح تجهز —
    التفعيل لاحقًا = استبدال GoogleSoonButton بـ GoogleAuthButton هنا
    وإرجاع خاصية next للصف. */
export function ProviderRow() {
  const { t } = useLanguage();
  return (
    <>
      <div className="divider small">{t.auth_or_continue}</div>
      <div className="stack" style={{ gap: "8px" }}>
        <GoogleSoonButton />
        <PhoneSoonButton />
      </div>
    </>
  );
}
