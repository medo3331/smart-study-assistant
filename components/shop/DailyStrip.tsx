"use client";

/* ==========================================================================
   متجر النهارده — خصومات + خانة حصرية

   الشريط بيلف كل ٢٤ ساعة بتوقيت UTC، و`ensure_daily_shop` في الداتابيز
   هي اللي بتولّده. الاختيار **حتمي** من `md5(اليوم || معرّف العنصر)` مش
   `random()`، فكل المستخدمين بيشوفوا نفس العروض وأي تولید متوازي بيوصل
   لنفس النتيجة.

   ⚠️ السعر بعد الخصم (`final`) **جاي من السيرفر**. الكارت مش بيحسب
   `price - price*discount` — لو حسبه، الرقم اللي المستخدم شافه والرقم
   اللي `purchase_item` خصمه يقدروا يختلفوا.

   ⚠️ العنصر الحصري (`exclusive`) شرطه `{kind:"daily"}` وهو **مقفول قفل
   دائم** في كل طريق تاني: `unlock_satisfied` بترجّع false، والباب الوحيد
   استثناء صريح في `purchase_item` بيسأل جدول اليوم. يعني الشريط ده هو
   المكان الوحيد اللي بيتباع فيه، ولو الاستثناء اتشال بالغلط بيقعد
   مقفول — مش بيتفتح للكل.
   ========================================================================== */

import { motion } from "framer-motion";
import { Sparkles, Timer } from "lucide-react";
import { itemById } from "@/lib/shop/catalog";
import { RARITY } from "@/lib/shop/rarity";
import type { DailyOffer } from "@/lib/shop/shop-data";
import { ItemVisual } from "./ItemVisual";

/** الساعات الفاضلة لآخر اليوم بتوقيت UTC — نفس الحدّ اللي الداتابيز بتستخدمه */
function hoursLeftUtc(): number {
  const now = new Date();
  const end = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return Math.max(1, Math.ceil((end - now.getTime()) / 3_600_000));
}

export function DailyStrip({
  offers,
  balance,
  avatarEmoji,
  onPick,
}: {
  offers: readonly DailyOffer[];
  balance: number;
  avatarEmoji?: string;
  onPick: (offer: DailyOffer) => void;
}) {
  if (offers.length === 0) return null;

  return (
    <section className="space-y-2.5" aria-labelledby="daily-title">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2
          id="daily-title"
          className="font-display font-extrabold text-[15px] text-ink flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4 text-ink-soft" aria-hidden />
          متجر النهارده
        </h2>
        <span className="text-[11px] text-ink-soft flex items-center gap-1.5">
          <Timer className="w-3 h-3" aria-hidden />
          بيتغيّر بعد <b className="ltr-num tnum">{hoursLeftUtc()}</b> ساعة
        </span>
      </div>

      <div className="shop-grid">
        {offers.map((offer) => {
          const item = itemById(offer.itemId);
          // عنصر في العروض ومش في الكتالوج = الداتابيز أقدم من الكود.
          // بنتخطّاه بالسكوت بدل ما نرسم كارت فاضي.
          if (!item) return null;

          const rar = RARITY[item.rarity];
          const affordable = balance >= offer.final;

          const status = offer.owned
            ? "عندك"
            : `السعر ${offer.final} كوين` +
              (offer.discount > 0 ? ` بعد خصم ${offer.discount} بالمية` : "");

          return (
            <motion.button
              key={offer.itemId}
              type="button"
              onClick={() => onPick(offer)}
              whileTap={{ scale: 0.97 }}
              className={`shop-card ${offer.owned ? "shop-card-locked" : ""}`}
              style={{ ["--rar" as string]: rar.fill }}
              aria-label={`${item.name} — ${rar.name} — ${status}`}
            >
              <ItemVisual item={item} avatarEmoji={avatarEmoji} size="md" />

              <div className="min-w-0 space-y-1">
                <div className="flex items-start justify-between gap-1.5">
                  <p className="font-display font-extrabold text-[13px] text-ink leading-tight truncate">
                    {item.name}
                  </p>
                  {offer.exclusive && (
                    <span
                      className="shop-badge shrink-0"
                      style={{ color: rar.ink }}
                    >
                      حصري
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-ink-soft leading-snug line-clamp-2">
                  {item.desc}
                </p>
              </div>

              <div className="flex items-center justify-between gap-1.5 mt-auto pt-0.5">
                <span className="shop-badge" style={{ color: rar.ink }}>
                  {rar.name}
                </span>

                {offer.owned ? (
                  <span className="shop-badge text-ink-soft">عندك</span>
                ) : (
                  <span className="flex items-center gap-1.5" aria-hidden>
                    {/* السعر القديم مشطوب جنب الجديد — الخصم لازم يبان
                        بالمقارنة مش برقم لوحده */}
                    {offer.discount > 0 && (
                      <span className="text-[10px] text-ink-soft line-through ltr-num tnum">
                        {offer.price}
                      </span>
                    )}
                    <span className={`coin-pill ${affordable ? "" : "opacity-55"}`}>
                      🪙 {offer.final}
                    </span>
                  </span>
                )}
              </div>

              {offer.discount > 0 && !offer.owned && (
                <p
                  className="text-[9px] font-bold leading-snug border-t border-rule pt-1.5 ltr-num tnum"
                  style={{ color: rar.ink }}
                >
                  −{offer.discount}٪ النهارده
                </p>
              )}
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
