/**
 * ⏱️ جدولة تسجيل الاستخدام بعد الرد — Phase 5-C3.2 (durability fix)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **السبب اللي الكود ده اتعمل:**
 *
 *   في C3 كان التسجيل `void recordAiUsage(...)` — أي **fire-and-forget**
 *   عادي. ده **مش مضمون** إنه يخلص: بعد ما الـ response يتبعت، الـ
 *   invocation على Vercel ممكن يتجمّد أو يتقفل، والـ upsert بتاع Supabase
 *   ممكن ما يكملش. النتيجة: المستخدم أخد ردّه، بس الـ shadow event ضاع.
 *   وC5 هيبني قرارات على البيانات دي — فالنقصان ده مش cosmetic.
 *
 *   الحل الرسمي: `after()` من `next/server` — **مخصوص** للأعمال التي المفصوك تحصل
 *   تحصل بعد الـ response (logging / analytics) بالظبط.
 *
 * ═══ ليه `after()` بيشتغل من هنا جوّه الـ راوتر ═══
 *   `after()` بيعتمد على `AsyncLocalStorage` جوّه Next. الـ store ده بينتقل
 *   معاه عبر **كل** الـ async call chain. واتأكدنا إن
 *   `withConcurrencyLimit` (اللي ملفوف حوالين `completeChatInner`) مجرد
 *   promises — مافيش worker ولا timer بيقطع السياق.
 *
 *   ✅ متحقّق بفعل اختبار حقيقي، مش افتراض: نفس البنية (روت → limiter → أعمق نقطة)
 *      رجّعت نفس الـ store في كل المستويات.
 *
 * ═══ ليه في fallback ═══
 *   `after()` **بيرمي استثناء** لو اتنادى بره request scope (زي unit tests
 *   أو أي شغل خلفي). بنمسك الاستثناء ده ونشغّل النداء مباشرة عشان نكسرش
 *   الاختبارات ونفضل صالحين في أي سياق.
 *
 * ═══ مفيش latency على المستخدم ═══
 *   الـ callback **مش** بيتنتظر. الرد بيروح للمستخدم الأول، وبعدين بينفّذ
 *   الـ callback. يعني صفر زيادة في وقت الرد.
 */

/**
 * 📬 يجدول الكتابة في shadow بحيث تكمل **بعد** ما الرد يتبعت.
 *
 * ⚠️ الـ callback لازم يرجّع Promise — `after` بينتظره فعلاً، وده اللي
 *   بيضمن إن الكتابة خلص قبل ما يتقفل العتود.
 *
 * @param run عملية الحفظ (best-effort، ماينفعش ترمي).
 */
/**
 * 💾 يحفظ الـ usage event ويح guarantees إنه **خلص فعلاً** قبل ما الدالة ترجع.
 *
 * ═══ ليه بقينا نـ await بدل `after()` ═══
 *
 * كان المسجّل بيستعمل `after()` من `next/server` عشان ميضيفش latency
 * للرد. في التطوير ده اشتغل. **في الإنتاج وقف التسجيل بعد 5 دقايق من أول
 * deploy** والـ `max(created_at)` اتجمّد — يعني الـ callbacks كانت بتتسجّل
 * ومش بتتنفّذ.
 *
 * فيه سببين مرجّحين، والاتنين بيتحلوا بـ await:
 *   1) الـ instance يتجمّد بعد ما الـ response يتبعت، والـ callback لسه
 *      مجدول.
 *   2) `after()` بيتنادى من جوه callback **بعد** ما الـ stream يخلص
 *      (زي `onFinish`) — يعني بعد ما الـ request scope انتهى. ساعتها
 *      `after()` بيرمي، والكود كان بيروح للـ `void run()` اللي جوا
 *      الـ `catch`، والـ function بتتقفل قبل ما الـ insert يخلص.
 *
 * ⚠️ الـ `try/catch` القديم كان بيغطي **التسجيل بس**، مش التنفيذ. فلو
 *   `after()` قَبِل الـ callback ومينفّذش بعد كده، مافيش حد ياخد يعرف.
 *
 * ═══ الثمن ═══
 * سطر INSERT واحد بياخد أقل من 100ms، والـ AI call أصلاً بياخد ثواني.
 * ده أحسن بكتير من صفر latency مقابل صفر بيانات.
 *
 * ⚠️ الخطأ **بيتسجّل** بـ console.error عشان يبان في Vercel logs — قبل
 *   الكود ده كان `.catch(() => {})` فصامت تمامًا، فلو الـ insert كان
 *   بيفشل بسبب RLS/constraint/env مت(verbose) كنا مش هعرف خالص.
 */
export async function scheduleUsageRecording(run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    // 🟥 لازم يبان في logs: تسجيل فاشل = hole في shadow data.
    console.error("[ai-usage] record failed:", error);
  }
}