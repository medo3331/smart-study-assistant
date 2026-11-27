// lib/engagement/features.ts
//
// P1-B2.2 — Feature Discovery (server-side writer/reader).
//
// ⚠️ **مين بيكتب الحالة؟**
//   • `introduced` : السيرفر (لما يعرض التعريف) — عبر دالة DB.
//   • `tried`/`adopted`: **بتتشتق في الـDB** من `engagement_events` — مش
//     من أي طلب عميل. العميل مش بيقدر يدّعي إنه "جرّب" الميزة.
//   • الكتابة عن طريق service_role فقط؛ المستخدم بيقرأ حالته بس.
//
// ⚠️ ممنوع في هذه المرحلة: Coins، XP، Missions، Push.

import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";

import {
  FEATURE_SPECS,
  type FeatureDiscoveryState,
  type FeatureKey,
} from "./feature-contract";
import {
  ENGAGEMENT_EVENT_TYPES,
  recordEngagementEvent,
} from "./events";

export type FeatureDiscoverySnapshot = {
  featureKey: FeatureKey;
  label: string;
  route: string | null;
  availability: string;
  state: FeatureDiscoveryState;
  dismissCount: number;
  discoveryCopy: string | null;
  tipCopy: string | null;
};

/**
 * يقرأ حالة اكتشاف ميزة واحدة لمستخدم.
 * best-effort: أي فشل ⇒undiscovered (ومفيش exception للواجهة).
 */
export async function getFeatureDiscoveryState(
  userId: string,
  featureKey: FeatureKey,
): Promise<FeatureDiscoverySnapshot | null> {
  const spec = FEATURE_SPECS[featureKey];
  if (!spec) return null;

  try {
    const admin = createServiceClient();
    const { data, error } = await admin.rpc("get_feature_discovery_state", {
      p_user_id: userId,
      p_feature_key: featureKey,
    });
    if (error || !data) return null;

    const payload = data as Record<string, unknown>;
    const state = payload.state;
    return {
      featureKey,
      label: typeof payload.label === "string" ? payload.label : spec.label,
      route: typeof payload.route === "string" ? payload.route : spec.route,
      availability:
        typeof payload.availability === "string" ? payload.availability : spec.availability,
      state:
        state === "introduced" || state === "tried" || state === "adopted"
          ? state
          : "undiscovered",
      dismissCount:
        typeof payload.dismiss_count === "number" ? payload.dismiss_count : 0,
      discoveryCopy:
        typeof payload.discovery_copy === "string" ? payload.discovery_copy : spec.discoveryCopy,
      tipCopy: typeof payload.tip_copy === "string" ? payload.tip_copy : spec.tipCopy,
    };
  } catch {
    return null;
  }
}

/**
 * يسجّل ظهور التعريف (introduced) لمستخدم.
 * السيرفر فقط — وبيتقيّد بالكتالوج (ميزة قابلة للاكتشاف فقط).
 */
export async function recordFeatureIntroduction(
  userId: string,
  featureKey: FeatureKey,
  surface: string,
): Promise<FeatureDiscoveryState | null> {
  try {
    const admin = createServiceClient();
    const { data, error } = await admin.rpc("record_feature_introduction", {
      p_user_id: userId,
      p_feature_key: featureKey,
      p_surface: surface.slice(0, 60),
    });
    if (error || !data) return null;
    const payload = data as { state?: string };
    const state = payload.state;
    const resolved =
      state === "introduced" || state === "tried" || state === "adopted"
        ? state
        : "introduced";

    // حدث موثّق (server) إن التعريف ظهر — عشان السجل يبقى مرجع.
    void recordEngagementEvent({
      type: ENGAGEMENT_EVENT_TYPES.FEATURE_INTRODUCED,
      sourceId: `${featureKey}:${surface}`.slice(0, 200),
      userId,
      metadata: { surface: surface.slice(0, 60) },
    }).catch(() => undefined);

    return resolved;
  } catch {
    return null;
  }
}

/**
 * يحدّث حالة الاكتشاف (tried/adopted) من الأحداث الموثّقة.
 * ملاحظة: الحالة بيتشارك من الـDB مش من المُدخل.
 */
export async function refreshFeatureDiscoveryState(
  userId: string,
  featureKey: FeatureKey,
): Promise<FeatureDiscoveryState | null> {
  try {
    const admin = createServiceClient();
    const { data, error } = await admin.rpc("refresh_feature_discovery_state", {
      p_user_id: userId,
      p_feature_key: featureKey,
    });
    if (error || !data) return null;
    const payload = data as {
      state?: string;
      changed?: boolean;
      active_days?: number;
      adoption_min_days?: number;
    };
    const state = payload.state;
    const resolved =
      state === "introduced" || state === "tried" || state === "adopted"
        ? state
        : "undiscovered";

    // التبنّي: بيطلع مرة واحدة بس (idempotency من Unique في الجدول).
    if (resolved === "adopted" && payload.changed === true) {
      void recordEngagementEvent({
        type: ENGAGEMENT_EVENT_TYPES.FEATURE_ADOPTED,
        sourceId: featureKey,
        userId,
        metadata: {
          feature: featureKey,
          active_days: payload.active_days ?? 0,
          adoption_min_days: payload.adoption_min_days ?? 0,
        },
      }).catch(() => undefined);
    }

    return resolved;
  } catch {
    return null;
  }
}
