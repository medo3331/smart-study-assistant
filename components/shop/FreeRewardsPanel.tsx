"use client";

/* ==========================================================================
   Free Rewards — المشاهدة مقابل كوينز (D-M-05)

   ⚠️ **مقفول عمدًا.** مصدر `ad_reward` (5 كوينز، سقف 3/يوم) موجود ومحضّر
   في `coin_source_rules` لكنه `is_live=false` لحد ما شبكة إعلانات بتدعم
   Server-side Verification (SSV) تتكامل. قرار المالك: **ممنوع** نعتمد
   على كلام التطبيق إن الإعلان خلص — التفعيل محتاج تأكيد سيرفر من مزوّد
   الإعلانات (D-M-05). القسم ده بيورّي المكافأة المتوقعة وحالة «قريبًا».
   ========================================================================== */

import { Tv } from "lucide-react";

export function FreeRewardsPanel() {
  return (
    <section className="space-y-3" aria-labelledby="free-rewards-title">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 id="free-rewards-title" className="font-display font-extrabold text-[15px] text-ink flex items-center gap-2">
          <Tv className="w-4 h-4 text-ink-soft" aria-hidden />
          المكافآت المجانية
        </h2>
        <span className="mono text-[11px] text-ink-soft">
          شاهد إعلانًا واكسب <b className="text-ink">+5 كوين</b> — حتى 3 مرات يوميًا
        </span>
      </div>

      <div className="rounded-[var(--r-md,12px)] border border-rule bg-paper-2 p-4 flex items-center gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-ink">مشاهدة إعلان مكتملة</p>
          <p className="text-[11px] text-ink-soft leading-relaxed">
            الميزة قيد التجهيز — بنربطها بشبكة إعلانات بتتحقق من اكتمال المشاهدة
            على السيرفر (SSV) قبل منح الكوينز، عشان المكافأة تبقى عادلة للكل.
          </p>
        </div>
        <button type="button" disabled className="btn btn-quiet text-sm" aria-disabled>
          شاهد إعلانًا — قريبًا
        </button>
      </div>
    </section>
  );
}
