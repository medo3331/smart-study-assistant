import { createClient } from "@supabase/supabase-js";

/**
 * ═══ Admin / service client — server-only, bypasses RLS ═══
 * Never import in Client Components.
 *
 * ── المفتاح: `sb_secret_…` (الجديد) أو `service_role` JWT (القديم) ──
 *
 * ⚠️ **ليه `trim()` جزء أساسي من الكود ده مش تفصيل:**
 * لو المفتاح في Vercel اتلزق عليه سطر جديد أو مسافة (بيحصل كتير عند
 * النسخ/اللصق)، الـ SDK بيشوفه كـ `sb_` subtype مجهول فيطبع
 * "Unrecognized Supabase API key format" وبيبعته كـ Bearer
 * فيرجع `Invalid Compact JWS`. المنع بالـ trim هنا، مش بالترقية.
 *
 * ملاحظة عن `@supabase/supabase-js`: النسخة المثبّتة (2.117.2) — وهي
 * أحدث نسخة منشورة — **بتدعم** صيغة `sb_secret_` أصلاً (`isNewApiKey`
 * في `lib/fetch.ts`)، فالترقية مش الحل. المشكلة كانت في قيمة المفتاح
 * نفسها مش في المكتبة.
 *
 * ⚠️ المفتاح **مش** بيتطبع في أي لوج ولا بيرجع في أي رد — بنطبع
 * رسالة تشخيص من غير القيمة بس.
 */

/** أسماء المتغيّرات المدعومة، بالترتيب: الجديد الأول. */
const SECRET_KEY_VARS = ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;

/* ═══════════════════════════════════════════════════════════════════════
   🩺 تشخيص مؤقت (TEMPORARY DIAGNOSTIC) — شيله بعد ما نضبط المفتاح
   ═══════════════════════════════════════════════════════════════════════

   ⚠️ **GUARANTEE: مفيش أي جزء من المفتاح بيتطبع هنا.** كل سطر بيمرّ على
   قيَم منطقية (true/false) أو **طول** الرقم. القيم نفسها — ولا حتى أول
   أو آخر 4 محارف — **مش** بتوصل للوج. السبب إن اللوج بيتمشى على
   Vercel وممكن يبقى متاح لأي حد عندك صلاحية عليه.

   الحقول المطلوبة:
     - اسم المتغيّر اللي اتختار
     - هل القيمة موجودة
     - طول القيمة
     - هل تبدأ بـ sb_secret_
     - هل تبدأ بـ sb_publishable_
     - هل أول محرف مسافة
     - هل آخر محرف مسافة
   زائد حقل واحد تشخيصي: `looksLikeLegacyJwt` — عشان نفرّق بين
   "مفتاح قديم اتحط مكان الجديد" و"مفتاح جديد غلط"، من غير ما نظره.
   ═══════════════════════════════════════════════════════════════════════ */

/** فحص الشكل من غير طباعة أي محرف. */
function describeKeyShape(name: string, raw: string): string {
  const trimmed = raw.trim();
  return [
    `var=${name}`,
    `exists=true`,
    // ⚠️ الطول بس — قيمته مش بتتطبع.
    `length=${trimmed.length}`,
    `startsWith_sb_secret=${trimmed.startsWith("sb_secret_")}`,
    `startsWith_sb_publishable=${trimmed.startsWith("sb_publishable_")}`,
    `startsWith_sb_=${trimmed.startsWith("sb_")}`,
    `firstCharIsWhitespace=${/^\s/.test(raw)}`,
    `lastCharIsWhitespace=${/\s$/.test(raw)}`,
    // JWT = 3 أجزاء مفصولة بنقطة — ده نص الشكل فقط.
    `looksLikeLegacyJwt=${trimmed.split(".").length === 3}`,
    `hadWhitespace=${trimmed !== raw}`,
  ].join(" ");
}

/**
 * بتقرا المفتاح من البيئة، مفضّلة الصيغة الجديدة.
 *
 * مُصدَّرة كدالة نقية بتاخد `env` كوسيلة عشان تبقى قابلة للاختبار من غير
 * ما نلمس `process.env` ومن غير ما نحطّ سر حقيقي في أي اختبار.
 */
export function resolveSupabaseSecretKey(
  env: Record<string, string | undefined> = process.env,
): string | null {
  // 🩺 تشخيص: وجود/غياب كل متغيّر بالاسم (من غير أي قيمة).
  for (const name of SECRET_KEY_VARS) {
    const raw = env[name];
    console.warn(
      `[supabase-diag] present ${name}=${typeof raw === "string"}` +
        (typeof raw === "string" ? ` ${describeKeyShape(name, raw)}` : ""),
    );
  }

  for (const name of SECRET_KEY_VARS) {
    const raw = env[name];
    if (typeof raw !== "string") continue;

    const trimmed = raw.trim();
    if (!trimmed) continue;

    // تشخيص مفيد و**آمن**: بيقول فيه مسافة زيادة من غير ما يقول إيه.
    if (trimmed !== raw) {
      console.warn(
        `[supabase] ${name} فيه مسافات في الأول/الآخر — اتشال تلقائيًا. ` +
          `عادةً بتبقى سطر جديد زائد من لصق القيمة في Vercel.`,
      );
    }
    console.warn(`[supabase-diag] selected=${name}`);
    return trimmed;
  }

  console.warn(`[supabase-diag] selected=NONE (no usable key in env)`);
  return null;
}

/** هل مفاتيح السيرفر جاهزة أصلاً؟ (من غير ما نبني عميل) */
export function isServiceKeyConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && resolveSupabaseSecretKey(),
  );
}

/** عميل بيزوّد RLS — للسيرفر بس. */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secretKey = resolveSupabaseSecretKey();
  if (!url || !secretKey) {
    throw new Error(
      `Missing NEXT_PUBLIC_SUPABASE_URL or ${SECRET_KEY_VARS.join(" / ")}`,
    );
  }
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
