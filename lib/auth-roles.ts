/**
 * 🧭 خريطة الأدوار — مصدر واحد يستخدمه الـproxy والأونبوردنج والصفحات.
 *
 * ⚠️ الأدوار دي أسماء راوتات فوق النظام الموجود، مش بديل عنه:
 *   - المصدر في الداتابيز هو profiles.persona ('student' | 'grad' | 'freelancer')
 *     و profiles.role عمود مولَّد منه (db/auth-phase1.sql): grad → graduate.
 *   - الكتابة دايمًا في persona؛ القراءة من role أو persona بالتساوي هنا.
 *   - الداشبورد الحالي فضل شغال زي ما هو: كل دور بيفتح نفس الواجهة
 *     على مساره الخاص (/dashboard/<role>) لحد ما النسخ المتخصصة تجهز.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** قيم persona كما هي في قاعدة البيانات (نفس قيم isPersona في user-persona.ts). */
export type DbPersona = "student" | "grad" | "freelancer";

/** قيم role كما تُقرأ من العمود المولَّد. */
export type AppRole = "student" | "graduate" | "freelancer";

export interface RoleHomeMeta {
  /** مسار داشبورد الدور */
  home: string;
  /** معرّف الشخصية في الداتابيز (profiles.persona) */
  persona: DbPersona;
}

export const ROLE_HOMES: Record<AppRole, RoleHomeMeta> = {
  student: { home: "/dashboard/student", persona: "student" },
  graduate: { home: "/dashboard/graduate", persona: "grad" },
  freelancer: { home: "/dashboard/freelancer", persona: "freelancer" },
};

export const ROLE_PATHS = ["/dashboard/student", "/dashboard/graduate", "/dashboard/freelancer"] as const;

/** الدور الافتراضي لما مفيش قيمة صالحة — نفس DEFAULT_PERSONA في user-persona.ts. */
export const DEFAULT_ROLE: AppRole = "student";

/** تحويل قيمة عمود role إلى AppRole صالح، وإلا null. */
export function parseRole(value: unknown): AppRole | null {
  return value === "student" || value === "graduate" || value === "freelancer" ? value : null;
}

/** تحويل قيمة persona إلى AppRole (نفس تحويل العمود المولَّد). */
export function personaToRole(persona: unknown): AppRole | null {
  switch (persona) {
    case "student":
      return "student";
    case "grad":
      return "graduate";
    case "freelancer":
      return "freelancer";
    default:
      return null;
  }
}

/** وجهة المستخدم بعد الدخول/الأونبوردنج — الدور الصريح أولًا ثم الداشبورد العام. */
export function roleHome(role: unknown): string {
  const parsed = parseRole(role);
  return parsed ? ROLE_HOMES[parsed].home : "/dashboard";
}

/**
 * فلتر `next` الآمن — نفس منطق safeNext الموجود في login وauth/callback:
 * مسارات داخلية فقط، ورفض `//host` والباك سلايش (open redirect).
 */
export function safeNext(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  return raw;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔐 Admin / Owner Roles — امتداد لنفس الملف (لا يكسر الاستيرادات القديمة)
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ OWNER_EMAIL هو متغيّر Server-only — لا تستخدم NEXT_PUBLIC_*. أي استخدام
// لهذا الملف في Client Component سيُرجع null للـowner (آمن بالتصميم).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * تحقق هل email هو الـOwner المصرّح له. Server-only — يقرأ OWNER_EMAIL فقط.
 * مقارنة دقيقة (trim + lower) وليس includes لتفادي ثغرة "gmail.com يحتوي gmail".
 */
export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.OWNER_EMAIL || process.env.ADMIN_EMAILS || "";
  if (!raw) return false;
  const normalized = email.trim().toLowerCase();
  // يدعم قيمة واحدة أو قائمة مفصولة بفواصل (ADMIN_EMAILS legacy)
  const allowed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(normalized);
}

export type AdminRole = "owner" | "admin" | null;

/**
 * دالة فحص مستوى صلاحية الأدمن (Owner vs Admin)
 * - الـ Owner يُحدد عبر env Server-only (OWNER_EMAIL)
 * - غير ذلك يُفحص من جدول site_admins
 * - هذه الدالة Server-only بالتصميم — لا تستدعها من Client Component
 */
export async function getAdminRole(
  supabase: SupabaseClient,
  userId: string | null,
  userEmail?: string | null
): Promise<AdminRole> {
  if (!userId) return null;

  // 1) Owner allowlist — Server-only، مقارنة دقيقة
  if (isOwnerEmail(userEmail ?? null)) {
    return "owner";
  }

  try {
    const { data } = await supabase
      .from("site_admins")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    return (data?.role as AdminRole) || null;
  } catch {
    return null;
  }
}
