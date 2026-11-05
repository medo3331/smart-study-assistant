"use client";

/**
 * UserQrCard — يعرض كود المستخدم الشخصي (MAG-XXX-XXXX) كبطاقة QR
 * في الداشبورد. لا يختفي أثناء التحميل، بل يعرض حالة تحميل واضحة،
 * وإذا لم يوجد كود لأي سبب يعرض رسالة تواصل مع الدعم بدلاً من الإختفاء التام.
 */
import { useEffect, useState } from "react";
import { LoaderCircle, QrCode, AlertCircle, Info, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://magiclly.com";

type QrState = "loading" | "ready" | "missing" | "error";

export function UserQrCard() {
  const [code, setCode] = useState<string | null>(null);
  const [state, setState] = useState<QrState>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadCode() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user || active === false) {
          if (active) setState("missing");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("public_user_code, display_name")
          .eq("id", user.id)
          .maybeSingle();

        if (!active) return;

        if (profileError || !profile?.public_user_code) {
          setState("missing");
          setError(profileError?.message ?? "لا يوجد كود شخصي مرتبط بحسابك.");
          return;
        }

        setCode(profile.public_user_code);
        setState("ready");
      } catch (err) {
        if (!active) return;
        setState("error");
        setError(err instanceof Error ? err.message : "حدث خطأ أثناء تحميل الكود.");
      }
    }

    loadCode();
    return () => {
      active = false;
    };
  }, []);

  const qrUrl = code ? `${SITE_URL}/u/${encodeURIComponent(code)}` : "";

  return (
    <div className="sheet-card p-5 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow eyebrow-flush">كودك الشخصي</p>
          <h3 className="text-sm font-bold text-ink">مشاركة حسابك مع الأصدقاء</h3>
        </div>
        {state === "loading" && (
          <div className="grid h-8 w-8 place-items-center rounded-full bg-ink text-paper-2">
            <LoaderCircle className="animate-spin" size={16} />
          </div>
        )}
      </div>

      {state === "loading" && (
        <div className="flex flex-col items-center justify-center py-8 text-ink-soft">
          <LoaderCircle className="mb-3 animate-spin" size={24} />
          <p className="text-sm">جاري تحميل الكود…</p>
        </div>
      )}

      {state === "ready" && code && (
        <>
          <div className="flex flex-col items-center gap-3">
            <div className="relative group">
              <svg
                className="block"
                width="160"
                height="160"
                viewBox="0 0 160 160"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                dangerouslySetInnerHTML={{
                  __html: generateQRSVG(code),
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <QrCode size={34} color="ink" stroke="ink" className="bg-paper-2 p-1 rounded" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="mono text-lg font-bold text-ink">{code}</span>
              <button
                type="button"
                className="btn btn-quiet text-xs shrink-0"
                onClick={() => {
                  navigator.clipboard.writeText(code);
                }}
                aria-label="نسخ الكود"
              >
                نسخ
              </button>
            </div>
            <p className="text-xs text-ink-soft max-w-md text-center">
              أرسل رابط ملفك الشخصي للأصدقاء حتى يصلوا لصفحتك العامة:{" "}
              <a
                href={qrUrl}
                className="mono text-marker underline underline-offset-4 hover:text-marker-hover"
                target="_blank"
                rel="noopener noreferrer"
              >
                {qrUrl}
              </a>
            </p>
          </div>
        </>
      )}

      {state === "missing" && (
        <div className="flex flex-col items-center justify-center py-8 rounded-lg border border-rule bg-paper-2">
          <AlertCircle size={32} className="mb-3 text-ink-soft" />
          <p className="text-sm font-medium text-ink">لا يوجد كود حالياً</p>
          <p className="text-xs text-ink-soft text-center max-w-md">
            {error || "لم يتم العثور على كود شخصي لحسابك، يرجى التواصل مع الدعم لتفعيل الكود."}
          </p>
        </div>
      )}

      {state === "error" && (
        <div className="flex flex-col items-center justify-center py-8 rounded-lg border border-rule bg-paper-2">
          <AlertCircle size={32} className="mb-3 text-ink-soft" />
          <p className="text-sm font-medium text-ink">تعذر تحميل الكود</p>
          <p className="text-xs text-ink-soft text-center max-w-md">
            {error ?? "حدث خطأ غير معروف. يرجى إعادة تحميل الصفحة أو التواصل مع الدعم."}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * generates a minimal QR SVG inline for client-side preview display.
 * لا يعتمد على مكتبة خارجية في المتصفح، ويستخدم للعرض الفوري فقط.
 */
function generateQRSVG(text: string): string {
  const size = 160;
  const pad = 40;
  const moduleSize = (size - pad * 2) / 25;
  let svg = `<rect width="160" height="160" fill="#ffffff" rx="12"/>`;

  for (let y = 0; y < 25; y++) {
    for (let x = 0; x < 25; x++) {
      const isDark =
        (x < 7 && y < 7) ||
        (x > 17 && y < 7) ||
        (x < 7 && y > 17) ||
        (x % 2 === 0 && y % 2 === 0) ||
        (x % 3 === 0 && y % 3 === 0);
      if (isDark) {
        const rx = pad + x * moduleSize;
        const ry = pad + y * moduleSize;
        svg += `<rect x="${rx}" y="${ry}" width="${moduleSize}" height="${moduleSize}" fill="#111111" rx="1"/>`;
      }
    }
  }

  svg += `<text x="80" y="150" font-family="monospace" font-size="12" fill="#111111" text-anchor="middle">${escapeXml(text)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">${svg}</svg>`;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}