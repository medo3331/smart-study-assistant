"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TopControls } from "@/components/TopControls";
import { BrandLock } from "@/components/BrandLogo";
import { openSupport } from "@/components/SupportWidget";

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/dashboard";
  return raw;
}

function resolveNext(): string {
  if (typeof window === "undefined") return "/dashboard";
  return safeNext(new URLSearchParams(window.location.search).get("next"));
}

function normalizeMagId(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export default function MagLoginPage() {
  const router = useRouter();
  const [magId, setMagId] = useState("");
  const [token, setToken] = useState("");
  const [step, setStep] = useState<"request" | "verify">("request");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/mag/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ magId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", text: data?.error === "RATE_LIMITED" ? "تم تجاوز الحد، حاول لاحقًا" : "تعذّر إرسال الكود" });
        return;
      }
      setStep("verify");
      setMessage({ type: "success", text: "إذا كان الحساب موجودًا، تم إرسال كود OTP إلى البريد المرتبط به." });
    } catch {
      setMessage({ type: "error", text: "تعذّر إرسال الكود" });
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/mag/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ magId, token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setMessage({ type: "error", text: "كود غير صحيح أو منتهي" });
        return;
      }
      router.push(resolveNext());
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "كود غير صحيح أو منتهي" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth">
      <aside className="auth-aside ruled">
        <BrandLock />
        <div className="stack" style={{ gap: "16px" }}>
          <h1 className="h2" style={{ maxWidth: "18ch" }}>الدخول باستخدام MAG ID</h1>
          <p className="lede">أدخل MAG ID الخاص بك، ثم أدخل كود OTP المرسل إلى البريد المرتبط بالحساب.</p>
        </div>
        <Link href="/login" className="mono muted" style={{ textDecoration: "none" }}>
          ← العودة لتسجيل الدخول
        </Link>
      </aside>

      <div className="auth-main">
        <div className="auth-form stack" style={{ gap: "22px" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <p className="eyebrow" style={{ margin: 0 }}>MAG ID</p>
            <TopControls />
          </div>

          {message && (
            <div className={`notice ${message.type === "error" ? "notice-error" : "notice-ok"}`} role={message.type === "error" ? "alert" : "status"}>
              {message.text}
            </div>
          )}

          {step === "request" ? (
            <form className="stack" style={{ gap: "14px" }} onSubmit={handleRequest}>
              <div>
                <label className="field-label" htmlFor="mag-id">MAG ID</label>
                <input
                  id="mag-id"
                  className="field"
                  type="text"
                  required
                  dir="ltr"
                  value={magId}
                  onChange={(e) => setMagId(normalizeMagId(e.target.value))}
                  placeholder="MAG-XXX-XXXX"
                />
              </div>
<button type="submit" className="btn btn-marker btn-block" disabled={loading}>
                {loading ? "جارٍ الإرسال..." : "إرسال كود OTP"}
              </button>
              <p className="muted small" style={{ marginTop: "8px", lineHeight: 1.6 }}>
                إذا كان البريد الإلكتروني المرتبط بحسابك غير متاح، لا يمكن إرسال OTP إليه. تواصل مع الدعم الفني للتحقق من هويتك.
              </p>
              <button
                type="button"
                className="btn btn-quiet btn-block"
                onClick={() => openSupport()}
                style={{ marginTop: "6px" }}
              >
                طلب استرداد عبر الدعم
              </button>
            </form>
          ) : (
            <form className="stack" style={{ gap: "14px" }} onSubmit={handleVerify}>
              <div>
                <label className="field-label" htmlFor="mag-code">كود OTP</label>
                <input
                  id="mag-code"
                  className="field"
                  type="text"
                  inputMode="numeric"
                  required
                  dir="ltr"
                  value={token}
                  onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                />
              </div>
              <button type="submit" className="btn btn-marker btn-block" disabled={loading}>
                {loading ? "جارٍ التحقق..." : "تحقق ودخول"}
              </button>
              <button
                type="button"
                className="btn btn-quiet btn-block"
                onClick={() => { setStep("request"); setToken(""); setMessage(null); }}
              >
                إعادة إرسال / تغيير MAG ID
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}