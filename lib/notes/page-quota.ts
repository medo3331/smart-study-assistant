// lib/notes/page-quota.ts
//
// 📄 كوتة الصفحات اليومية — عميل خفيف فوق /api/notes/page-quota.
//
// قرار صاحب المشروع: غير المشترك له 10 صفحات يومياً (صفحات النوته +
// صفحات PDF المستوردة). المشتركون بلا حد.
//
// ⚠️ **fail-open مقصود**: النوته ميزة أوفلاين-أولًا — لو السيرفر مش
// متاح (نت مقطوعة) بنسمح بإنشاء الصفحة والحد بيتفرض أول ما الرجعة
// شغالة. الحد هنا اقتصادي (بيحد من الاستخدام اليومي الطبيعي) مش أمني،
// فمينفعش نقفل النوته في وش الطالب عشان نت.

export interface PageQuotaResult {
  allowed: boolean;
  /** -1 = بلا حد (مشترك/مالك/فشل السيرفر). */
  limit: number;
  used: number;
  reasonAr?: string;
  /** true = السيرفر مش متاح — بنسمح عشان الأوفلاين. */
  failOpen: boolean;
  /** 🔑 مفتاح العنفة — لازم للاسترداد عند حذف الصفحة. */
  idempotencyKey?: string;
}

/** يطلب رصيد `count` صفحة قبل إنشائها. fail-open على أي خطأ شبكة. */
export async function requestPageCredits(count = 1): Promise<PageQuotaResult> {
  try {
    const res = await fetch("/api/notes/page-quota", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ count }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      // خطأ سيرفر — مش رفض كوتة. fail-open.
      return { allowed: true, limit: -1, used: 0, failOpen: true };
    }
    return {
      allowed: data.allowed !== false,
      limit: typeof data.limit === "number" ? data.limit : -1,
      used: typeof data.used === "number" ? data.used : 0,
      reasonAr: typeof data.reasonAr === "string" ? data.reasonAr : undefined,
      failOpen: false,
      idempotencyKey: typeof data.idempotencyKey === "string" ? data.idempotencyKey : undefined,
    };
  } catch {
    // أوفلاين — النوته لازم تفضل شغالة.
    return { allowed: true, limit: -1, used: 0, failOpen: true };
  }
}

/** رسالة الرفض الجاهزة للعرض — تحفّز الترقية. */
export function pageQuotaBlockedMessage(result: PageQuotaResult): string {
  if (result.reasonAr) return result.reasonAr;
  if (result.limit > 0) {
    return `وصلت لحد ${result.limit} صفحات اليوم. الكوتا بتتجدد كل 24 ساعة، أو رقّي باقتك.`;
  }
  return "مقدرنش أعمل صفحات جديدة دلوقتي — حاول تاني.";
}

/** ↩ استرداد رصيد صفحة اتحذفت — بالـ key اللي اتسجل عند الاستهلاك. */
export async function refundPageCredit(key: string): Promise<void> {
  if (!key) return;
  try {
    await fetch("/api/notes/page-quota", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key }),
    });
  } catch {
    // فشل الـ refund مش حرج — الرصيد هيتجدد بنفس اليوم على أي حال.
  }
}
