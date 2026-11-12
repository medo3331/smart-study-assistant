/**
 * 🛡️ حارس Server Actions — المصدر الوحيد لهوية الأدمن.
 *
 * ⚠️ ليه الملف ده موجود:
 *   صفحات /admin/* محمية بـ requireAdminPermission، لكن الصفحة مش هي اللي
 *   بتتنفّذ لما حد ينادي Server Action. الـ action معرّفه في الـ JS العام
 *   (كل action ليه ID بيتشحن للمتصفح)، فأي حد يقدر يبعته بـ POST مباشرة —
 *   الـ Origin check بتاع Next بيحمي المتصفح بس، مش عميل HTTP عادي.
 *
 *   قبل الملف ده كانت أفعال زي `exportTable` و`recordPayment` بتشتغل بـ
 *   service_role من غير أي فحص، وبعضها كان بياخد `adminUserId` من المتصل
 *   ويبني عليه قرار "هل ده Owner؟" — يعني انتحال شخصية المالك.
 *
 * ⚠️ القاعدة الحاكمة: **الهوية تيجي من الجلسة فقط**.
 *   `resolveActor` هنا بتاخد `user.id` من `auth.getUser()`، مش من باراميتر.
 *   أي action بياخد `adminUserId`/`adminEmail` من العميل بقى خطأ في التصميم.
 */

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";

import { resolveActor, type ActorContext } from "@/lib/policy";
import type { AdminPermissionKey } from "@/lib/auth-roles";

/** رفض مُصنَّف — بنرجّعه للعميل كرسالة بدل ما نرمي استثناء غامض. */
export class ActionAuthError extends Error {
  readonly code: "unauthenticated" | "forbidden";

  constructor(code: "unauthenticated" | "forbidden", message: string) {
    super(message);
    this.name = "ActionAuthError";
    this.code = code;
  }
}

/** الشكل الموحّد لأي action مرفوض. متوافق مع `{ ok, message }` المستخدم في المشروع. */
export interface ActionDenied {
  ok: false;
  message: string;
  error: "unauthenticated" | "forbidden";
}

export interface GuardedActor {
  /** الفاعل المحلول من الجلسة — مفيش أي قيمة فيه جاية من العميل. */
  actor: ActorContext;
  /** المستخدم من `auth.getUser()` (مش من توكن مش فحص). */
  user: User;
}

function buildSupabase(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } }
  );
}

/**
 * يقرأ الجلسة من الكوكيز، يحل الدور من الداتابيز، ويفرض الصلاحية.
 * بيرمي `ActionAuthError` لو مرفوض — استخدمه جوه try/catch أو عبر `guardAction`.
 */
export async function requireAdminActor(permission: AdminPermissionKey): Promise<GuardedActor> {
  const cookieStore = await cookies();
  const supabase = buildSupabase(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    throw new ActionAuthError("unauthenticated", "غير مصرح: لازم تسجيل دخول");
  }

  // الهوية من الجلسة — لا باراميترات، لا هيدرز.
  const actor = await resolveActor(supabase, user.id, user.email ?? null);

  if (actor.role === null) {
    throw new ActionAuthError("forbidden", "غير مصرح: الحساب ده مش من فريق الإدارة");
  }

  const allowed = actor.isOwner || actor.permissions.includes(permission);
  if (!allowed) {
    throw new ActionAuthError("forbidden", `غير مصرح — الصلاحية المطلوبة: ${permission}`);
  }

  return { actor, user };
}

/**
 * غلاف لـ Server Action: بيفرض الصلاحية قبل التنفيذ ويرجّع رفضًا مُصنَّفًا.
 *
 * ```ts
 * export const deletePayment = guardAction("subscriptions.manage", async (ctx, id: string) => {
 *   // ctx.actor.userId هو الأدمن الحقيقي
 * });
 * ```
 *
 * ⚠️ استخدمه على كل action مُصدَّر من `app/admin/actions/*`. أي action
 * مُصدَّر بدون غلاف = نقطة دخول مفتوحة.
 */
export function guardAction<Args extends unknown[], R>(
  permission: AdminPermissionKey,
  fn: (ctx: GuardedActor, ...args: Args) => Promise<R>
): (...args: Args) => Promise<R | ActionDenied> {
  return async (...args: Args): Promise<R | ActionDenied> => {
    let ctx: GuardedActor;
    try {
      ctx = await requireAdminActor(permission);
    } catch (e) {
      if (e instanceof ActionAuthError) {
        return { ok: false, message: e.message, error: e.code };
      }
      throw e;
    }
    return fn(ctx, ...args);
  };
}

/** هل النتيجة رفض؟ (للتفريع في الأفعال اللي بترجّع أنواع مختلفة) */
export function isActionDenied<T>(value: T | ActionDenied): value is ActionDenied {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as ActionDenied).ok === false &&
    typeof (value as ActionDenied).error === "string" &&
    ((value as ActionDenied).error === "unauthenticated" ||
      (value as ActionDenied).error === "forbidden")
  );
}
