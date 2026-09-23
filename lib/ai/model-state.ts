/**
 * 🗄️ حالة الموديلات وقت التشغيل من الداتابيز (Phase 2 — /admin/models حقيقي).
 *
 * الفجوة الأصلية: زرار التفعيل/التعطيل في لوحة الأدمن كان بيكتب في جدول
 * ai_models، بس **مفيش أي قارئ للجدول ده وقت التشغيل** — الراوتر كان بيقرأ
 * MODEL_REGISTRY الثابت بس، فالتبديل كان شكلي التأثير.
 *
 * التصميم:
 *   - كاش process-wide بـTTL ٣٠ ثانية (single-flight) عشان منضربش الداتابيز
 *     مع كل رسالة شات. التحديث بيتم من نقاط الدخول (chat / unified-ai) —
 *     وأي راوت تاني بيستفيد من نفس الكاش تلقائيًا جوه نافذة الـTTL.
 *   - fail-open موثق: لو جدول ai_models مش متنفذ بعد (migration ناقصة) أو
 *     قراءته فشلت، بنكمّل بقيم MODEL_REGISTRY الثابتة — الـAI ميقعش أبدًا
 *     بسبب ميزة إدارية. الحالة دي بتتعرض بصراحة في صفحة الأدمن.
 *   - usedToday بيتحسب من ai_operations (status=completed منذ منتصف الليل UTC)
 *     وبيفرض daily_limit لكل موديل — بلوغ الحد بيستبعد الموديل من الاختيار
 *     لحد اليوم التاني، زي enabled=false بالظبط.
 *
 * Server-only — بيستخدم service_role (بيتجاوز RLS)، متتصدرش للمتصفح أبدًا.
 */

import { createServiceClient } from "@/lib/supabase/admin";

export interface RuntimeModelState {
  enabled: boolean;
  /** أولوية الداتابيز — null = استخدم قيمة السجل الثابت. */
  priority: number | null;
  /** حد الاستخدام اليومي — null = بلا حد. */
  dailyLimit: number | null;
  /** عمليات ناجحة اليوم (UTC) من ai_operations. */
  usedToday: number;
}

const TTL_MS = 30_000;

let cache: Map<string, RuntimeModelState> | null = null;
let refreshedAt = 0;
let inflight: Promise<boolean> | null = null;

/**
 * تحديث الكاش من الداتابيز (idempotent + single-flight + TTL).
 * بترجع true لو عندنا حالة DB صالحة بعد النداء.
 */
export async function refreshModelStateCache(force = false): Promise<boolean> {
  if (!force && cache && Date.now() - refreshedAt < TTL_MS) return true;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const supabase = createServiceClient();
      const { data: rows, error } = await supabase
        .from("ai_models")
        .select("model_id, enabled, priority, daily_limit");
      if (error) throw error;

      const next = new Map<string, RuntimeModelState>();
      for (const r of rows ?? []) {
        next.set(String(r.model_id), {
          enabled: r.enabled !== false,
          priority: typeof r.priority === "number" ? r.priority : null,
          dailyLimit: typeof r.daily_limit === "number" ? r.daily_limit : null,
          usedToday: 0,
        });
      }

      // استهلاك اليوم لكل موديل — query واحدة وعدّ في الذاكرة
      const sinceUtcMidnight = new Date();
      sinceUtcMidnight.setUTCHours(0, 0, 0, 0);
      const { data: ops, error: opsErr } = await supabase
        .from("ai_operations")
        .select("model")
        .eq("status", "completed")
        .gte("created_at", sinceUtcMidnight.toISOString())
        .limit(10000);
      if (opsErr) {
        console.warn("[model-state] ai_operations read failed — usedToday stays 0:", opsErr.message);
      } else {
        for (const op of ops ?? []) {
          const st = next.get(String(op.model));
          if (st) st.usedToday += 1;
        }
      }

      cache = next;
      refreshedAt = Date.now();
      return true;
    } catch (e) {
      // fail-open موثق: نحتفظ بآخر حالة صالحة (أو السجل الثابت لو مفيش)
      console.warn("[model-state] refresh failed — keeping previous state / registry fallback:", e);
      return cache !== null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** قراءة sync من الكاش — undefined = مفيش حالة DB للموديل ده. */
export function getRuntimeModelState(modelId: string): RuntimeModelState | undefined {
  return cache?.get(modelId);
}

/** لقطة لكل الحالات — لعرض صفحة الأدمن. null = الداتابيز غير متاحة. */
export function getAllRuntimeModelStates(): ReadonlyMap<string, RuntimeModelState> | null {
  return cache;
}

export function modelStateAvailable(): boolean {
  return cache !== null;
}

/**
 * هل الموديل متاح وقت التشغيل؟
 * - مفيش صف في الكاش (كاش فاضي / الجدول مش موجود / موديل جديد اتضاف للكود) →
 *   نكمّل بقيمة السجل الثابت (fail-open موثق أعلى الملف).
 * - enabled=false في الداتابيز → مستبعد فورًا من أي اختيار.
 * - usedToday >= daily_limit → مستبعد لحد منتصف الليل UTC الجاي.
 */
export function isModelRuntimeEnabled(modelId: string, registryEnabled: boolean): boolean {
  const st = cache?.get(modelId);
  if (!st) return registryEnabled;
  if (!st.enabled) return false;
  if (st.dailyLimit !== null && st.usedToday >= st.dailyLimit) return false;
  return true;
}

/** أولوية الترتيب الفعلية — قيمة الداتابيز (لو موجودة) بتغلّب قيمة السجل. */
export function getRuntimePriority(modelId: string, registryPriority: number): number {
  return cache?.get(modelId)?.priority ?? registryPriority;
}
