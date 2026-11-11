"use client";

import { usePathname } from "next/navigation";
import { SiteNavbar } from "@/components/SiteNavbar";

/* ==========================================================================
   بوابة الشريط العلوي

   📌 الشريط نفسه في `SiteNavbar` — الملف ده بيحدد **امتى** يظهر بس.

   ⚠️ صفحات الداشبورد (`/dashboard/*`) ليها ترويستتها الخاصة في
      `app/dashboard/layout.tsx`. قبل كده كان في شريطين فوق بعض: ده
      والـ navbar العام. دلوقتي الـ navbar بيقفلي نفسه على الداشبورد
      بدل ما ندمج الترويستين — فالترويستة تفضل زي ما هي، ومفيش حاجة
      فيها اتغيرت.

   ⚠️ الصفحات اللي ليها **chrome تانيها** (ترويستة خاصة، هيدر تسويقي،
      ترويسة قانونية…) — الـ navbar يقفلي نفسه عندها. غير كده هنتج
      شريطين فوق بعض، والترويسة القديمة قاعد�� فوق الترويسة الجديدة
      أو تحتها — وفي الحالتين الشكل وحش.
   ========================================================================== */

/**
 * prefixes للصفحات اللي ليها chrome خاص بيها.
 *
 * ⚠️ `/` (الصفحة الرئيسية) مش جواها — ليها هيدر تسويقي في `Hero`،
 *    فمحتاجة مقارنة **تطابق** مش `startsWith`.
 */
const OWN_CHROME_PREFIXES = [
  // لوحة الأدمن — ليها `AdminNav` جانبي
  "/admin",
  // صفحات الحساب — ليها `BrandLock` بتاعتهم
  "/login",
  "/register",
  "/welcome",
  "/onboarding",
  // صفحات تسويقية ليها ترويستتها (أذرع اللاندينج)
  "/features",
  "/faq",
  "/lecture-transcription",
  "/ai-study-assistant",
  "/programming",
  "/study-tools",
  "/subjects",
  "/demo",
  "/university",
  // قانوني — `LegalDoc` **متلعمش** nav بالتصميم (صفحة بتتقرا مرة)
  "/privacy",
  "/terms",
  // تدفقات مستقلة بره الـ app (صفحة دفع، صفحة QR، ملف شخصي)
  "/checkout",
  "/u/",
  // صفحة مراجعة التصميم — داخلية ومش للزوار
  "/preview",
];

/** الصفحة الرئيسية — هيدر تسويقي في `Hero`. */
const LANDING_PATH = "/";

function hasOwnChrome(pathname: string): boolean {
  if (pathname === LANDING_PATH) return true;
  return OWN_CHROME_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function UnifiedNavbar() {
  const pathname = usePathname() || "/";

  // الداشبورد عندها ترويستتها — ماكرمناش شريطين فوق بعض.
  if (pathname.startsWith("/dashboard")) return null;

  // الصفحات اللي ليها ترويستتها الخاصة.
  if (hasOwnChrome(pathname)) return null;

  return <SiteNavbar />;
}
