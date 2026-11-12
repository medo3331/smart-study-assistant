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

/* ==========================================================================
   Redis (Upstash REST) — عدّاد مركزي بين كل الـ instances

   ⚠️ المشكلة اللي بيحلها (P1، 2026-11): العدّاد القديم كان Map في ذاكرة
   كل instance. على Vercel/serverless، كل instance عندها Map مستقلة، فالحد
   الفعلي = الحد × عدد الـ instances — يعني الحماية من فاتورة AI كانت وهمية
   تقريبًا وقت الضغط.

   الحل: INCR + PEXPIRE على Upstash عبر REST (مفيش SDK جديد ولا اتصال TCP).
   لو المتغيرات مش مضبوطة (تطوير محلي)، بنرجع تلقائيًا للذاكرة — نفس السلوك
   القديم بدون كسر.
   ========================================================================== */

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/+$/, "") ?? "";
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
const hasRedis = Boolean(REDIS_URL && REDIS_TOKEN);

type RedisCommand = (string | number)[];

/** ينفّذ أوامر في pipeline واحد. بيرجّع null لو Redis مش متاح/فشل. */
async function redisPipeline(commands: RedisCommand[]): Promise<(string | number | null)[] | null> {
  if (!hasRedis) return null;
  try {
    const res = await fetch(`${REDIS_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return null;
    return data.map((entry) => {
      const result = (entry as { result?: unknown } | null)?.result;
      return typeof result === "number" || typeof result === "string" ? result : null;
    });
  } catch {
    return null;
  }
}

/* ==========================================================================
   Fallback في الذاكرة (تطوير محلي أو لو Redis وقع)
   ========================================================================== */

const hits = new Map<string, number[]>();

/** أقصى عدد مفاتيح متتبّعة. فوقه بنمسح الأقدم بالقوة — سقف ذاكرة مضمون. */
const MAX_TRACKED_KEYS = 500;

function inMemoryRateLimit(key: string, limit: number, windowMs: number): number | null {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

  if (recent.length >= limit) {
    const retryAfter = Math.ceil((windowMs - (now - recent[0])) / 1000);
    hits.set(key, recent);
    return retryAfter;
  }

  recent.push(now);
  hits.set(key, recent);

  if (hits.size > MAX_TRACKED_KEYS) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= windowMs)) hits.delete(k);
    }
    if (hits.size > MAX_TRACKED_KEYS) {
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

/**
 * حدّ استخدام (fixed window) — Redis مركزي لو متاح، وإلا ذاكرة محلية.
 *
 * بيرجّع `NextResponse` جاهزة (429) لو تجاوز الحد، أو `null` لو مسموح.
 * ⚠️ الدالة async — أي استدعاء لازم يكون `await checkRateLimit(...)`.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  shape: ErrorShape = "message"
): Promise<NextResponse | null> {
  const redisKey = `rl:${key}`;

  const results = await redisPipeline([
    ["INCR", redisKey],
    ["PTTL", redisKey],
  ]);

  if (results) {
    const count = Number(results[0] ?? 0);
    let ttl = Number(results[1] ?? -1);

    // أول طلب في النافذة (أو مفتاح بلا TTL) → اضبط الانتهاء.
    if (count === 1 || ttl < 0) {
      await redisPipeline([["PEXPIRE", redisKey, windowMs]]);
      ttl = windowMs;
    }

    if (count > limit) {
      const retryAfter = Math.max(1, Math.ceil(ttl / 1000));
      return NextResponse.json(
        errorBody(
          shape,
          `استخدمت الخدمة كتير في وقت قصير. استنى ${retryAfter} ثانية وحاول تاني.`
        ),
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    return null;
  }

  const retryAfter = inMemoryRateLimit(key, limit, windowMs);
  if (retryAfter !== null) {
    return NextResponse.json(
      errorBody(
        shape,
        `استخدمت الخدمة كتير في وقت قصير. استنى ${retryAfter} ثانية وحاول تاني.`
      ),
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
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
   ========================================================================== */

const budgets = new Map<string, { day: string; used: number }>();

/** مفتاح اليوم بالـ UTC — التصفير بيحصل نص الليل بتوقيت جرينتش. */
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * بيتأكد إن الميزانية اليومية لخدمة معيّنة ما خلصتش، وبيزوّد العدّاد.
 * بيرجّع `response` جاهزة لو خلصت، أو null لو فيه رصيد.
 * ⚠️ الدالة async — أي استدعاء لازم يكون `await checkDailyBudget(...)`.
 */
export async function checkDailyBudget(
  name: string,
  limit: number,
  shape: ErrorShape = "message"
): Promise<NextResponse | null> {
  const day = todayKey();
  const redisKey = `budget:${name}:${day}`;

  const results = await redisPipeline([
    ["INCR", redisKey],
    ["PTTL", redisKey],
  ]);

  if (results) {
    const used = Number(results[0] ?? 0);
    let ttl = Number(results[1] ?? -1);

    // ميزانية اليوم تنتهي بعد يومين — يغطي فروق التوقيت بدون مفاتيح يتيمة.
    if (used === 1 || ttl < 0) {
      await redisPipeline([["PEXPIRE", redisKey, 2 * 24 * 60 * 60 * 1000]]);
      ttl = 2 * 24 * 60 * 60 * 1000;
    }

    if (used > limit) {
      const retryAfter = Math.max(1, Math.ceil(ttl / 1000));
      return NextResponse.json(
        errorBody(
          shape,
          "التجربة المجانية وصلت حدها اليومي. سجّل حساب مجاني وكمّل من غير حدود."
        ),
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    return null;
  }

  const entry = budgets.get(name);
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
