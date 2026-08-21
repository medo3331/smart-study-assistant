import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * طبقة حماية موحّدة لراوتات الـ API.
 *
 * كل الراوتات عندنا POST بس، والـ POST مش بيتكاش أبداً في Next،
 * فاستخدام cookies() جوه createClient() هنا آمن ومش بيسبب مشاكل prerender.
 */

/** شكل الخطأ اللي كل راوت بيرجّعه — بيختلف من راوت للتاني فبنمرّره. */
export type ErrorShape = "message" | "flat" | "success";

function errorBody(shape: ErrorShape, message: string) {
  if (shape === "message") return { error: { message } };
  if (shape === "success") return { success: false, error: message };
  return { error: message };
}

/**
 * يتأكد إن فيه مستخدم مسجّل دخوله.
 * بيرجّع { user } لو تمام، أو { response } جاهزة للإرجاع لو لأ.
 */
export async function requireUser(shape: ErrorShape = "message") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      user: null as null,
      supabase,
      response: NextResponse.json(
        errorBody(shape, "لازم تسجّل دخول الأول عشان تستخدم الخدمة دي."),
        { status: 401 }
      ),
    };
  }

  return { user, supabase, response: null as null };
}

/**
 * حدّ استخدام بسيط في الذاكرة (sliding window).
 *
 * ⚠️ حدود الحل ده: الذاكرة بتبقى لكل instance لوحدها، فعلى Vercel
 * لو اتشغّل أكتر من instance يبقى الحد الفعلي أعلى من الرقم المكتوب.
 * ده كفاية لحماية فاتورة Groq من الاستهلاك العادي، ومش بديل عن
 * حل مركزي (Upstash/Redis) لو الموقع كبر.
 */
const hits = new Map<string, number[]>();

/** أقصى عدد مفاتيح متتبّعة. فوقه بنمسح الأقدم بالقوة — سقف ذاكرة مضمون
    مهما كان المهاجم بيولّد IPs جديدة. */
const MAX_TRACKED_KEYS = 500;

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  shape: ErrorShape = "message"
) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

  if (recent.length >= limit) {
    const retryAfter = Math.ceil((windowMs - (now - recent[0])) / 1000);
    hits.set(key, recent);
    return NextResponse.json(
      errorBody(
        shape,
        `استخدمت الخدمة كتير في وقت قصير. استنى ${retryAfter} ثانية وحاول تاني.`
      ),
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  recent.push(now);
  hits.set(key, recent);

  /* تنضيف الماب.
     ⚠️ الشرط الأول (انتهاء النافذة) لوحده **مش كفاية**، ودي كانت ثغرة
     حقيقية: مع نافذة ساعة ومهاجم بيغيّر الـ IP كل طلب، مفيش ولا مفتاح
     بيبقى منتهي، فالمسح بيلف على الماب كلها كل طلب من غير ما يمسح حاجة
     — تكلفة تربيعية وذاكرة بتكبر خطّي. والسقف اليومي مابيوقفش ده لأنه
     بيتفحص بعد ما المفتاح اتكتب هنا خلاص.
     فبعد التنضيف العادي، لو الماب لسه فوق السقف بنمسح الأقدم بالقوة.
     ضحية ده مهاجم بيدوّر IPs (بيفقد عدّاده) مش مستخدم عادي. */
  if (hits.size > MAX_TRACKED_KEYS) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= windowMs)) hits.delete(k);
    }

    if (hits.size > MAX_TRACKED_KEYS) {
      // Map بتحافظ على ترتيب الإدخال، فأول المفاتيح هي الأقدم كتابةً
      const excess = hits.size - MAX_TRACKED_KEYS;
      let i = 0;
      for (const k of hits.keys()) {
        if (i++ >= excess) break;
        hits.delete(k);
      }
    }
  }

  return null;
}

/** يقص أي نص جاي من الكلاينت لحد أقصى، وبيرفض لو مش نص. */
export function clampText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.slice(0, max);
}

/* ==========================================================================
   سقف يومي عام (ميزانية)

   ليه ده موجود بالإضافة لـ checkRateLimit:
   حد الـ IP بيتخطّى بسهولة — `x-forwarded-for` هيدر عادي والمهاجم بيقدر
   يحطّ فيه أي قيمة، فكل طلب يبان كأنه من IP جديد وياخد الحد كامل من
   أول وآخر. ده مقبول لراوت زي الرأي (أسوأ نتيجة لوج زيادة)، بس **مش**
   مقبول لراوت مفتوح بيستهلك توكنز و OCR.

   العدّاد ده مايهمّهوش مين بيطلب: بيعدّ **كل** طلب بيعدّي الفحص، ناجح
   أو فاشل، وبيقفل الباب لما يوصل السقف. العدّ بيحصل قبل الشغل مش بعده
   عن قصد (fail-closed): لو عدّينا الناجح بس، طلب بيفشل بعد ما صرف
   توكنز كان هيبقى ببلاش على العدّاد.
   وتمن ده إن ١٥٠ طلب رخيص فاشل (نوع ملف غلط مثلاً) بيقفلوا الديمو
   لبقية اليوم. مقبول: البديل إن الفشل مايتحسبش، وساعتها مهاجم يلف
   على أخطاء بتصرف فلوس من غير عدّاد.

   يعني أسوأ حالة إن مهاجم يحرق ميزانية اليوم — مش الفاتورة كلها.

   ⚠️ نفس قيد checkRateLimit: الذاكرة لكل instance، فعلى Vercel السقف
   الفعلي = السقف × عدد الـ instances. لسه بيحوّل الخطر من "مفتوح" لـ
   "محدود بمضاعف صغير"، وده الفرق اللي بيهم.
   ========================================================================== */

const budgets = new Map<string, { day: string; used: number }>();

/** مفتاح اليوم بالـ UTC — التصفير بيحصل نص الليل بتوقيت جرينتش. */
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * بيتأكد إن الميزانية اليومية لخدمة معيّنة ما خلصتش، وبيزوّد العدّاد.
 * بيرجّع `response` جاهزة لو خلصت، أو null لو فيه رصيد.
 */
export function checkDailyBudget(
  name: string,
  limit: number,
  shape: ErrorShape = "message"
) {
  const day = todayKey();
  const entry = budgets.get(name);

  // يوم جديد = عدّاد جديد. مفيش تنضيف محتاج نتعمله: المفاتيح عددها
  // ثابت (اسم خدمة واحد لكل راوت) والقيمة بتتكتب فوق القديمة.
  const current = entry && entry.day === day ? entry : { day, used: 0 };

  if (current.used >= limit) {
    budgets.set(name, current);
    return NextResponse.json(
      errorBody(
        shape,
        "التجربة المجانية وصلت حدها اليومي. سجّل حساب مجاني وكمّل من غير حدود."
      ),
      { status: 429, headers: { "Retry-After": "3600" } }
    );
  }

  current.used += 1;
  budgets.set(name, current);
  return null;
}
