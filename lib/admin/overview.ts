import { pgQuery } from "./pg";

/**
 * 📊 نظرة عامة على الاشتراكات — منطق منقول حرفيًا من app/admin/page.tsx
 * (المرحلة 1: تفكيك الصفحة بدون تغيير مصدر الأرقام).
 *
 * ⚠️ مصدر الحقيقة هو entitlements(kind='plan', value='premium').
 * مفيش في المشروع جدول `plans` ولا `user_subscriptions`. التجربة المجانية
 * بتتميّز بـ metadata.source='premium_trial_0_5'
 * (شوف db/economy-phase-0-5-trial-atomic.sql).
 */

export type RecentSignup = {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string | null;
  is_premium: boolean;
  on_trial: boolean;
};

export interface PlatformOverview {
  premium: number;
  trials: number;
  recent: RecentSignup[];
  /** إجمالي المستخدمين حسب نفس مصدر الصفحة الرئيسية (entitlements-less) */
  totalUsers: number | null;
  /** مشتركو Pro/Ultra من subscription_activations (غير ملغاة) — مقسّمين حسب plan_key */
  activationsByPlan: { plan_key: string; users: number }[];
  /** ملفات اليوم / آخر 7 أيام من files.created_at */
  filesToday: number | null;
  filesWeek: number | null;
  /** رسائل اليوم: ai_credit_ledger (reason='ai_reserve') ثم ai_operations كبديل */
  messagesToday: number | null;
  messagesTodaySource: "ai_credit_ledger" | "ai_operations" | null;
  /** أكثر خطة استخدامًا من الاشتراكات النشطة (plan_key + عدد) أو null لو مفيش */
  topPlan: { plan_key: string; users: number } | null;
}

export async function getPlatformOverview(): Promise<{ data: PlatformOverview | null; error: string | null }> {
  try {
    const [premRes, trialRes, usersRes, actRes, filesTodayRes, filesWeekRes, ledgerRes] = await Promise.all([
      pgQuery<{ count: string }>(
        `SELECT count(distinct user_id)::text AS count FROM entitlements
          WHERE kind='plan' AND value='premium' AND (expires_at IS NULL OR expires_at > now())`
      ),
      pgQuery<{ count: string }>(
        `SELECT count(distinct user_id)::text AS count FROM entitlements
          WHERE kind='plan' AND value='premium' AND metadata->>'source' = 'premium_trial_0_5'
            AND (expires_at IS NULL OR expires_at > now())`
      ),
      pgQuery<{ count: string }>(`SELECT count(*)::text AS count FROM public.profiles`),
      // Phase 4.3: مشتركو Pro/Ultra من subscription_activations غير الملغاة (distinct user_id لكل خطة)
      pgQuery<{ plan_key: string; users: string }>(
        `SELECT plan_key, count(distinct user_id)::text AS users FROM public.subscription_activations
          WHERE revoked_at IS NULL GROUP BY plan_key`
      ),
      // Phase 4.3: ملفات اليوم / آخر 7 أيام (files.created_at مؤكد في الـDB الحية)
      pgQuery<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.files WHERE created_at >= now() - interval '1 day'`
      ),
      pgQuery<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.files WHERE created_at >= now() - interval '7 days'`
      ),
      // Phase 4.3: رسائل اليوم (ai_credit_ledger reason='ai_reserve' — نفس مصدر ai-overview.ts)
      pgQuery<{ count: string }>(
        `SELECT count(*)::text AS count FROM public.ai_credit_ledger
          WHERE reason='ai_reserve' AND created_at >= now() - interval '1 day'`
      ),
    ]);

    // بديل رسائل اليوم من ai_operations لو ai_credit_ledger غير متاح (جدول مفقود/فارغ الاستعلام يفشل)
    let messagesToday: number | null = null;
    let messagesTodaySource: "ai_credit_ledger" | "ai_operations" | null = null;
    if (ledgerRes.length > 0 && ledgerRes[0]?.count !== undefined) {
      messagesToday = parseInt(ledgerRes[0].count, 10);
      messagesTodaySource = "ai_credit_ledger";
    } else {
      try {
        const opsRes = await pgQuery<{ count: string }>(
          `SELECT count(*)::text AS count FROM public.ai_operations
            WHERE created_at >= now() - interval '1 day'`
        );
        if (opsRes.length > 0 && opsRes[0]?.count !== undefined) {
          messagesToday = parseInt(opsRes[0].count, 10);
          messagesTodaySource = "ai_operations";
        }
      } catch {
        messagesToday = null;
        messagesTodaySource = null;
      }
    }

    const activationsByPlan = (actRes || []).map((r) => ({
      plan_key: r.plan_key,
      users: parseInt(r.users || "0", 10),
    }));
    const topPlan = activationsByPlan.length > 0
      ? activationsByPlan.reduce((a, b) => (b.users > a.users ? b : a))
      : null;

    // profiles مالهوش DDL في الريبو (بيتعمل خارج المشروع)، فعمود created_at
    // مش مضمون. بنسأل information_schema الأول عشان الاستعلام ما يقعش.
    const [colRes] = await pgQuery<{ has: boolean }>(
      `SELECT exists(
         SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='profiles' AND column_name='created_at'
       ) AS has`
    );
    const hasCreatedAt = !!colRes?.has;
    const timeCol = hasCreatedAt ? "p.created_at::text" : "NULL";
    const orderClause = hasCreatedAt ? "ORDER BY p.created_at DESC NULLS LAST" : "ORDER BY p.id";

    const recent = await pgQuery<RecentSignup>(
      `SELECT p.id::text AS id,
              p.email,
              p.display_name,
              ${timeCol} AS created_at,
              exists(
                SELECT 1 FROM entitlements e
                 WHERE e.user_id = p.id AND e.kind='plan' AND e.value='premium'
                   AND (e.expires_at IS NULL OR e.expires_at > now())
              ) AS is_premium,
              exists(
                SELECT 1 FROM entitlements e
                 WHERE e.user_id = p.id AND e.kind='plan' AND e.value='premium'
                   AND e.metadata->>'source' = 'premium_trial_0_5'
                   AND (e.expires_at IS NULL OR e.expires_at > now())
              ) AS on_trial
         FROM public.profiles p
         ${orderClause}
        LIMIT 5`
    );

    return {
      data: {
        premium: parseInt(premRes[0]?.count || "0", 10),
        trials: parseInt(trialRes[0]?.count || "0", 10),
        recent: recent || [],
        totalUsers: usersRes[0]?.count ? parseInt(usersRes[0].count, 10) : null,
        activationsByPlan,
        filesToday: filesTodayRes[0]?.count !== undefined ? parseInt(filesTodayRes[0].count, 10) : null,
        filesWeek: filesWeekRes[0]?.count !== undefined ? parseInt(filesWeekRes[0].count, 10) : null,
        messagesToday,
        messagesTodaySource,
        topPlan,
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: (e as { message?: string })?.message || "تعذر جلب إحصائيات الاشتراكات" };
  }
}
