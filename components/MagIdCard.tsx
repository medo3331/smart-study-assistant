"use client";
import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
export default function MagIdCard() {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;
        if (!user) { if (!cancelled) { setError("يجب تسجيل الدخول لعرض MAG ID."); setLoading(false); } return; }
        const { data, error: qErr } = await supabase.from("profiles").select("public_user_code").eq("id", user.id).maybeSingle();
        if (cancelled) return;
        if (qErr) setError("تعذّر تحميل MAG ID.");
        else setCode((data as any)?.public_user_code ?? null);
      } catch { if (!cancelled) setError("تعذّر تحميل MAG ID."); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);
  async function handleCopy() { if (!code) return; try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setCopied(false); } }
  return (
    <section className="card" style={{ padding: "16px", marginTop: "12px" }} aria-label="معرّف حسابك — MAG ID">
      <p className="eyebrow" style={{ margin: 0 }}>معرّف حسابك — MAG ID</p>
      <p className="muted small" style={{ margin: "4px 0 0" }}>مرتبط بحسابك</p>
      {loading ? <p className="muted small" style={{ marginTop: "12px" }}>جارٍ التحميل...</p> :
      error ? <p className="muted small" style={{ marginTop: "12px", color: "#b91c1c" }}>{error}</p> :
      !code ? <p className="muted small" style={{ marginTop: "12px" }}>لا يوجد MAG ID مرتبط بحسابك حاليًا.</p> : (
        <>
          <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <code dir="ltr" style={{ fontFamily: "monospace", fontSize: "1.05rem", letterSpacing: "0.08em", padding: "6px 10px", borderRadius: "8px", background: "rgba(0,0,0,0.06)" }}>{code}</code>
            <button type="button" className="btn btn-quiet" onClick={handleCopy} style={{ padding: "6px 12px", fontSize: "0.85rem" }}>{copied ? "تم النسخ" : "نسخ"}</button>
          </div>
          <p className="muted small" style={{ marginTop: "10px", lineHeight: 1.6 }}>كودك الشخصي على Magicly. احتفظ به. تقدر تستخدمه للتعرّف على حسابك، ومتابعة اشتراكاتك، والتواصل مع الدعم الفني.</p>
          <p className="muted small" style={{ marginTop: "6px", lineHeight: 1.6, fontWeight: 600 }}>الكود معرّف لحسابك، وليس كلمة مرور. لا تشاركه باعتباره وسيلة لإثبات ملكية الحساب.</p>
        </>
      )}
    </section>
  );
}
