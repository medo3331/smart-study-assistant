"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { TopControls } from "@/components/TopControls";
import { BrandLock } from "@/components/BrandLogo";

/**
 * 🚪 شاشة الترحيب — أول محطة في التدفّق الجديد:
 *   Welcome → Create Account → Choose Login Method.
 *
 * قواعد الظهور:
 * - المستخدم الحقيقي المسجّل ما يشوفهاش (الـproxy + الفحص هنا بيرجعوه
 *   لداشبورد دوره). الزائر بيشوفها عشان يقدر يرقّي حسابه أو يكمّل زائر.
 * - «ابدأ رحلتك» بيحفظ علامة إن الشاشة اتشافت (localStorage) عشان أي
 *   لينك خارجي مباشر لـ/ بعد كده ما يرجّعهاش من غير داعي.
 */

const WELCOME_SEEN_KEY = "magicly.welcomeSeen";

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/dashboard";
  return raw;
}

/** قراءة next وقت الضغط مش وقت الرسم — نفس سبب resolveNext في اللوجين (static build). */
function currentNext(): string {
  if (typeof window === "undefined") return "/dashboard";
  return safeNext(new URLSearchParams(window.location.search).get("next"));
}

function markWelcomeSeen(): void {
  try {
    window.localStorage.setItem(WELCOME_SEEN_KEY, "1");
  } catch {
    // التصفح الخفي إيه حلو — الاختيار بيتاخد تاني وخلاص
  }
}

export default function WelcomePage() {
  const router = useRouter();
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const { t } = useLanguage();
  const [guestLoading, setGuestLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  /* مستخدم حقيقي داخل بالفعل؟ ملوش شغل هنا — داشبورد دوره على طول.
     (الـproxy بيعمل ده على مستوى الخادم؛ ده طبقة التأكيد للكلاينت.) */
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

  async function handleGuest(): Promise<void> {
    setGuestLoading(true);
    setMessage(null);
    if (!supabaseRef.current) supabaseRef.current = createClient();
    const { error } = await supabaseRef.current.auth.signInAnonymously();
    if (error) {
      setMessage({ type: "error", text: t.login_err_guest });
      setGuestLoading(false);
      return;
    }
    markWelcomeSeen();
    router.push(currentNext());
    router.refresh();
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
        <div className="auth-form stack" style={{ gap: "22px" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <p className="eyebrow" style={{ margin: 0 }}>
              {t.welcome_title_a} <span className="mark">{t.welcome_title_mark}</span>
            </p>
            <TopControls />
          </div>

          <p className="lede" style={{ margin: 0 }}>
            {t.welcome_lede}
          </p>

          {message && (
            <div className={`notice ${message.type === "error" ? "notice-error" : "notice-ok"}`} role={message.type === "error" ? "alert" : "status"}>
              {message.text}
            </div>
          )}

          <div className="stack" style={{ gap: "12px" }}>
            <button
              type="button"
              className="btn btn-marker btn-block"
              onClick={() => {
                markWelcomeSeen();
                const next = currentNext();
                // مفيش next محدد؟ المعنى إن الدخول ده من بره أي تدفق —
                // الوجهة الطبيعية بعد التسجيل هي الأونبوردنج نفسه.
                router.push(`/register?next=${encodeURIComponent(next === "/dashboard" ? "/onboarding" : next)}`);
              }}
            >
              {t.welcome_cta_start}
            </button>

            <Link href="/login" className="btn btn-quiet btn-block" onClick={markWelcomeSeen}>
              {t.welcome_cta_login}
            </Link>

            <button
              type="button"
              className="small muted"
              style={{
                alignSelf: "center",
                background: "none",
                border: 0,
                padding: "6px 0",
                font: "inherit",
                textDecoration: "underline",
                textUnderlineOffset: "3px",
                cursor: "pointer",
              }}
              onClick={handleGuest}
              disabled={guestLoading}
            >
              {guestLoading ? t.login_guest_loading : t.welcome_cta_guest}
            </button>
          </div>

          <p className="mono muted" style={{ margin: 0, textAlign: "center" }}>
            {t.welcome_terms}
          </p>
        </div>
      </div>
    </div>
  );
}
