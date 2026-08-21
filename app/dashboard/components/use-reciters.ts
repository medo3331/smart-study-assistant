"use client";

import { useEffect, useState } from "react";
import type { Reciter } from "./audio-library";

/* ==========================================================================
   قائمة القرّاء — هوك مشترك

   🗓️ ١٢ أغسطس: الهوك ده كان جوه `SoundLibrary.tsx`. اتنقل هنا لما كارت
   القرآن ظهر في الداشبورد — بقى فيه مستهلكين اتنين لنفس القايمة، وماينفعش
   كل واحد يكتب الـ fetch وحالات الفشل من أول وجديد.

   ⚠️ مفيش `started` ref هنا عن قصد. الحرس ده كان بيكسر الوضع الصارم
   (Strict Mode): التركيب بيحصل مرتين، التاني بيلاقي الـ ref مرفوع فبيخرج،
   والأول اتلغى — فالقايمة بتفضل هيكل عظمي للأبد. الإلغاء بيتعامل معاه
   بـ `AbortController` وبتجاهل `AbortError`.
   ========================================================================== */

interface RecitersState {
  reciters: Reciter[] | null;
  /** القايمة اللي وصلت احتياطية ومختصرة — الخدمة مارضيتش ترد. */
  stale: boolean;
  failed: boolean;
}

/**
 * 🗃️ كاش على مستوى الموديول.
 *
 * الداشبورد فيها مستهلكين اتنين: كارت القرآن (بيشتغل مع تحميل الصفحة)
 * ودرج الإعدادات (بيشتغل لما تفتح تبويب القرآن). من غير الكاش ده، فتح
 * الإعدادات كان بيعمل نداء تاني لحاجة إحنا جايبينها خلاص.
 *
 * ⚠️ ده كاش داتا مش علم «اشتغلت قبل كده» — فالوضع الصارم مايكسروش:
 * أسوأ حالة إن التركيبتين يجيبوا نفس الحاجة ويكتبوها بنفس القيمة.
 *
 * والقايمة الاحتياطية (`stale`) **مابتتخزّنش**: لو خزّناها، وقعة لحظية
 * للخدمة كانت هتقفل المستخدم على ٨ قرّاء لحد ما يعمل ريفريش كامل.
 */
let cached: { reciters: Reciter[]; stale: boolean } | null = null;

export function useReciters(enabled: boolean): RecitersState {
  const [state, setState] = useState<RecitersState>(() =>
    cached
      ? { reciters: cached.reciters, stale: cached.stale, failed: false }
      : { reciters: null, stale: false, failed: false }
  );

  useEffect(() => {
    if (!enabled) return;
    // وصلت خلاص من مستهلك تاني — مفيش داعي لأي شبكة
    if (cached) {
      setState({ reciters: cached.reciters, stale: cached.stale, failed: false });
      return;
    }

    const controller = new AbortController();
    fetch("/api/quran/reciters", { signal: controller.signal })
      .then((r) => r.json())
      .then((data: { reciters?: Reciter[]; stale?: boolean }) => {
        if (Array.isArray(data.reciters) && data.reciters.length) {
          const stale = data.stale === true;
          if (!stale) cached = { reciters: data.reciters, stale: false };
          setState({ reciters: data.reciters, stale, failed: false });
        } else {
          setState({ reciters: null, stale: false, failed: true });
        }
      })
      .catch((err: unknown) => {
        // الإلغاء مش فشل — ده إحنا اللي عملناه وإحنا بنقفل
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({ reciters: null, stale: false, failed: true });
      });

    return () => controller.abort();
  }, [enabled]);

  return state;
}
