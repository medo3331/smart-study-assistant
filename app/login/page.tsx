"use client";

import React, { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { TopControls } from "@/components/TopControls";
import { BrandLock } from "@/components/BrandLogo";

type PasswordFlow = "signin" | "signup" | "forgot" | "reset";

/**
 * الوجهة بعد الدخول. بتيجي من `?next=` عشان مختار الشخصية في اللاندينج
 * يقدر يبعت المستخدم لـ /assessment بدل الداشبورد.
 *
 * ⚠️ الفلترة مش تفصيلة: `next` جاي من الـ URL، فلو مشيناه زي ما هو حد يقدر
 * يبعت لينك فيه `next=https://...` ويستخدم صفحة الدخول بتاعتنا كمنصة تحويل
 * (open redirect). فمسموح المسارات الداخلية بس — و`//host` مرفوض كذلك
 * لأن المتصفح بيقراه دومين خارجي.
 */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/dashboard";
  return raw;
}

/**
 * الوجهة بتتقرا وقت الضغط، مش وقت الرسم — **عن قصد**.
 *
 * `useSearchParams()` بيخلي الصفحة مش قابلة للتوليد static، فكان بيفشّل
 * الـ build («should be wrapped in a suspense boundary»)، و`<Suspense>`
 * كحل ما نفعش. و`next` أصلاً محتاجينه في لحظة التوجيه بس — مش ظاهر في أي
 * نص على الشاشة. فقراءته من `window.location` جوه الـ handler بتشيل
 * المشكلة من أصلها بدل ما تلفّها.
 *
 * ⚠️ الفلترة بـ `safeNext` لازم تفضل هنا — دي اللي بتمنع الـ open redirect.
 */
function resolveNext(): string {
  if (typeof window === "undefined") return "/dashboard";
  return safeNext(new URLSearchParams(window.location.search).get("next"));
}

/** رابط واحد لكل رسائل Supabase (تأكيد التسجيل واسترجاع كلمة السر).
 * لازم يطابق Redirect URLs في Supabase؛ متغير الإنتاج يمنع رابط localhost
 * من التسرب إلى الرسائل عند بناء الموقع على Vercel. */
function authCallbackUrl(next: string): string {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const appUrl = configuredSiteUrl || window.location.origin;
  return `${appUrl}/auth/callback?next=${encodeURIComponent(next)}`;
}

function LoginForm() {
  const router = useRouter();
  const supabase = createClient();
  const { t } = useLanguage();

  const [flow, setFlow] = useState<PasswordFlow>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  // بيظهر بعد ترقية حساب الزائر: جلسته لسه شغّالة فينفع يكمّل من غير دخول تاني
  const [canContinue, setCanContinue] = useState(false);
  const [ignoreResetLink, setIgnoreResetLink] = useState(false);
  const arrivedFromResetLink = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("reset") === "1",
    () => false,
  );
  const activeFlow = arrivedFromResetLink && !ignoreResetLink ? "reset" : flow;

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    if (activeFlow === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: authCallbackUrl("/login?reset=1"),
      });
      if (error) console.error("Password reset email error:", error.message);
      setMessage({ type: error ? "error" : "success", text: error ? t.login_err_reset : t.login_ok_reset_sent });
    } else if (activeFlow === "reset") {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMessage({ type: "error", text: t.login_err_reset });
      } else {
        setMessage({ type: "success", text: t.login_ok_reset });
        setPassword("");
        setIgnoreResetLink(true);
        setFlow("signin");
      }
    } else if (activeFlow === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage({ type: "error", text: t.login_err_credentials });
      } else {
        router.push(resolveNext());
        router.refresh();
      }
    } else {
      // نتأكد الأول: هل ده guest عايز "يرقّي" حسابه لحساب حقيقي؟
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (currentUser?.is_anonymous) {
        const { error } = await supabase.auth.updateUser({
          email,
          password,
          data: { full_name: fullName },
        }, { emailRedirectTo: authCallbackUrl(resolveNext()) });
        if (error) {
          setMessage({
            type: "error",
            text: error.message.includes("already") ? t.login_err_exists : t.login_err_signup,
          });
        } else {
          // الزائر بقى حساب حقيقي وجلسته لسه شغّالة، فينفع يكمّل على طول.
          // بس لازم يعرف إنه محتاج يأكّد الإيميل، فالرسالة تفضل ومعاها زرار
          // إكمال — أحسن من مؤقّت بيوديه قبل ما يقرا.
          setMessage({ type: "success", text: t.login_ok_linked });
          setCanContinue(true);
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: authCallbackUrl(resolveNext()),
          },
        });
        if (error) {
          setMessage({
            type: "error",
            text: error.message.includes("already") ? t.login_err_exists : t.login_err_signup,
          });
        } else if (data.session) {
          // تأكيد الإيميل مقفول في الإعدادات، فالجلسة جاهزة والاختيار المعلّق
          // مستنيه في الـ assessment
          router.push(resolveNext());
          router.refresh();
        } else {
          // محتاج يأكّد الإيميل الأول — مفيش جلسة، فمفيش وجهة نوديه لها
          setMessage({ type: "success", text: t.login_ok_created });
        }
      }
    }
    setLoading(false);
  };

  const handleGuestLogin = async () => {
    setGuestLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInAnonymously();

    if (error) {
      setMessage({ type: "error", text: t.login_err_guest });
      setGuestLoading(false);
      return;
    }

    router.push(resolveNext());
    router.refresh();
    setGuestLoading(false);
  };

  const isSignup = activeFlow === "signup";
  const isForgot = activeFlow === "forgot";
  const isReset = activeFlow === "reset";
  const showPassword = !isForgot;

  return (
    <div className="auth-main">
      <div className="auth-form stack" style={{ gap: "22px" }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <p className="eyebrow" style={{ margin: 0 }}>
            {isForgot ? t.login_forgot_title : isReset ? t.login_reset_title : isSignup ? t.login_submit_signup : t.login_submit_signin}
          </p>
          <TopControls />
        </div>

        {message && (
          <div
            className={`notice ${message.type === "error" ? "notice-error" : "notice-ok"}`}
            role={message.type === "error" ? "alert" : "status"}
          >
            {message.text}
            {canContinue && (
              <button
                type="button"
                onClick={() => { router.push(resolveNext()); router.refresh(); }}
                style={{
                  display: "block",
                  marginTop: "10px",
                  background: "none",
                  border: 0,
                  padding: 0,
                  font: "inherit",
                  fontWeight: 600,
                  textDecoration: "underline",
                  cursor: "pointer",
                }}
              >
                {t.picker_cta} →
              </button>
            )}
          </div>
        )}

        <form onSubmit={handlePasswordSubmit} className="stack" style={{ gap: "16px" }}>
          {isSignup && (
            <div>
              <label className="field-label" htmlFor="fullName">
                {t.login_name_label}
              </label>
              <input
                id="fullName"
                className="field"
                type="text"
                required
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t.login_name_placeholder}
              />
            </div>
          )}

          {!isReset && <div>
            <label className="field-label" htmlFor="email">
              {t.login_email_label}
            </label>
            <input
              id="email"
              className="field"
              type="email"
              required
              autoComplete="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.login_email_placeholder}
            />
          </div>}

          {showPassword && <div>
            <label className="field-label" htmlFor="password">
              {t.login_password_label}
            </label>
            <input
              id="password"
              className="field"
              type="password"
              required
              minLength={6}
              autoComplete={isSignup || isReset ? "new-password" : "current-password"}
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t.login_password_placeholder}
              aria-describedby={isSignup ? "passwordHint" : undefined}
            />
            {isSignup && (
              <p id="passwordHint" className="muted mono" style={{ margin: "6px 0 0" }}>
                {t.login_password_hint}
              </p>
            )}
            {!isSignup && !isReset && (
              <button
                type="button"
                onClick={() => { setFlow("forgot"); setMessage(null); }}
                className="small muted"
                style={{ background: "none", border: 0, padding: "8px 0 0", font: "inherit", textDecoration: "underline", cursor: "pointer" }}
              >
                {t.login_forgot_cta}
              </button>
            )}
          </div>}

          <button type="submit" className="btn btn-marker btn-block" disabled={loading}>
            {loading ? t.login_loading : isForgot ? t.login_forgot_submit : isReset ? t.login_reset_submit : isSignup ? t.login_submit_signup : t.login_submit_signin}
          </button>
        </form>

        {!isForgot && !isReset && <p className="small muted" style={{ margin: 0 }}>
          {isSignup ? t.login_has_account : t.login_no_account}{" "}
          <button
            type="button"
            onClick={() => {
              setFlow(isSignup ? "signin" : "signup");
              setMessage(null);
            }}
            style={{
              background: "none",
              border: 0,
              padding: 0,
              font: "inherit",
              color: "var(--ink)",
              fontWeight: 600,
              textDecoration: "underline",
              textDecorationThickness: "2px",
              textDecorationColor: "var(--marker-deep)",
              textUnderlineOffset: "3px",
              cursor: "pointer",
            }}
          >
            {isSignup ? t.login_has_account_cta : t.login_no_account_cta}
          </button>
        </p>}

        {(isForgot || isReset) && (
          <button
            type="button"
            onClick={() => { setIgnoreResetLink(true); setFlow("signin"); setMessage(null); }}
            className="small muted"
            style={{ alignSelf: "flex-start", background: "none", border: 0, padding: 0, font: "inherit", textDecoration: "underline", cursor: "pointer" }}
          >
            ← {t.login_back_signin}
          </button>
        )}

        {!isForgot && !isReset && <div className="divider small">{t.login_or}</div>}

        {!isForgot && !isReset && <div className="stack" style={{ gap: "8px" }}>
          <button
            type="button"
            onClick={handleGuestLogin}
            className="btn btn-quiet btn-block"
            disabled={guestLoading}
          >
            {guestLoading ? t.login_guest_loading : t.login_guest}
          </button>
          <p className="muted small" style={{ margin: 0 }}>
            {t.login_guest_hint}
          </p>
        </div>}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { t } = useLanguage();

  return (
    <div className="auth">
      {/* الجانب: صفحة من الملزمة، بيوصّل نفس هوية الرئيسية. */}
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

      <LoginForm />
    </div>
  );
}
