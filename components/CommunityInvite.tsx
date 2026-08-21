"use client";

import React, { useEffect, useState } from "react";
import { SITE_LINKS } from "@/lib/site-links";

/* ==========================================================================
   دعوة الجروب — «أول ١٠٠ مستخدم»

   بانر بيودّي على سيرفر الديسكورد (أو أي جروب — واتساب/تليجرام، اللينك
   بس هو اللي بيتغيّر).

   ⚠️ القاعدة الأهم في الملف ده: **لو مفيش لينك، البانر مايظهرش خالص.**
   مش بيظهر بزرار ميت ولا «قريباً». بانر دعوة بيودّي على ٤٠٤ أسوأ من
   مفيش بانر — بيبلّغ المستخدم إن الموقع مسيّب.

   عشان كده اللينك جاي من NEXT_PUBLIC_DISCORD_INVITE، والكومبوننت بيرجّع
   null لو فاضي. تحطّ اللينك → البانر يظهر لوحده في كل مكان.
   ========================================================================== */

const DISMISSED_KEY = "community_invite_dismissed_v1";

/**
 * اللينك بييجي من `lib/site-links` — نفس المصدر اللي الفوتر بيقرا منه،
 * عشان لينك الديسكورد يتكتب في مكان واحد بس.
 *
 * ⚠️ كان بيتقرا من `process.env.NEXT_PUBLIC_DISCORD_INVITE` مباشرة.
 * اتغيّر لما اللينك اتكتب في site-links: من غير التغيير ده البانر كان
 * هيفضل مخفي (لأن المتغيّر فاضي) في نفس الوقت اللي أيقونة الديسكورد
 * ظاهرة في الفوتر — نفس اللينك، سلوكين مختلفين.
 *
 * لسه ينفع تعمل override بالمتغيّر: site-links بيقراه الأول. بس ساعتها
 * لازم redeploy لأن NEXT_PUBLIC_* بتتحقن في الباندل وقت البيلد.
 */
const INVITE_URL = SITE_LINKS.discord;

/** عدد المقاعد. رقم دعائي مقصود — ٪١٠٠ منه إن الناس تحس إنها بدري. */
const SEATS = 100;

interface CommunityInviteProps {
  /**
   * "banner" = شريط عريض جوه الصفحة (الداشبورد، المجتمع).
   * "inline" = كارت هادي وسط المحتوى.
   */
  variant?: "banner" | "inline";
  /** قابل للإخفاء؟ البانر أيوة، الكارت الجوّاني لأ. */
  dismissible?: boolean;
}

export function CommunityInvite({
  variant = "banner",
  dismissible = true,
}: CommunityInviteProps) {
  // بيبدأ مخفي وبيظهر بعد ما نتأكد من الستوريج — عشان مايلمعش وبعدين
  // يختفي لو المستخدم أخفاه قبل كده
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!INVITE_URL) return;
    if (!dismissible) {
      setVisible(true);
      return;
    }
    try {
      if (window.localStorage.getItem(DISMISSED_KEY) !== "1") setVisible(true);
    } catch {
      setVisible(true);
    }
  }, [dismissible]);

  // مفيش لينك = مفيش بانر. شوف التحذير فوق.
  if (!INVITE_URL || !visible) return null;

  function handleDismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // مقفول — هيرجع يظهر الزيارة الجاية. مقبول.
    }
  }

  const seatsLabel = SEATS.toLocaleString("ar-EG");

  return (
    <div
      className={
        variant === "banner"
          ? "sheet-card p-4 flex items-start gap-3 flex-wrap sm:flex-nowrap"
          : "sheet-card p-5 space-y-3"
      }
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p className="eyebrow eyebrow-flush">أول {seatsLabel} مستخدم</p>
        <p className="text-sm font-bold text-ink leading-relaxed">
          تعالى الجروب — إحنا بنبني ده معاكم
        </p>
        <p className="text-xs text-ink-soft leading-relaxed">
          كل أسبوع فيه تحديث جديد، وكل يوم بنسأل إيه الناقص. لو دخلت
          دلوقتي رأيك بيدخل في اللي جاي.
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* rel="noreferrer" مش بس noopener: مانبعتش الرابط اللي جاي منه
            لسيرفر تاني. target=_blank عشان مايضيّعش شغله في الموقع. */}
        <a
          href={INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-marker text-sm py-2.5"
        >
          دخول الجروب
        </a>
        {dismissible && (
          <button
            onClick={handleDismiss}
            aria-label="إخفاء دعوة الجروب"
            className="mono text-ink-soft hover:text-ink px-1.5 py-1"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
