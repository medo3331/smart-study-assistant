/**
 * 🧾 تسجيل استهلاك الـ AI — Phase 5-C2 (SHADOW ONLY)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **قراءة الملف ده قبل أي استخدام:**
 *
 *   🔴 ده **مش** نظام تحصيل. مافيش:
 *      - حجز credits
 *      - تعديل `ai_credit_ledger`
 *      - فحص أو فرض أي limit
 *      - منع أي طلب
 *      - تغيير أي صلاحية
 *      - قرار تسعير
 *
 *   ✅ ده **مسجّل شفاف** (shadow): بيكتب سطر في `ai_usage_events` عن كل
 *   محاولة نداء AI **فعلية**، عشان نقدر نقرا الاستخدام **الحقيقي** قبل
 *   ما نقرر أي pricing في Phase 5-D.
 *
 * ═══ القاعدة الذهبية: مفيش path يفشل ═══
 *   لو الـ insert فشل، أو الـ DB مش متاح، أو الـ metadata فيها حاجة غلط،
 *   أو حصل استثناء في أي نقطة — **الطلب الأصلي لازم ينجح**. أي فشل هنا
 *   بيتسجّل في اللوج بس. دي النقطة اللي بتفرّق بين "نقيس" و"نمنع"،
 *   والمرحلة دي **نقيس بس**.
 *
 * ═══ ليه الـ helper ماشي معاه عميل DB ═══
 *   `lib/ai/routing.ts` (حيث الـ provider attempts بتحصل) **مالوش وصول
 *   لقاعدة البيانات خالص**. فلو استلمنا العميل من المستدعي، الـ C3/C4
 *   هيضطروا يبنوا عميل جديد جوه حلقة الـ retry — غلط. عشان كده الـ
 *   helper بيجيب عميل **service-role** بنفسه ويخزّنه (نفس نمط
 *   `lib/ai/quota-check.ts`).
 *
 * ═══ ليه service-role ═══
 *   جدول `ai_usage_events` مافيش فيه policy للإدراج عمدًا (المرحلة
 *   5-C1)، فالكتابة لازم تتخطّى RLS. وده **مناسب**: السطر ده بيانات
 *   تشغيلية يضيفها **السيرفر** فقط، ومحدش من المتصفح بيقدر يكتب.
 *
 * ═══ ليه upsert مش insert ═══
 *   الـ migration بتعرّف قيد التفرّد على
 *   `(user_id, idempotency_key, attempt_no)`. لو السيرفر أعاد إرسال نفس
 *   السطر (network glitch / إعادة محاولة)، `insert` العادي هيرجع error
 *   ونتعاملها كـ "فشل DB" وهو **مش فشل** — السطر موجود بالفعل.
 *   `ignoreDuplicates` بيحوّل التعارض لـ "اتسجّل قبل كده" بهدوء.
 *
 * ⚠️ حدود الـ idempotency مع الزوار: في Postgres `NULL != NULL`، فسطرين
 *   بـ `user_id = NULL` **مش** بيتعارضوا. يعني: للمستخدم المسجّل الـ
 *   ضمان كامل، وللزائر **مافيش ضمان** — ومش بنزعم إن فيه.
 */

import { createServiceClient, isServiceKeyConfigured } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

/* ═══════════════════════════ الأنواع ═══════════════════════════ */

/**
 * حالة المحاولة — مطابقة لـ CHECK constraint في `db/16-ai-usage-events.sql`.
 *
 * ⚠️ **ممنوع نضيف قيم من عندنا**: الـ CHECK في القاعدة بيرفض أي قيمة
 *   بره دي، فلو زادوا لازم الـ migration يتعدّل مش الكود ده.
 */
export type UsageStatus =
  | "completed"
  | "failed_no_response"
  | "failed_after_response"
  | "error"
  | "skipped";

/** مدخل تسجيل محاولة واحدة. */
export type UsageEventInput = {
  /** `null` = زائر (زي /api/demo). المستخدم المسجّل = uuid بتاعه. */
  userId: string | null;
  /** اسم الميزة: `chat` / `lecture_summary` / `lecture_mcq` / `demo` ... */
  feature: string;
  /**
   * 🔗 معرّف الطلب المنطقي الواحد — **بييجي من المستدعي** وبيبقى
   *   **نفسه** لكل المحاولات. `attempt_no` هو اللي بيفرّق بينها.
   *   متولّدش واحد جوه: لو كل محاولة عملت id جديد، هنمسك إن
   *   fallback+jوه طلب واحد بقى N عمليات.
   */
  operationId?: string | null;
  /**
   * 🔑 مفتاح الـ idempotency — **إجباري، والـ helper مش بيولّده أبدًا**.
   *
   * ⚠️ **ليه إجباري؟** العمود NOT NULL في القاعدة، بس ده مش السبب
   *   الحقيقي. السبب: **الـ helper مش حدّ الـ logical request** — مافيشو
   *   أي طريقة يعرف "الطلب ده اتحسب قبل كده ولا لأ". فلو ولّد مفتاح من
   *   جوه، كل attempt هياخد مفتاح مختلف والـ constraint هيفضل بلا فايدة
   *   والـ dedupe مش هيشتغل **خالص**.
   *
   *   ⚠️ أول نسخة من الملف كانت بتولّد
   *   `server:${Date.now()}-${Math.random()...}` كـ fallback — وده كان
   *   **غلط معماري**: بيخفي programmer error ويكسر العقد. اتشال بالكامل.
   *
   *   🧭 **مين المسؤول عن الـ boundary:** C3 هيقدّم
   *   `resolveUsageRequestContext(request)` بتقرأ `Idempotency-Key` من
   *   الـ header، أو تولّد `crypto.randomUUID()` **مرة واحدة** لو
   *   الـ header مش موجود، وتثبّتها لكل الـ attempts.
   *
   *   ⚠️ ملاحظة: المفتاح المولّد على السيرفر بيحمي من إعادة المحاولة
   *   **داخل** الطلب، بس **مش** من retry عبر HTTP requests مختلفة —
   *   لأن request جديد = UUID جديد. الحماية الحقيقية من double-click
   *   محتاجة مفتاح من الكلاينت (phase لاحقة).
   */
  idempotencyKey: string;
  /** 0 = المحاولة الأولى، 1 = fallback، 2 = تاني fallback ... */
  attemptNo?: number;
  provider?: string | null;
  model?: string | null;
  status?: UsageStatus;
  /**
   * ⭐ الوحدات. الافتراضي **1** لكل محاولة فعلية.
   *   ⚠️ `/api/demo` = **0** — اتفقنا إنه ما يدخلش billing في المرحلة دي.
   *   التحقق من الـ CHECK: `units >= 0`، فالصفر مسموح.
   */
  units?: number;
  promptTokens?: number | null;
  completionTokens?: number | null;
  latencyMs?: number | null;
  /** تشخيص بس — بيتنضّف قبل الكتابة (انظر `sanitizeMetadata`). */
  metadata?: Record<string, unknown>;
};

/* ═══════════════════════ أدوات ═══════════════════════ */

/** أقصى حجم مسموح للـ metadata بعد التنضيف (حروف). */
const MAX_METADATA_CHARS = 2000;

/** أقصى طول لقيم النص العادية. */
const MAX_TEXT_CHARS = 300;

/**
 * 🔒 يحذف المفاتيح اللي ممكن تكون حسّاسة.
 *
 * ⚠️ **إيه اللي بنمنعه بالظبط:** أي حاجة لو راحت جوه metadata بتتخزّن
 * **في جدول** وتبقى قابلة للقراءة بعدين من الـ Admin. فالبرومبت أو نص
 * المحاضرة أو مفتاح API لو اتسجّلوا بالغلط، ده **تسريب بيانات** مش
 * مجرد metadata غير مرتب.
 *
 * الفلتر **بالاسم** مش بالقيمة: أي مفتاح فيه كلمة من دي بيتشال
 * بالكامل مهما كانت قيمته.
 */
const SENSITIVE_KEY = /prompt|transcript|content|text|message|input|api[-_]?key|secret|token|password|email|phone|name|body|answer|question/i;

/** أقصى عمق نسمح نزوح له — يمنع التركيبات الدائرية/المتضخمة. */
const MAX_METADATA_DEPTH = 3;

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * ينضّف metadata: يحذف المفاتيح الحسّاسة، ويحوّل كل القيم لنص/رقم/بول
 * JSON-safe، وبيقصّ الحجم الأقصى.
 *
 * الغرض: اللي يتخزّن يكون **تشخيص** (HTTP status، reasonCode، attempt
 * index) ومفيش أي محتوى مستخدم أو أسرار.
 */
export function sanitizeMetadata(
  input: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};

  const out: Record<string, unknown> = {};

  // ⚠️ لازم `target` صريح لكل مستوى. أول نسخة كانت بتكتب كل المستويات في
  //   `out` الواحدة، فكان الـ nesting بيتسطّح وحده والحد الأقصى للعمق
  //   بيتجاهَل فعليًا. وبالمناسبة: منطق "ابتلع بدري" في السطر اللي تحت
  //   موجود عمدًا — لو Nested اتعبّر، احتياط إنك تفضل كامل من غيره.
  const walk = (
    obj: Record<string, unknown>,
    depth: number,
    target: Record<string, unknown>,
  ): void => {
    for (const [key, value] of Object.entries(obj)) {
      if (target[key] !== undefined) continue;
      if (SENSITIVE_KEY.test(key)) continue;
      if (value === null || value === undefined) continue;
      // ⛔ حاجز العمق — على **كل** القيم مش الـ objects بس، عشان مافيش
      //    قيمة تقدر تتسلل من عمق أكبر من المطلوب.
      if (depth >= MAX_METADATA_DEPTH) continue;

      if (typeof value === "string") {
        target[key] = truncate(value, MAX_TEXT_CHARS);
      } else if (typeof value === "number") {
        // NaN/Infinity مش JSON-safe — بنستبعدهم بدل ما نكتبهم.
        target[key] = Number.isFinite(value) ? value : null;
      } else if (typeof value === "boolean") {
        target[key] = value;
      } else if (Array.isArray(value)) {
        const list = value
          .slice(0, 20)
          .map((item) =>
            typeof item === "string"
              ? truncate(item, MAX_TEXT_CHARS)
              : typeof item === "number" && Number.isFinite(item)
                ? item
                : typeof item === "boolean"
                  ? item
                  : null,
          )
          .filter((item) => item !== null);
        if (list.length > 0) target[key] = list;
      } else if (typeof value === "object") {
        const nested: Record<string, unknown> = {};
        walk(value as Record<string, unknown>, depth + 1, nested);
        // ⚠️ لو الفرع Nested اتعبّر، مافيش داعي نخسره بالكامل — نخليه `null`
        // عشان شكل الـ JSON يفضل صحيح ونعرف إننا قصّرنا.
        target[key] = Object.keys(nested).length > 0 ? nested : null;
      }
    }
  };

  walk(input, 0, out);

  // قصّ الحجم النهائي — لو زاد، نحتفظ بأول المفاتيح بس.
  const serialized = JSON.stringify(out);
  if (serialized && serialized.length > MAX_METADATA_CHARS) {
    const trimmed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(out)) {
      const candidate = JSON.stringify({ ...trimmed, [key]: value });
      if (candidate.length > MAX_METADATA_CHARS) break;
      trimmed[key] = value;
    }
    return trimmed;
  }
  return out;
}

/* ═══════════════════════ العميل ═══════════════════════ */

/**
 * عميل service-role مخزّن جوه الموديول.
 *
 * ⚠️ **ليه مخزّن:** `routing.ts` بينادي ده جوه حلقة retry لكل محاولة.
 *   إنشاء عميل جديد كل مرة = تكلفة + تسريب اتصالات. فنخزّنه مرة واحدة.
 *
 * ⚠️ **`undefined` مش `null`**: الـ null معناه "اتحاول وفشل"، والـ
 *   undefined معناه "لسه ما اتحاولش أو المفتاح مش متاح" — الاتنين
 *   بيوصّلوا لنفس السلوك (نتخطّى بهدوء) بس التميين بيسهّل التشخيص.
 */
let cachedClient: SupabaseClient | undefined;

/** عميل التسجيل (service-role)، أو undefined لو البيئة ناقصة. */
function getClient(): SupabaseClient | undefined {
  if (cachedClient) return cachedClient;
  if (!isServiceKeyConfigured()) return undefined;
  try {
    cachedClient = createServiceClient();
    return cachedClient;
  } catch (error) {
    console.warn("[usage-accounting] تعذّر إنشاء عميل service-role:", (error as Error).message);
    return undefined;
  }
}

/** ⬇️ للاختبارات فقط: يصفّر العميل المخزّن. */
export function __resetUsageClientForTests(): void {
  cachedClient = undefined;
}

/* ═══════════════════════ التسجيل ═══════════════════════ */

/**
 * 🧾 يسجّل **محاولة نداء AI واحدة** في `public.ai_usage_events`.
 *
 * ═══ الضمانة الأهم: **مش بترمي أبدًا** ═══
 *   الدالة دي جوه مسار طلب المستخدم. أي `throw` هنا = كسر للذكاء
 *   الاصطناعي بسبب فشل القياس. فكل حاجة متغلفة:
 *     - عميل مش متاح       → return
 *     - الـ insert فشل      → log + return
 *     - metadata فيها خطأ   → بننضّفها قبل الكتابة
 *     - استثناء غير متوقع  → catch عام + log
 *
 *   الدالة بترجّع `void` بالتصميم — مافيش حاجة للعامل يستقبلها.
 *
 * @param input تفاصيل المحاولة. `userId` و `feature` و `idempotencyKey`
 *   هم الإجباريون. `idempotencyKey` و `operationId` **لازم** يجوا من
 *   المستدعي — الـ helper مش بيولّد هوية الطلب.
 */
export async function recordAiUsage(input: UsageEventInput): Promise<void> {
  // try واحد على مستوى الدالة كلها: أي خطأ في أي سطر جوّه لازم
  // يختفي بدون ما يوصل لطلب المستخدم.
  try {
    // 🔐 التحقق من الـ inputs — **مافيش أي fallback تلقائي**.
    //
    // ⚠️ السبب إننا بنعمل `throw` جوّه الـ try عمدًا: الـ catch العام
    //   بيروح يعمل log ويرجّع. ده بيبقى نفس "مايكسرش الطلب" بس بيضمن
    //   إن الـ programmer error **يتبين في اللوج** بدل ما السطر يتخسر
    //   صامت (أو الأسوأ: يتسجّل بمفتاح متلخبط فيخلّص الـ shadow data).
    //
    //   مافيش `Date.now()` ولا `Math.random()` ولا `randomUUID()` هنا —
    //   توليد الهوية مسؤولية C3 (logical-request boundary).
    const idempotencyKey = typeof input.idempotencyKey === "string"
      ? input.idempotencyKey.trim()
      : "";
    if (idempotencyKey === "") {
      throw new Error("idempotencyKey مطلوب ومينفعش يبقى فاضي — لازم المستدعي يمرّره.");
    }

    const feature = typeof input.feature === "string" ? input.feature.trim() : "";
    if (feature === "") {
      throw new Error("feature مطلوبة ومينفعش تبقى فاضية.");
    }
    // حماية الطول: البقية النصّية بتتقصّ عند 200 زي ما كانت.

    // ⬇️ العميل بيتجيب **بعد** التحقق: فلو المستدعي نسي يمرّر المفتاح،
    //    عايز الخطأ يظهر في اللوج حتى في بيئة محلية مافيشها service key
    //    (لو جبناه الأول، هنتخطّى صامت والـ bug يتفوّت).
    const client = getClient();
    if (!client) return; // البيئة ناقصة — بنتخطى بهدوء.

    const row = {
      // 🟢 الزائر = NULL (زي /api/demo). مش بنجمع IP ولا cookie من أجله.
      user_id: typeof input.userId === "string" && input.userId !== "" ? input.userId : null,
      operation_id: input.operationId ?? null,
      idempotency_key: idempotencyKey.slice(0, 200),
      attempt_no: Number.isInteger(input.attemptNo) && (input.attemptNo as number) >= 0 ? (input.attemptNo as number) : 0,
      feature: feature.slice(0, 200),
      provider: input.provider ?? null,
      model: input.model ?? null,
      status: (input.status ?? "completed") as UsageStatus,
      // ⭐ الافتراضي 1 لكل محاولة فعلية. /api/demo بيبعت 0 صراحةً.
      units: Number.isFinite(input.units) ? Math.max(0, Math.trunc(input.units as number)) : 1,
      prompt_tokens: Number.isFinite(input.promptTokens) ? input.promptTokens : null,
      completion_tokens: Number.isFinite(input.completionTokens) ? input.completionTokens : null,
      latency_ms: Number.isFinite(input.latencyMs) ? input.latencyMs : null,
      metadata: sanitizeMetadata(input.metadata),
      created_at: new Date().toISOString(),
    };

    const { error } = await client
      .from("ai_usage_events")
      // ⚠️ القيد (user_id, idempotency_key, attempt_no): لو السطر ده
      //   اتسجّل قبل كده، `ignoreDuplicates` بيخلي العملية **نجاح صامت**
      //   مش error. ده المقصود: "اتسجّل قبل كده" مش "فشل".
      .upsert(row, {
        onConflict: "user_id,idempotency_key,attempt_no",
        ignoreDuplicates: true,
      });

    if (error) {
      // ⚠️ بنطبع الكود والرسالة بس — مافيش محتوى مستخدم في اللوج.
      console.warn(
        `[usage-accounting] تعذّر تسجيل الاستخدام [${error.code ?? "no-code"}]: ${error.message ?? ""}`,
      );
    }
  } catch (error) {
    // 🛡️ خط الحاجز الأخير: أي حاجة اتوقعت هنا ماينفعش توصل للمستخدم.
    console.warn("[usage-accounting] خطأ غير متوقع أثناء التسجيل:", (error as Error).message);
  }
}