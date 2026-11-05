import { isPgConfigured, pgQuery } from "./pg";

/**
 * 👤 استهلاك المستخدم التفصيلي (المرحلة 4.4) — لكل مستخدم في /admin/users/[id].
 *
 * مصادر حقيقية مؤكدة في الريبو:
 * - ملفات المستخدم: `files.profile_id` (db/epic2-file-upload.sql).
 * - رسائل AI: `ai_credit_ledger.reason='ai_reserve'` (نفس مصدر overview.ts/ai-overview.ts).
 * - رصيد النقاط/AI: مجموع `ai_credit_ledger.delta`.
 * - الاشتراك النشط: `subscription_activations.revoked_at IS NULL` (db/epic2-admin-rbac-audit-schema.sql).
 * - الخطة الحالية: `entitlements(kind='plan')` النشطة (مصدر الحقيقة — راجع lib/admin/overview.ts).
 *
 * ⚠️ كل استعلام معزول في try/catch: جدول مفقود = N/A بسبب واضح في `errors`،
 * مش رقم وهمي ومش سقوط لباقي الأرقام. DATABASE_URL مفقود = كلها N/A.
 */

export interface UserSubscriptionRow {
  plan_key: string;
  duration_days: number;
  created_at: string;
  expires_at: string | null;
  note: string | null;
}

export interface UserPlanRow {
  value: string;
  is_trial: boolean;
  expires_at: string | null;
}

export interface UserQuotaRow {
  messages_24h: number;
  uploads_today: number;
  updated_at: string | null;
  message_limit: number | null;
  upload_limit: number | null;
}

export interface UserConsumption {
  /** عدد ملفات المستخدم */
  filesCount: number | null;
  /** إجمالي حجم الملفات بالبايت */
  filesBytes: number | null;
  /** رسائل AI المحجوزة (reason='ai_reserve') */
  messagesCount: number | null;
  /** رصيد النقاط الحالي = مجموع delta */
  creditsBalance: number | null;
  /** آخر اشتراك غير ملغى (null = مفيش) */
  activeSubscription: UserSubscriptionRow | null;
  /** الخطة النشطة حاليًا من entitlements (premium/trial) أو null = free */
  currentPlan: UserPlanRow | null;
  /** حصة الرسائل/الرفع (subscription_quotas + plan limits) أو null = غير متاح */
  quota: UserQuotaRow | null;
  /** أسباب أي رقم N/A — بتتعرض في الواجهة بدل الصمت */
  errors: string[];
}

export async function getUserConsumption(userId: string): Promise<UserConsumption> {
  const errors: string[] = [];
  const out: UserConsumption = {
    filesCount: null,
    filesBytes: null,
    messagesCount: null,
    creditsBalance: null,
    activeSubscription: null,
    currentPlan: null,
    quota: null,
    errors,
  };

  if (!isPgConfigured()) {
    errors.push("DATABASE_URL غير متاح — الاستهلاك غير قابل للتحقق من هنا.");
    return out;
  }

  // 1) ملفات المستخدم
  try {
    const [r] = await pgQuery<{ n: string; bytes: string | null }>(
      `SELECT count(*)::text AS n, coalesce(sum(file_size), 0)::text AS bytes
         FROM public.files WHERE profile_id = $1`,
      [userId]
    );
    out.filesCount = r ? parseInt(r.n, 10) : null;
    out.filesBytes = r ? parseInt(r.bytes || "0", 10) : null;
  } catch {
    errors.push("ملفات المستخدم: جدول files غير متاح.");
  }

  // 2) رسائل AI + رصيد النقاط
  try {
    const [r] = await pgQuery<{ msgs: string; bal: string }>(
      `SELECT count(*) FILTER (WHERE reason = 'ai_reserve')::text AS msgs,
              coalesce(sum(delta), 0)::text AS bal
         FROM public.ai_credit_ledger WHERE user_id = $1`,
      [userId]
    );
    out.messagesCount = r ? parseInt(r.msgs, 10) : null;
    out.creditsBalance = r ? parseInt(r.bal, 10) : null;
  } catch {
    errors.push("رسائل/رصيد AI: جدول ai_credit_ledger غير متاح.");
  }

  // 3) آخر اشتراك نشط (غير ملغى) + تاريخ الانتهاء المحسوب من duration_days
  try {
    const [r] = await pgQuery<{
      plan_key: string;
      duration_days: number;
      created_at: string;
      note: string | null;
    }>(
      `SELECT plan_key, duration_days, created_at::text, note
         FROM public.subscription_activations
        WHERE user_id = $1 AND revoked_at IS NULL
        ORDER BY created_at DESC NULLS LAST
        LIMIT 1`,
      [userId]
    );
    if (r) {
      let expires_at: string | null = null;
      try {
        const created = new Date(r.created_at);
        expires_at = new Date(created.getTime() + r.duration_days * 86400_000).toISOString();
      } catch {
        expires_at = null;
      }
      out.activeSubscription = {
        plan_key: r.plan_key,
        duration_days: r.duration_days,
        created_at: r.created_at,
        expires_at,
        note: r.note ?? null,
      };
    }
  } catch {
    errors.push("الاشتراك النشط: جدول subscription_activations غير متاح.");
  }

  // 4) الخطة النشطة من entitlements (مصدر الحقيقة)
  try {
    const [r] = await pgQuery<{ value: string; is_trial: boolean; expires_at: string | null }>(
      `SELECT value,
              metadata->>'source' = 'premium_trial_0_5' AS is_trial,
              expires_at::text AS expires_at
         FROM public.entitlements
        WHERE user_id = $1 AND kind = 'plan'
          AND (expires_at IS NULL OR expires_at > now())
        ORDER BY expires_at DESC NULLS LAST
        LIMIT 1`,
      [userId]
    );
    if (r) {
      out.currentPlan = { value: r.value, is_trial: r.is_trial === true, expires_at: r.expires_at };
    }
  } catch {
    errors.push("الخطة الحالية: جدول entitlements غير متاح.");
  }

  // 5) حصة المستخدم (subscription_quotas + limits من subscription_plans)
  try {
    const [q] = await pgQuery<{ messages_24h: string; uploads_today: string; updated_at: string | null }>(
      `SELECT messages_24h::text, uploads_today::text, updated_at::text
         FROM public.subscription_quotas WHERE user_id = $1`,
      [userId]
    );
    if (q) {
      const planKey = out.currentPlan?.value || out.activeSubscription?.plan_key || "free";
      let messageLimit: number | null = null;
      let uploadLimit: number | null = null;
      try {
        const [p] = await pgQuery<{ messages_per_day: number | null; uploads_per_day: number | null }>(
          `SELECT messages_per_day, uploads_per_day FROM public.subscription_plans WHERE plan_key = $1`,
          [planKey]
        );
        if (p) {
          messageLimit = p.messages_per_day ?? null;
          uploadLimit = p.uploads_per_day ?? null;
        }
      } catch { /* limits optional */ }
      out.quota = {
        messages_24h: parseInt(q.messages_24h || "0", 10),
        uploads_today: parseInt(q.uploads_today || "0", 10),
        updated_at: q.updated_at,
        message_limit: messageLimit,
        upload_limit: uploadLimit,
      };
    }
  } catch {
    errors.push("الحصص: جدول subscription_quotas غير متاح.");
  }

  return out;
}
