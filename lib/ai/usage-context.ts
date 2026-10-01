/**
 * 🔗 سياق الطلب المنطقي للـ shadow accounting — Phase 5-C3
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **دي حدود الـ logical request، مش الـ provider attempt.**
 *
 *   الـ boundary الحقيقي للـ usage هو **محاولة المزوّد الفعلية** (في
 *   `routing.ts`)، لكن **هوية** الطلب (المفتاح والمعرّف) بتتولّد هنا —
 *   **مرة واحدة** لكل طلب منطقي، وتتنقّل معاه لكل المحاولات.
 *
 *   ⚠️ الفرق ده هو الدرس من C2.1: لو الهوية اتولّدت جوه المسجّل أو جوه
 *     الراوتر، كل attempt هياخد هوية جديدة والـ dedupe يموت. هنا بنولّدها
 *     **مرة واحدة عند حدّ الطلب** وبنمرّرها لأسفل.
 *
 * ═══ ليه `resolveUsageRequestContext(request)` بياخد `Request` ═══
 *   `runAiTask` و `AIService.generate` **مالهمش وصول للـ Request** — وده
 *   متعمد، لأن إعادة بناء `Request` من داخل الـ services حاجة غلط. فالسياق
 *   **بيتولّد عند الـ route** (اللي معاه `Request` فعلاً) وبيتنزّل
 *   ببرده عبر الـ arguments. من غيره، المسجّل بيشتغل بس مش بيسجّل.
 *
 * ═══ شفافية المصدر ═══
 *   `source` بيقول: المفتاح جاي من الكلاينت ولا اتولّد على السيرفر.
 *   مهم للتحليل: مفتاح السيرفر بيحمي من إعادة المحاولة **داخل** الطلب،
 *   بس **مش** من retry عبر HTTP requests مختلفة (طلب جديد = UUID جديد).
 *   الحماية الحقيقية من double-click محتاجة مفتاح من الكلاينت.
 *
 *   ⚠️ `source` **مافيش لازم يتخزّن**. لو اتخزّن وقِرن مع مفتاح مختلف،
 *      التحليل هيتلخبط. القرار ده متأجّل لphase تحليل البيانات.
 */

/* ═══════════════════════════ الأنواع ═══════════════════════════ */

/** هوية الطلب المنطقي — بتتنقّل معاه لكل provider attempts. */
export type UsageRequestContext = {
  /** UUID واحد ثابت للطلب كله — بيربط الـ attempts ببعض. */
  operationId: string;
  /** معرّف التفرّد — ثابت للطلب كله. */
  idempotencyKey: string;
  /** المفتاح جاي من الكلاينت ولّا اتولّد على السيرفر. */
  source: "client" | "server";
};

/**
 * السياق المارّ للراوتر.
 *
 * 🧭 `operationId` / `idempotencyKey` / `source` جواها **بالضرورة** —
 *   دي هوية الطلب اللي اتولّدت عند حدّه. `userId` منفصل لأنه بييجي من
 *   الجلسة مش من الـ header، وممكن يبقى `null` لزائر.
 */
export type AiUsageContext = UsageRequestContext & {
  userId?: string | null;
  /**
   * 🏷️ **الفيشر الدلالي** — بيعرفها الـ route، مش الراوتر.
   *
   * ⚠️ **مش route name:** الـ feature بيوصف الوظيفة (إيه الـ AI بيعمل).
   *   اللي جوه `AiTaskType` هو **الورشة التقنية**. المسارات اللي بتنادي
   *   نفس الـ task بأهداف مختلفة محتاجة feature مستقل — عشان متخلطش
   *   في التحليل.
   */
  feature?: string;
  /** تفاصيل تشخيص إضافية بتتنقفل مع السطر (زي `feature="goal"`). */
  diagnostics?: Record<string, unknown>;
};

/** أقصى طول مقبول لمفتاح الـ header (يطابق حدّ C2). */
const MAX_KEY_CHARS = 200;

/* ═══════════════════════ توليد المعرّفات ═══════════════════════ */

/**
 * UUID بمعرّف موروث من `ai-credit-guard.ts` (نفس النمط بالظبط).
 *
 * 🧭 **ليه مش `import { randomUUID } from "node:crypto"`؟** لأن `node:crypto`
 *   بيقصّي حدّ الـ Edge runtime. الملف ده بيتشارك مع أكواد الـ routes
 *   اللي ممكن تتحوّل لـ Edge بعدين. `crypto` هنا **Web Crypto** — متاح
 *   في Node 19+ وفي Edge، فمافيش كسر في أي runtime.
 *
 * ⚠️ الـ fallback مالوش تأثير أمني: ده **معرّف تتبّع داخلي** مش
 *   token ولا مفتاح — التصادم المتصادف عليه مستحيل عمليًا.
 */
function serverRequestId(): string {
  try {
    if (
      typeof crypto !== "undefined" &&
      typeof (crypto as unknown as { randomUUID?: () => string }).randomUUID === "function"
    ) {
      return (crypto as unknown as { randomUUID: () => string }).randomUUID!();
    }
  } catch {
    /* المتصفح/البيئة مافيشاش Web Crypto — بنكمل للـ fallback. */
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ═══════════ قرار مثبّت لـ C4 (مرجع فقط) ═══════════ */

/**
 * 📌 **قرار C4 المثبّت — تصنيف الـ `feature` لمسارات الـ goal.**
 *
 * الخمسة مسارات دي (`/api/baccalaureate/goal` … `/api/university/goal`)
 * كلهم بينادوا `runAiTask("chat", …)`، فلوخدنا الـ `taskId` كـ feature
 * كان كلهم هيبانوا باسم `"chat"` — **نفس اسم** `/api/chat` تمامًا، ومش
 * هينفع نفرّق بينهم في التحليل.
 *
 * ✅ **القرار:**
 *
 *     feature            = "goal"                       // دلالي: الوظيفة
 *     metadata.goalLevel = "baccalaureate" | "university"
 *                        | "preparatory"   | "primary"
 *                        | "secondary"                      // بُعد تحليلي
 *
 * ليه مش `goal_baccalaureate` …؟ لأن الـ feature بيوصف **الوظيفة**
 * (chat / goal / tutor / quiz)، والمستوى مجرد **بُعد** جواها. كده C5
 * بيقرا `feature` كـ taxonomy نضيفة وبيقصّي على `goalLevel` من غير ما
 * نوسّع الـ taxonomy بخمس قيم جديدة ولا نخترع نظام موازي.
 *
 * ⚠️ **لسه مش متنفّذ** — توثيق للـ C4 الجاي. المسارات الخمسة لسه
 *   عارفيها زي ما هي.
 *
 * 💡 **لو اتكشف بعدين** إن المشروع عنده taxonomy تاني مسمّى `goal`
 *    بالفعل، نستخدمه بدل ما نضيف نظام جديد.
 */
/* ═══════════════════════ حلّ السياق ═══════════════════════ */

/**
 * 🔑 يحلّ هوية الطلب المنطقي من `Request` واحد.
 *
 * ═══ عقد الـ `Idempotency-Key` ═══
 *   header موجود → بنستخدمه (بعد trim + تحقق).
 *   header مش موجود → **UUID واحد** يتولّد هنا، **مرة واحدة**.
 *
 *   ⚠️ المفتاح بيتولّد **في الاستدعاء ده بس**. لو حد ناداه تاني هيطلع
 *      UUID تاني — وده **صح**: طلب HTTP جديد = طلب منطقي جديد.
 *
 * @param request طلب HTTP قادم من الـ route.
 * @param userId المستخدم من الجلسة، أو `null` للزائر.
 * @returns سياق واحد يُمرَّر لكل الـ provider attempts في الطلب ده.
 */
export function resolveUsageRequestContext(
  request: Request,
  userId?: string | null,
  init?: Pick<AiUsageContext, "feature" | "diagnostics">,
): AiUsageContext {
  // 🟢 عملية واحدة للطلب كله — مش لكل attempt.
  const operationId = serverRequestId();

  const header = request.headers?.get("Idempotency-Key");
  const trimmed = typeof header === "string" ? header.trim() : "";
  const isUsable = trimmed !== "" && trimmed.length <= MAX_KEY_CHARS;

  return {
    operationId,
    idempotencyKey: isUsable ? trimmed : serverRequestId(),
    source: isUsable ? "client" : "server",
    userId: userId ?? null,
    ...(init?.feature ? { feature: init.feature } : {}),
    ...(init?.diagnostics ? { diagnostics: init.diagnostics } : {}),
  };
}

/**
 * 🛠️ بناء سياق من قيم جاهزة (مناسب للاختبارات والمسارات اللي مالها
 *   `Request` زي المهام الداخلية).
 *
 * ⚠️ دي **مفيدة للاختبارات فقط**. في الإنتاج، `resolveUsageRequestContext`
 *   هي اللي المفروض تحدّد الهوية عند حدّ الطلب الحقيقي.
 */
export function createUsageContextForTests(init?: Partial<AiUsageContext>): AiUsageContext {
  return {
    operationId: init?.operationId ?? serverRequestId(),
    idempotencyKey: init?.idempotencyKey ?? serverRequestId(),
    source: init?.source ?? "server",
    userId: init?.userId ?? null,
  };
}
