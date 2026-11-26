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

export type AdminRole = "owner" | "admin" | "support" | null;

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
    const { data, error } = await supabase
      .from("site_admins")
      .select("role, permissions")
      .eq("user_id", userId)
      .maybeSingle();

    if (!error && data?.role === "admin" && Array.isArray(data.permissions) && data.permissions.includes("support")) {
      return "support";
    }

    if (error) {
      const legacy = await supabase
        .from("site_admins")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      return (legacy.data?.role as AdminRole) || null;
    }

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
  | "users.read" | "users.ban" | "users.unban" | "users.impersonate" | "users.regenerate_code"
  | "plans.manage" | "trial.manage" | "models.manage" | "rewards.manage"
  | "admins.manage" | "files.moderate" | "audit.read"
  | "subscriptions.manage" | "credits.manage" | "announcements.manage" | "support.manage"
  | "support.view" | "support.reply" | "support.assign"
  | "site.owner";

export const ADMIN_PERMISSION_KEYS: AdminPermissionKey[] = [
  "users.read", "users.ban", "users.unban", "users.impersonate", "users.regenerate_code",
  "plans.manage", "trial.manage", "models.manage", "rewards.manage",
  "admins.manage", "files.moderate", "audit.read", "subscriptions.manage", "credits.manage", "announcements.manage", "support.manage",
  "support.view", "support.reply", "support.assign",
];

/** أي العمليات تعتبر حساسة وتحتاج تسجيل في audit_log. */
export const SENSITIVE_ACTIONS: AdminPermissionKey[] = [
  "users.ban", "users.unban", "users.impersonate", "users.regenerate_code",
  "plans.manage", "trial.manage", "models.manage", "rewards.manage",
  "admins.manage", "files.moderate", "subscriptions.manage", "credits.manage", "announcements.manage", "support.manage",
  "support.view", "support.reply", "support.assign",
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
  "users.regenerate_code": { key: "users.regenerate_code", allowed_roles: ["owner","admin"], is_sensitive: true },
  "plans.manage":       { key: "plans.manage", allowed_roles: ["owner"], is_sensitive: true },
  "trial.manage":       { key: "trial.manage", allowed_roles: ["owner"], is_sensitive: true },
  "models.manage":      { key: "models.manage", allowed_roles: ["owner"], is_sensitive: true },
  "rewards.manage":     { key: "rewards.manage", allowed_roles: ["owner"], is_sensitive: true },
  "admins.manage":      { key: "admins.manage", allowed_roles: ["owner"], is_sensitive: true },
  "files.moderate":     { key: "files.moderate", allowed_roles: ["owner","admin","support"], is_sensitive: true },
  "audit.read":         { key: "audit.read", allowed_roles: ["owner","admin","support"], is_sensitive: false },
  "subscriptions.manage": { key: "subscriptions.manage", allowed_roles: ["owner","admin"], is_sensitive: true },
  "credits.manage":       { key: "credits.manage", allowed_roles: ["owner"], is_sensitive: true },
  "announcements.manage": { key: "announcements.manage", allowed_roles: ["owner","admin"], is_sensitive: true },
  "support.manage": { key: "support.manage", allowed_roles: ["owner","admin","support"], is_sensitive: true },
  "support.view": { key: "support.view", allowed_roles: ["owner","admin","support"], is_sensitive: false },
  "support.reply": { key: "support.reply", allowed_roles: ["owner","admin","support"], is_sensitive: false },
  "support.assign": { key: "support.assign", allowed_roles: ["owner","admin","support"], is_sensitive: false },
  "site.owner": { key: "site.owner", allowed_roles: ["owner"], is_sensitive: true },
};

/** الصلاحيات الافتراضية للأدوار عند غياب قائمة صريحة في قاعدة البيانات. */
function defaultPermissionsForRole(role: Exclude<AdminRole, "owner" | null>): AdminPermissionKey[] {
  if (role === "admin") {
    return ADMIN_PERMISSION_KEYS.filter((key) =>
      ADMIN_PERMISSION_MAP[key].allowed_roles.includes("admin")
    );
  }
  // Support: صلاحيات قراءة محدودة وإدارة صندوق الدعم فقط.
  return ["users.read", "files.moderate", "audit.read", "support.manage"];
}

/** قراءة الصلاحيات مع تمييز القائمة الصريحة الفارغة عن غياب إعداد الصلاحيات. */
async function readAdminPermissionState(
  supabase: SupabaseClient,
  userId: string | null,
  role: AdminRole
): Promise<{ permissions: AdminPermissionKey[]; explicit: boolean }> {
  if (!userId || role === null) return { permissions: [], explicit: false };
  if (role === "owner") return { permissions: [...ADMIN_PERMISSION_KEYS], explicit: true };

  try {
    const { data, error } = await supabase
      .from("site_admins")
      .select("permissions, role")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      // توافق آمن مع المخطط القديم فقط عند غياب عمود permissions؛ أخطاء
      // الاتصال/الصلاحيات الأخرى تفشل مغلقًا بدل منح صلاحيات افتراضية.
      if (error.code === "42703" || error.code === "PGRST204") {
        return { permissions: defaultPermissionsForRole(role), explicit: false };
      }
      return { permissions: [], explicit: true };
    }

    if (!data) return { permissions: [], explicit: true };

    const permsArray: string[] = Array.isArray(data.permissions) ? data.permissions : [];
    if (permsArray.length > 0) {
      const explicitPermissions = permsArray.filter((p): p is AdminPermissionKey =>
        ADMIN_PERMISSION_KEYS.includes(p as AdminPermissionKey) &&
        ADMIN_PERMISSION_MAP[p as AdminPermissionKey].allowed_roles.includes(role)
      );
      if (explicitPermissions.length > 0) return { permissions: explicitPermissions, explicit: true };
      // تمثيل Support القديم: role=admin مع marker "support" في permissions.
      if (role === "support" && permsArray.includes("support")) {
        return { permissions: defaultPermissionsForRole(role), explicit: false };
      }
      // أي قائمة صريحة أخرى تظل تقييدية حتى لو كانت مفاتيحها غير معروفة
      // أو لا يسمح بها الدور؛ لا نحوّلها بالخطأ إلى صلاحيات افتراضية.
      return { permissions: [], explicit: true };
    }

    return { permissions: defaultPermissionsForRole(role), explicit: false };
  } catch {
    return { permissions: [], explicit: false };
  }
}

/** قراءة الصلاحيات من جدول site_admins (مع دعم الـpermissions column الجديد). */
export async function getAdminPermissions(
  supabase: SupabaseClient,
  userId: string | null,
  role: AdminRole
): Promise<AdminPermissionKey[]> {
  return (await readAdminPermissionState(supabase, userId, role)).permissions;
}

/** فحص إذا كان الأدمن يملك صلاحية معينة، مع تطبيق قيود الدور حتى على القوائم الصريحة. */
export async function hasPermission(
  supabase: SupabaseClient,
  userId: string | null,
  userEmail: string | null,
  permissionKey: AdminPermissionKey
): Promise<boolean> {
  const role = await getAdminRole(supabase, userId, userEmail);
  if (role === "owner") return true;
  if (role === null || !ADMIN_PERMISSION_MAP[permissionKey].allowed_roles.includes(role)) return false;

  const { permissions } = await readAdminPermissionState(supabase, userId, role);
  return permissions.includes(permissionKey);
}

/** فحص إذا كانت العملية تحتاج تسجيل في Audit Log. */
export function isSensitivePermission(key: AdminPermissionKey): boolean {
  return SENSITIVE_ACTIONS.includes(key);
}
