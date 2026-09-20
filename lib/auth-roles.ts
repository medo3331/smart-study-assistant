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

// ─────────────────────────────────────────────────────────────────────────────
// 🔐 EPIC-2 — RBAC Permission System (added 2026-09-19)
// Note: site_admins.permissions column needs DB execution first (`db/epic2-admin-rbac-audit-schema.sql`).
// This code handles both old schema (no permissions column) and new schema gracefully.
// ─────────────────────────────────────────────────────────────────────────────

/** مفاتيح الصلاحيات حسب المستند EPIC-2 (§1.3). */
export type AdminPermissionKey =
  | "users.read" | "users.ban" | "users.unban" | "users.impersonate"
  | "plans.manage" | "trial.manage" | "models.manage" | "rewards.manage"
  | "admins.manage" | "files.moderate" | "audit.read"
  | "subscriptions.manage";

export const ADMIN_PERMISSION_KEYS: AdminPermissionKey[] = [
  "users.read", "users.ban", "users.unban", "users.impersonate",
  "plans.manage", "trial.manage", "models.manage", "rewards.manage",
  "admins.manage", "files.moderate", "audit.read", "subscriptions.manage",
];

/** أي العمليات تعتبر حساسة وتحتاج تسجيل في audit_log. */
export const SENSITIVE_ACTIONS: AdminPermissionKey[] = [
  "users.ban", "users.unban", "users.impersonate",
  "plans.manage", "trial.manage", "models.manage",
  "admins.manage", "subscriptions.manage",
];

export interface AdminPermissionRecord {
  key: AdminPermissionKey;
  allowed_roles: ("owner" | "admin" | "support")[];
  is_sensitive: boolean;
}

export const ADMIN_PERMISSION_MAP: Record<AdminPermissionKey, AdminPermissionRecord> = {
  "users.read":         { key: "users.read", allowed_roles: ["owner","admin","support"], is_sensitive: false },
  "users.ban":          { key: "users.ban", allowed_roles: ["owner","admin"], is_sensitive: true },
  "users.unban":        { key: "users.unban", allowed_roles: ["owner","admin"], is_sensitive: true },
  "users.impersonate":  { key: "users.impersonate", allowed_roles: ["owner","admin"], is_sensitive: true },
  "plans.manage":       { key: "plans.manage", allowed_roles: ["owner"], is_sensitive: true },
  "trial.manage":       { key: "trial.manage", allowed_roles: ["owner"], is_sensitive: true },
  "models.manage":      { key: "models.manage", allowed_roles: ["owner"], is_sensitive: true },
  "rewards.manage":     { key: "rewards.manage", allowed_roles: ["owner"], is_sensitive: true },
  "admins.manage":      { key: "admins.manage", allowed_roles: ["owner"], is_sensitive: true },
  "files.moderate":     { key: "files.moderate", allowed_roles: ["owner","admin","support"], is_sensitive: true },
  "audit.read":         { key: "audit.read", allowed_roles: ["owner","admin","support"], is_sensitive: false },
  "subscriptions.manage": { key: "subscriptions.manage", allowed_roles: ["owner","admin"], is_sensitive: true },
};

/** قراءة الصلاحيات من جدول site_admins (مع دعم الـpermissions column الجديد). */
export async function getAdminPermissions(
  supabase: SupabaseClient,
  userId: string | null,
  role: AdminRole
): Promise<AdminPermissionKey[]> {
  if (!userId || role === null) return [];

  // Owner: كل الصلاحيات
  if (role === "owner") return [...ADMIN_PERMISSION_KEYS];

  try {
    const { data } = await supabase
      .from("site_admins")
      .select("permissions, role")
      .eq("user_id", userId)
      .maybeSingle();

    // إذا الـ permissions column موجود (بعد تنفيذ SQL)
    const permsArray: string[] = data?.permissions || [];
    if (permsArray.length > 0) {
      return permsArray.filter((p): p is AdminPermissionKey =>
        ADMIN_PERMISSION_KEYS.includes(p as AdminPermissionKey)
      );
    }

    // إذا الـ column غير موجود بعد → افتراضي حسب الدور
    // Admin: كل شيء ما عدا models.manage و admins.manage و plans.manage و trial.manage (Owner-only)
    // Support: users.read + files.moderate + audit.read + subscriptions.manage (لا trial.manage ولا plans.manage)
    if (data?.role === "admin") {
      return ADMIN_PERMISSION_KEYS.filter(
        (k) => k !== "models.manage" && k !== "admins.manage" && k !== "plans.manage" && k !== "trial.manage"
      );
    }
    // Support (يمثل بـ admin + permissions خاص) — افتراضي محدود بدون plans.manage أو trial.manage
    return [
      "users.read", "files.moderate", "audit.read", "subscriptions.manage"
    ];
  } catch {
    return [];
  }
}

/** فحص إذا كان الأدمن يملك صلاحية معينة. */
export async function hasPermission(
  supabase: SupabaseClient,
  userId: string | null,
  userEmail: string | null,
  permissionKey: AdminPermissionKey
): Promise<boolean> {
  const role = await getAdminRole(supabase, userId, userEmail);
  if (role === "owner") return true;
  if (role === null) return false;
  const perms = await getAdminPermissions(supabase, userId, role);
  const record = ADMIN_PERMISSION_MAP[permissionKey];
  // إذا الـ permission مسموح للدور حسب الخريطة
  if (record && record.allowed_roles.includes(role as "owner" | "admin")) {
    // إذا الـ permissions array موجود، نتحقق من وجود المفتاح فيه أيضًا
    if (perms.length > 0) return perms.includes(permissionKey);
    // إذا لم يتم تنفيذ SQL بعد → نعتمد على الخريطة الافتراضية
    return true;
  }
  return false;
}

/** فحص إذا كانت العملية تحتاج تسجيل في Audit Log. */
export function isSensitivePermission(key: AdminPermissionKey): boolean {
  return SENSITIVE_ACTIONS.includes(key);
}
