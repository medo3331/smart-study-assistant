"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { TopControls } from "@/components/TopControls";
import { BrandLock } from "@/components/BrandLogo";
import { ProviderRow } from "@/components/AuthProviders";

/**
 * 📝 Create Account — المحطة التانية في التدفّق:
 *   Welcome → Create Account → Choose Login Method (داخل /login).
 *
 * - نفس قواعد الأمان الموجودة: safeNext ضد open redirect، وقراءة next
 *   وقت الضغط مش وقت الرسم عشان الـbuild الستاتيكي.
 * - بعد النجاح: لو فيه جلسة → الأونبوردنج. لو مفيش (تأكيد البريد مفعّل)
 *   → شاشة «افحص بريدك» — والـproxy بيرجّعه للأونبوردنج أول ما يأكّد.
 */

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/onboarding";
  return raw;
}

/** قراءة next وقت الضغط — نفس نمط resolveNext في صفحة اللوجين. */
function currentNext(fallback = "/onboarding"): string {
  if (typeof window === "undefined") return fallback;
  return safeNext(new URLSearchParams(window.location.search).get("next"));
}

/** رابط واحد لكل رسائل Supabase — نفس منطق authCallbackUrl في اللوجين. */
function authCallbackUrl(next: string): string {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const appUrl = configuredSiteUrl || window.location.origin;
  return `${appUrl}/auth/callback?next=${encodeURIComponent(next)}`;
}

export default function RegisterPage() {
  const router = useRouter();
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const { t } = useLanguage();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  /** نجاح بلا جلسة = مستنيين تأكيد البريد — بنعرض حالة مخصوصة بدل الفورم. */
  const [pendingEmailConfirm, setPendingEmailConfirm] = useState(false);

  /* حساب حقيقي داخل بالفعل؟ ملوش شغل هنا (تأكيد إضافي فوق شغل الـproxy). */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!supabaseRef.current) supabaseRef.current = createClient();
      const { data } = await supabaseRef.current.auth.getUser();
      if (!cancelled && data.user && !data.user.is_anonymous) {
        router.replace(currentNext());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function passwordScore(value: string): number {
    let score = 0;
    if (value.length >= 6) score++;
    if (value.length >= 10) score++;
    if (value.length >= 6 && /\d/.test(value) && /[^\d]/.test(value)) score++;
    return score;
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    if (!supabaseRef.current) supabaseRef.current = createClient();
    const supabase = supabaseRef.current;

    /* رقّية الزائر: نفس سلوك اللوجين الحالي — الجلسة تفضل شغالة. */
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user?.is_anonymous) {
      const { error } = await supabase.auth.updateUser(
        { email, password, data: { full_name: fullName } },
        { emailRedirectTo: authCallbackUrl(currentNext()) },
      );
      setLoading(false);
      if (error) {
        setMessage({ type: "error", text: error.message.includes("already") ? t.login_err_exists : t.login_err_signup });
        return;
      }
      setMessage({ type: "success", text: t.login_ok_linked });
      setPendingEmailConfirm(true);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: authCallbackUrl(currentNext()),
      },
    });

    if (error) {
      setLoading(false);
      setMessage({ type: "error", text: error.message.includes("already") ? t.login_err_exists : t.login_err_signup });
      return;
    }

    if (data.session) {
      // تأكيد الإيميل متجاوز أو الرابط سبق أكّده → جلسة جاهزة: يلا للأونبوردنج.
      router.push(currentNext());
      router.refresh();
      return;
    }
    // تأكيد البريد مفعّل → مفيش جلسة. الرسالة هي الشاشة المؤقتة لحد الضغط.
    setLoading(false);
    setPendingEmailConfirm(true);
  }

  const pwScore = passwordScore(password);
  const pwText =
    password.length === 0 ? t.register_pw_hint : pwScore <= 1 ? t.register_pw_weak : pwScore === 2 ? t.register_pw_medium : t.register_pw_strong;

  if (pendingEmailConfirm) {
    return (
      <div className="auth">
        <aside className="auth-aside ruled">
          <BrandLock />
          <div className="stack" style={{ gap: "16px" }}>
            <h1 className="h2" style={{ maxWidth: "18ch" }}>
              {t.login_title_a} <span className="mark">{t.login_title_mark}</span>
            </h1>
            <p className="lede">{t.login_subtitle}</p>
          </div>
          <Link href="/" className="mono muted" style={{ textDecoration: "none" }}>
            ← {t.login_back}
          </Link>
        </aside>

        <div className="auth-main">
          <div className="auth-form stack" style={{ gap: "18px", textAlign: "center" }}>
            <p className="eyebrow" style={{ alignSelf: "flex-start", margin: 0 }}>
              {t.register_title}
            </p>
            <div className={`notice notice-ok`} role="status" style={{ textAlign: "start" }}>
              {t.login_ok_created}
            </div>
            <p className="small muted" style={{ margin: 0, textAlign: "start" }}>
              {t.onboard_done_lede}
            </p>
            <Link href="/login" className="btn btn-quiet btn-block">
              {t.welcome_cta_login}
            </Link>
            <TopControls />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth">
      <aside className="auth-aside ruled">
        <BrandLock />
        <div className="stack" style={{ gap: "16px" }}>
          <h1 className="h2" style={{ maxWidth: "18ch" }}>
            {t.login_title_a} <span className="mark">{t.login_title_mark}</span>
          </h1>
          <p className="lede">{t.login_subtitle}</p>
        </div>
        <Link href="/" className="mono muted" style={{ textDecoration: "none" }}>
          ← {t.login_back}
        </Link>
      </aside>

      <div className="auth-main">
        <form className="auth-form stack" style={{ gap: "16px" }} onSubmit={handleSubmit}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <p className="eyebrow" style={{ margin: 0 }}>
              {t.register_title}
            </p>
            <TopControls />
          </div>

          {message && (
            <div className={`notice ${message.type === "error" ? "notice-error" : "notice-ok"}`} role={message.type === "error" ? "alert" : "status"}>
              {message.text}
            </div>
          )}

          <div>
            <label className="field-label" htmlFor="reg-name">
              {t.register_name_label}
            </label>
            <input
              id="reg-name"
              className="field"
              type="text"
              required
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t.register_name_placeholder}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="reg-email">
              {t.register_email_label}
            </label>
            <input
              id="reg-email"
              className="field"
              type="email"
              required
              autoComplete="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.login_email_placeholder}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="reg-password">
              {t.register_password_label}
            </label>
            <input
              id="reg-password"
              className="field"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t.login_password_placeholder}
              aria-describedby="pwStrength"
            />
            <div id="pwStrength" className="row" style={{ gap: "6px", marginTop: "8px" }} aria-live="polite">
              {[0, 1, 2].map((i) => (
                <i
                  key={i}
                  style={{
                    height: "4px",
                    flex: 1,
                    borderRadius: "2px",
                    background: i < pwScore ? "var(--marker-deep)" : "var(--rule)",
                  }}
                />
              ))}
              <span className="mono muted" style={{ whiteSpace: "nowrap" }}>
                {pwText}
              </span>
            </div>
          </div>

          <button type="submit" className="btn btn-marker btn-block" disabled={loading}>
            {loading ? t.login_loading : t.register_submit}
          </button>

          <ProviderRow />

          <p className="small muted" style={{ margin: 0 }}>
            {t.login_has_account}{" "}
            <Link
              href="/login"
              style={{
                color: "var(--ink)",
                fontWeight: 600,
                textDecoration: "underline",
                textDecorationThickness: "2px",
                textDecorationColor: "var(--marker-deep)",
                textUnderlineOffset: "3px",
              }}
            >
              {t.login_has_account_cta}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
