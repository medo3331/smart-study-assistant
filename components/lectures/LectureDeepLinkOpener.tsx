"use client";

import { useEffect } from "react";

/* ==========================================================================
   🔗 فاتح الرابط العميق — Phase 23
   ==========================================================================
   المساعد بيبعت الطالب على `/lectures#lec-<id>`. الكارت `<details>` مقفول
   افتراضيًا — فالمكوّن ده بيفتح تفاصيل الكارت المقصود أول ما الصفحة تجهز.
   ========================================================================== */

const OPEN_DELAY_MS = 300;

export function LectureDeepLinkOpener() {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#lec-")) return;

    const timer = window.setTimeout(() => {
      const target = document.getElementById(hash.slice(1));
      if (!target) return;
      const details = target.querySelector("details");
      if (details && !details.open) details.open = true;
      target.scrollIntoView({ block: "start", behavior: "smooth" });
    }, OPEN_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
