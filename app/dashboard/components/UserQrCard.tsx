"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "react-qr-code";
import Link from "next/link";
import { SITE_URL } from "@/lib/seo";
import { createClient } from "@/lib/supabase/client";
import { Copy, Download, Link as LinkIcon, QrCode as QrCodeIcon } from "lucide-react";

export default function UserQrCard() {
  const [code, setCode] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const qrRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!mounted || !user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("public_user_code, display_name")
        .eq("id", user.id)
        .maybeSingle();
      if (mounted) {
        setCode((data?.public_user_code as string | null) ?? null);
        setName(data?.display_name ?? null);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const profileUrl = code ? `${SITE_URL}/u/${code}` : null;

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // 조용히 يُتجاهل لو المتصفح لا يدعم Clipboard API
    }
  };

  const downloadSvg = () => {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg || !code) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${code}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 text-center">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-700 text-slate-400 mx-auto mb-3">
          <QrCodeIcon size={18} />
        </div>
        <p className="text-xs text-slate-400">جارٍ جلب كودك…</p>
      </div>
    );
  }

  if (!code) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 text-center">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-700 text-slate-400 mx-auto mb-3">
          <QrCodeIcon size={18} />
        </div>
        <h3 className="text-sm font-bold text-amber-300 mb-1">كود المستخدم</h3>
        <p className="text-xs text-slate-400 mb-4">
          لا يوجد كود عام بعد. يتم توليد الكود تلقائياً عند إنشاء الحساب وسيظهر هنا فور توفره.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-2">
        <QrCodeIcon size={16} className="text-amber-400" />
        <h3 className="text-sm font-bold text-amber-300">{name ? `كودك الشخصي، ${name}` : "كودك الشخصي + QR"}</h3>
      </div>
      <p className="text-[10px] text-slate-500 mb-4">
        رابط عام لملفك الشخصي — يُستخدم لمشاركة الكود أو تفعيل الاشتراك عبر فريق الدعم.
      </p>

      <div ref={qrRef} className="flex flex-col items-center gap-3 py-3">
        <QRCode value={profileUrl!} size={150} fgColor="#fbbf24" bgColor="#090d16" />
        <code className="font-mono text-amber-400 text-lg font-bold" dir="ltr">
          {code}
        </code>
        <p className="text-[10px] text-slate-400 font-mono" dir="ltr">
          {profileUrl}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        <Link
          href={profileUrl!}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-slate-300 underline underline-offset-4 hover:text-amber-300 transition"
        >
          <LinkIcon size={14} /> فتح الرابط العام
        </Link>
        <button
          onClick={copyCode}
          className="inline-flex items-center gap-1.5 text-xs text-slate-300 underline underline-offset-4 hover:text-amber-300 transition"
        >
          <Copy size={14} /> نسخ الكود
        </button>
        <button
          onClick={downloadSvg}
          className="inline-flex items-center gap-1.5 text-xs text-amber-300 underline underline-offset-4 hover:text-amber-400 transition"
        >
          <Download size={14} /> تحميل QR (SVG)
        </button>
      </div>
    </div>
  );
}