import { NextResponse } from "next/server";
import { FALLBACK_RECITERS } from "@/app/dashboard/components/audio-library";
import { normalizeReciters } from "@/lib/quran";

/* ==========================================================================
   قائمة قرّاء القرآن

   بتيجي من mp3quran.net — مصدر مفتوح ومجاني ومش عايز مفتاح.

   ليه راوت على السيرفر بدل ما الكلاينت ينده الـ API على طول؟
     ١. CORS: مش مضمون إن الـ API بيسمح بالنداء من المتصفح، والراوت ده
        بيخلّي الموضوع مش مسألة أصلاً.
     ٢. الكاش: رد واحد بيخدم كل المستخدمين ليوم كامل بدل نداء لكل زيارة.
     ٣. التطبيع: الـ API بيرجع لكل قارئ أكتر من مصحف (مرتل/مجود/روايات)،
        والكلاينت مش عايز يفهم ده — عايز اسم وسيرفر وبس.

   منطق التطبيع نفسه عايش في `lib/quran.ts` مش هنا، لأن Next بيتحقق من
   الـ exports في ملفات الراوت — أي export زيادة عن دوال الـ HTTP
   والإعدادات المعروفة بيكسر البيلد.

   ⚠️ الكاش على الـ fetch مش على الراوت (`export const revalidate`).
   الفرق مهم: كاش الراوت بيخزّن **الرد اللي طلع**، فلو الخدمة وقعت لحظة
   واحدة، الليستة الاحتياطية كانت هتتخزّن يوم كامل حتى بعد ما الخدمة
   ترجع. دلوقتي الكاش على البيانات الناجحة بس، ومسار الفشل `no-store`.

   الراوت GET وبيرجع بيانات عامة، فمفيش تسجيل دخول مطلوب — مفيش أي
   بيانات مستخدم بتلمسها.
   ========================================================================== */

const UPSTREAM = "https://mp3quran.net/api/v3/reciters?language=ar";
const UPSTREAM_TIMEOUT_MS = 8000;
const CACHE_SECONDS = 86400; // يوم

export async function GET() {
  try {
    const res = await fetch(UPSTREAM, {
      next: { revalidate: CACHE_SECONDS },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);

    const reciters = normalizeReciters(await res.json());
    if (reciters.length === 0) throw new Error("empty list");

    return NextResponse.json(
      { reciters, stale: false },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=604800`,
        },
      },
    );
  } catch {
    // الـ API وقع أو الشبكة فصلت: نرجّع الليستة الاحتياطية بدل خطأ،
    // عشان التبويب يشتغل. `stale` بتخلّي الواجهة تقول للمستخدم إن دي
    // قائمة مختصرة — من غيرها كان هيفتكر إن دول كل القرّاء الموجودين.
    //
    // `no-store` هنا مقصود: أول محاولة بعد ما الخدمة ترجع لازم تعدّي.
    return NextResponse.json(
      { reciters: FALLBACK_RECITERS, stale: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
