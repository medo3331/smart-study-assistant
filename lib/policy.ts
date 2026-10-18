"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAdminRole,
  getAdminPermissions,
  AdminPermissionKey,
  ADMIN_PERMISSION_KEYS,
} from "@/lib/auth-roles";

export type ActorRole = "owner" | "admin" | "support" | null;

export interface ActorContext {
  /** معرف المستخدم من الجلسة (null للزائر) */
  userId: string | null;
  /** بريد المستخدم من الجلسة */
  userEmail: string | null;
  /** الدور المحلول: owner / admin / support / null */
  role: ActorRole;
  /** true iff المالك حسب env OWNER_EMAIL أو site_admins(role='owner') */
  isOwner: boolean;
  /** قائمة الصلاحيات المحلولة للفاعل */
  permissions: AdminPermissionKey[];
  /** عميل supabase المستخدم في реша الدور (قد يكون service_role) */
  supabase: SupabaseClient;
}

/**
 * ═══ مركز صنع السياسة (Policy Decision Point) — المالك والصلاحيات ═══
 *
 * كل قرار بشأن "هل هذا المستخدم مالك؟" أو "هل يتجاوز الكوتة الداخلية؟"
 * يمر عبر هذا الملف فقط. لا توجد فحوص `role === "owner"` أو
 * `isOwnerEmail()` متناثرة خارج هذا الملف.
 *
 * مبادئ العمل:
 * 1. المالك (Owner) دور خادم موثوق يُحدّد عبر env OWNER_EMAIL أو جدول
 *    site_admins(role='owner') — وليس عبر خطة اشتراك.
 * 2. Premium هي خطة اشتراك (entitlement kind='plan', value='premium') — مختلفة
 *    عن دور المالك. المالك لا يملك "بلا limit" تلقائياً للمرءстрой.provider.
 * 3. المالك يتجاوز الحدود الداخلية للمنصة (كوتة الاشتراك، رصيد AI) لكنه لا
 *    يتجاوز حدود الموفر (Provider Rate Limits) ولا ميزانية المنصة (Platform Budget).
 * 4. الأدمن العادي لا يستطيع تعديل حسابات المالكين.
 */

export async function resolveActor(
  supabase: SupabaseClient,
  userId: string | null,
  userEmail: string | null
): Promise<ActorContext> {
  const role = await getAdminRole(supabase, userId, userEmail);
  const isOwner = role === "owner";
  const permissions = isOwner
    ? [...ADMIN_PERMISSION_KEYS]
    : await getAdminPermissions(supabase, userId, role);
  return { userId, userEmail, role, isOwner, permissions, supabase };
}

/** هل يتخطى هذا الفاعل الحدود الداخلية للمنصة (كوتة، رصيد AI)؟ */
export function canBypassInternalLimits(actor: ActorContext): boolean {
  return actor.isOwner;
}

/**
 * هل يمكن لهذا الفاعل تعديل حساب مستهدف؟
 * - المالك يعدل أي حساب.
 * - المستخدم يعدل حسابه الخاص.
 * - الأدمن العادي لا يعدل حساب مالك آخر.
 */
export async function canModifyAccount(
  actor: ActorContext,
  targetUserId: string | null,
  targetUserEmail: string | null
): Promise<boolean> {
  if (!targetUserId) return false;
  if (actor.isOwner) return true;
  if (actor.userId === targetUserId) return true;
  const targetRole = await getAdminRole(
    actor.supabase,
    targetUserId,
    targetUserEmail ?? null
  );
  return targetRole !== "owner";
}

/** هل الصلاحية خاصة بالمالك فقط؟ */
export function isOwnerOnlyPermission(key: AdminPermissionKey): boolean {
  const ownerOnly: AdminPermissionKey[] = [
    "plans.manage",
    "trial.manage",
    "models.manage",
    "rewards.manage",
    "admins.manage",
    "credits.manage",
  ];
  return ownerOnly.includes(key);
}

/** قائمة الصلاحيات الخاصة بالمالك فقط (للإشارة في الواجهات والتدقيق) */
export const OWNER_ONLY_PERMISSIONS: AdminPermissionKey[] = [
  "plans.manage",
  "trial.manage",
  "models.manage",
  "rewards.manage",
  "admins.manage",
];

/** فحص ما إذا كان الفاعل يملك صلاحية معينة (المالك يتخطى تلقائياً) */
export function actorHasPermission(
  actor: ActorContext,
  permissionKey: AdminPermissionKey
): boolean {
  if (actor.isOwner) return true;
  return actor.permissions.includes(permissionKey);
}
