"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { TopControls } from "@/components/TopControls";
import { BrandLock } from "@/components/BrandLogo";
import {
  ROLE_HOMES,
  personaToRole,
  roleHome,
  safeNext,
} from "@/lib/auth-roles";

/**
 * 🧭 الأونبوردنج — بعد أول تسجيل دخول فقط.
 *   «خلينا نعرفك أكتر عشان نجهز ماجيكلي ليك 💙»
 *
 * سؤالين بس (مش أكتر، زي ما اتفقنا):
 *   ١. الدور: طالب / خريج / فريلانسر → profiles.persona
 *   ٢. المستوى الدراسي: للطالب فقط → profiles.student_level
 *      (الخريج/الفريلانسر بيتخطّوا الخطوة دي تلقائيًا)
 *
 * ⚠️ بنكتب في نفس أعمدة الـassessment الحالي (persona/student_level) —
 *    مفيش نظام تاني ولا تعارض: الصفحتين بيكتبوا نفس الحقول بنفس القيم.
 * علامة الإتمام: profiles.onboarded_at + نسخة استرشادية في user_metadata
 * عشان الـproxy يقدر يقرا من غير نداء داتابيز إضافي.
 */

type Role = "student" | "graduate" | "freelancer";
type Level = "prep" | "high" | "uni" | "masters";

function currentNext(): string {
  if (typeof window === "undefined") return "";
  return safeNext(new URLSearchParams(window.location.search).get("next"), "");
}

export default function OnboardingPage() {
  const router = useRouter();
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const { t, locale } = useLanguage();

  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [role, setRole] = useState<Role>("student");
  const [level, setLevel] = useState<Level | null>("high");
  /** الخريج/الفريلانسر بيكملوا على طول — السؤال التاني للطالب بس. */
  const [step, setStep] = useState<"role" | "level" | "done">("role");

  /* ---- حراسة الدخول: حقيقي + مش مكتمل؟ تمام. غير كده وجهته الصح. ---- */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!supabaseRef.current) supabaseRef.current = createClient();
      const supabase = supabaseRef.current;
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!cancelled && (!user || user.is_anonymous)) {
        router.replace("/welcome");
        return;
      }

      if (!cancelled && user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("persona, onboarded_at")
          .eq("id", user.id)
          .maybeSingle();

        // خلّص الأونبوردنج قبل كده؟ على طول لوجهته (احترام للتغييرات اليدوية).
        // بنشتق الدور من persona نفسها — مش محتاجين العمود المولَّد هنا.
        if (!cancelled && profile?.onboarded_at) {
          const doneRole = personaToRole(profile.persona);
          router.replace(doneRole ? roleHome(doneRole) : "/dashboard");
          return;
        }
        // عنده persona من اللاندينج/الـassessment القديم؟ نبدأ منه بدل ما نسأل تاني.
        if (!cancelled) {
          const existing = personaToRole(profile?.persona);
          if (existing) {
            setRole(existing);
            setStep(existing === "student" ? "role" : "role");
          }
        }
      }
      if (!cancelled) setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function persist(onboardedAtIso: string): Promise<{ ok: boolean }> {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    const supabase = supabaseRef.current;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false };

    const persona = ROLE_HOMES[role].persona; // graduate → grad (اسم الداتابيز)
    const fields = {
      persona,
      student_level: role === "student" ? level : null,
      onboarded_at: onboardedAtIso,
    };

    const { error: upErr } = await supabase
      .from("profiles")
      .upsert({ id: user.id, ...fields }, { onConflict: "id" });

    if (upErr) {
      console.error("onboarding upsert failed:", upErr.message);
      return { ok: false };
    }

    // نسخة استرشادية في الـmetadata عشان الـproxy — فشلها مش مؤثر (تحت).
    void supabase.auth
      .updateUser({ data: { role, onboarded_at: onboardedAtIso } })
      .then(({ error: metaErr }) => {
        if (metaErr) console.error("metadata sync failed (غير مؤثرة):", metaErr.message);
      });

    return { ok: true };
  }

  async function finish(): Promise<void> {
    setSaving(true);
    setError(null);
    const iso = new Date().toISOString();
    const { ok } = await persist(iso);
    if (!ok) {
      setError(locale === "ar" ? "حصلت مشكلة في الحفظ. جرّب تاني." : "Saving failed. Try again.");
      setSaving(false);
      return;
    }
    const next = currentNext();
    router.push(next || roleHome(role));
    router.refresh();
  }

  function skip(): void {
    // التخطي بيسجّل الدور الافتراضي (طالب) بدون مستوى — والأونبوردنج يعتبر تم.
    void finish();
  }

  if (checking) {
    return (
      <div className="auth">
        <div className="auth-main">
          <p className="mono muted">{t.login_loading}</p>
        </div>
      </div>
    );
  }

  /* ---- شاشة النجاح القصيرة قبل التحويل ---- */
  if (step === "done") {
    return (
      <div className="auth">
        <aside className="auth-aside ruled">
          <BrandLock />
        </aside>
        <div className="auth-main">
          <div className="auth-form stack" style={{ gap: "16px", textAlign: "center" }}>
            <h1 className="h3">{t.onboard_done_title}</h1>
            <p className="lede">{t.onboard_done_lede}</p>
            <p className="mono muted">→ {roleHome(role)}</p>
          </div>
        </div>
      </div>
    );
  }

  const stepNum = t.onboarding_step;

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
        <div className="auth-form stack" style={{ gap: "20px" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <p className="eyebrow" style={{ margin: 0 }}>
              {stepNum} ١ / ٢
            </p>
            <TopControls />
          </div>

          {error && (
            <div className="notice notice-error" role="alert">
              {error}
            </div>
          )}

          {step === "role" ? (
            <>
              <h2 className="h3" style={{ margin: 0 }}>
                {t.onboarding_title}
              </h2>
              <p className="small muted" style={{ margin: 0 }}>
                {t.onboarding_subtitle}
              </p>

              <div className="stack" style={{ gap: "10px" }} role="radiogroup" aria-label={t.onboarding_title}>
                {(
                  [
                    { id: "student", emoji: "🎓", label: t.onboarding_role_student, desc: t.onboarding_role_student_desc },
                    { id: "graduate", emoji: "💼", label: t.onboarding_role_graduate, desc: t.onboarding_role_graduate_desc },
                    { id: "freelancer", emoji: "🧑‍💻", label: t.onboarding_role_freelancer, desc: t.onboarding_role_freelancer_desc },
                  ] as const
                ).map((opt) => {
                  const selected = role === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setRole(opt.id)}
                      className="row"
                      style={{
                        gap: "12px",
                        padding: "14px 16px",
                        background: selected ? "color-mix(in srgb, var(--marker) 14%, transparent)" : "var(--paper)",
                        border: `1px solid ${selected ? "var(--ink)" : "var(--rule-strong)"}`,
                        borderRadius: "var(--r-sm)",
                        cursor: "pointer",
                        font: "inherit",
                        color: "inherit",
                        textAlign: "start",
                      }}
                    >
                      <span style={{ fontSize: "1.5rem", lineHeight: 1.2 }}>{opt.emoji}</span>
                      <span className="stack" style={{ gap: 0 }}>
                        <b style={{ fontFamily: "var(--font-display)" }}>{opt.label}</b>
                        <span className="small muted">{opt.desc}</span>
                      </span>
                      <span
                        aria-hidden="true"
                        style={{
                          marginInlineStart: "auto",
                          width: "22px",
                          height: "22px",
                          borderRadius: "50%",
                          display: "grid",
                          placeItems: "center",
                          border: "1px solid var(--rule-strong)",
                          background: selected ? "var(--ink)" : "transparent",
                          color: selected ? "var(--paper-2)" : "transparent",
                          flex: "none",
                        }}
                      >
                        ✓
                      </span>
                    </button>
                  );
                })}
              </div>

              <button type="button" className="btn btn-marker btn-block" onClick={() => setStep(role === "student" ? "level" : "done")}>
                {t.onboarding_next}
              </button>
              <button
                type="button"
                className="small muted"
                style={{ alignSelf: "center", background: "none", border: 0, padding: 0, font: "inherit", textDecoration: "underline", cursor: "pointer" }}
                onClick={skip}
                disabled={saving}
              >
                {t.onboarding_skip}
              </button>
            </>
          ) : (
            <>
              <h2 className="h3" style={{ margin: 0 }}>
                {t.onboard_level_title}
              </h2>
              <p className="small muted" style={{ margin: 0 }}>
                {t.onboard_level_subtitle}
              </p>

              <div className="row" style={{ gap: "10px", flexWrap: "wrap" }} role="radiogroup" aria-label={t.onboard_level_title}>
                {(
                  [
                    { id: "prep", label: locale === "ar" ? "إعدادي" : "Prep" },
                    { id: "high", label: locale === "ar" ? "ثانوي" : "High school" },
                    { id: "uni", label: locale === "ar" ? "جامعي" : "University" },
                    { id: "masters", label: locale === "ar" ? "دراسات عليا" : "Masters+" },
                  ] as const
                ).map((opt) => {
                  const selected = level === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setLevel(opt.id)}
                      style={{
                        padding: "9px 18px",
                        borderRadius: "999px",
                        border: `1px solid ${selected ? "var(--ink)" : "var(--rule-strong)"}`,
                        background: selected ? "var(--ink)" : "var(--paper)",
                        color: selected ? "var(--paper-2)" : "var(--ink)",
                        fontSize: "var(--t-sm)",
                        fontWeight: 600,
                        cursor: "pointer",
                        font: "inherit",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              <button type="button" className="btn btn-marker btn-block" onClick={finish} disabled={saving || !level}>
                {saving ? t.login_loading : t.welcome_cta_start}
              </button>
              <button
                type="button"
                className="small muted"
                style={{ alignSelf: "flex-start", background: "none", border: 0, padding: 0, font: "inherit", textDecoration: "underline", cursor: "pointer" }}
                onClick={() => setStep("role")}
              >
                ← {t.login_back_signin ?? t.onboarding_skip}
              </button>
            </>
          )}

          <p className="mono muted" style={{ margin: 0 }}>
            {t.onboarding_changeable_later}
          </p>
        </div>
      </div>
    </div>
  );
}
