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
}

export async function getPlatformOverview(): Promise<{ data: PlatformOverview | null; error: string | null }> {
  try {
    const [premRes, trialRes, usersRes] = await Promise.all([
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
    ]);

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
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: (e as { message?: string })?.message || "تعذر جلب إحصائيات الاشتراكات" };
  }
}
