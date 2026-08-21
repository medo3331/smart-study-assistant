"use client";

/* ==========================================================================
   لوحة الصناديق — قسم «الصناديق» في المتجر

   ⚠️ الصناديق **مش كروت كتالوج**. `ItemCard` بيتوقّع `ShopItem` بخانة
   وملكية ومفضلة — والصندوق مالوش أي واحدة فيهم (بيتفتح ويختفي). فالكارت
   هنا مختلف عن قصد، بس بنفس لغة `.shop-card` عشان الشكل مايتشقّقش.

   الترتيب: من الأرخص للأغلى. الأغلى بيوري أندر ندرة، فالتصعيد بيبان
   من الشمال لليمين من غير ما حد يكتب «الأفضل».
   ========================================================================== */

import { motion } from "framer-motion";
import { Coins } from "lucide-react";
import type { BoxTier } from "@/lib/shop/boxes";
import { BOXES, boxOdds, oddsPercent } from "@/lib/shop/boxes";
import { RARITY } from "@/lib/shop/rarity";

export function BoxPanel({
  balance,
  onPick,
}: {
  balance: number;
  onPick: (box: BoxTier) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-ink-soft leading-relaxed">
        الصندوق بيطلّع عنصر عشوائي من الكتالوج. الاحتمالات مكتوبة على كل درجة،
        والعنصر اللي معاك بالفعل بيرجّع كوينز.
      </p>

      <div className="shop-grid">
        {BOXES.map((box) => {
          const top = RARITY[box.top];
          const odds = boxOdds(box);
          const affordable = balance >= box.price;

          return (
            <motion.button
              key={box.id}
              type="button"
              onClick={() => onPick(box)}
              whileTap={{ scale: 0.97 }}
              className="shop-card"
              style={{ ["--rar" as string]: top.fill }}
              aria-label={`${box.name} — ${box.desc} — السعر ${box.price} كوين`}
            >
              <div className="shop-thumb text-[2rem]" aria-hidden>
                🎁
              </div>

              <div className="min-w-0 space-y-1">
                <p className="font-display font-extrabold text-[13px] text-ink leading-tight truncate">
                  {box.name}
                </p>
                <p className="text-[10px] text-ink-soft leading-snug line-clamp-2">
                  {box.desc}
                </p>
              </div>

              {/* شريط الاحتمالات — نفس اللي في الورقة، بحجم الكارت */}
              <div className="odds-bar" aria-hidden>
                {odds.map((o) => (
                  <span
                    key={o.rarity}
                    className="odds-seg"
                    style={{
                      width: `${(o.odds / 10000) * 100}%`,
                      ["--seg" as string]: RARITY[o.rarity].fill,
                    }}
                  />
                ))}
              </div>

              <div className="flex items-center justify-between gap-1.5 mt-auto pt-0.5">
                <span className="shop-badge" style={{ color: top.ink }}>
                  لحد {top.name} {oddsPercent(box.odds[box.top] ?? 0)}٪
                </span>
                <span
                  className={`coin-pill ${affordable ? "" : "opacity-55"}`}
                  aria-hidden
                >
                  <Coins className="w-3 h-3" aria-hidden />
                  {box.price}
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
