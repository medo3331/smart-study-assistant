"use client";

/* ==========================================================================
   شكل العنصر — معاينة حقيقية لكل قسم

   كل قسم بيتعرض بطريقته: الثيم بعيّنة ألوانه الفعلية، الصورة بإيموجي،
   الإطار ببرواز حوالين صورة الحساب الحالية، اللقب بنصه، الرفيق بمراحله،
   الصوت بأيقونة، الاحتفال باسمه.

   Why كمبوننت واحد مش سبعة: الكارت في المتجر والكارت في المخزن والمعاينة
   في المودال كلهم عايزين نفس الحاجة بأحجام مختلفة. سبعة كمبوننت معناها
   إن أي تعديل على شكل الثيم لازم يتعمل في تلات أماكن.

   ⚠️ عيّنة الثيم بتيجي من `swatch` في theme-packs.ts، والملف مولّد من
   نفس السكربت اللي بيولّد الباليتات في globals.css — فالمعاينة **مش
   تقريب**، دي نفس الألوان بالحرف.
   ========================================================================== */

import { Music, Sparkles } from "lucide-react";
import type { ShopItem } from "@/lib/shop/types";
import { THEME_PACKS } from "@/lib/shop/theme-packs";
import { companionStages } from "@/lib/shop/catalog";

const SWATCH_BY_ID = new Map(THEME_PACKS.map((p) => [p.id, p.swatch]));

/**
 * ألوان الباليتة بالترتيب: [الصفحة، الكارت، الضربة، الحبر].
 * `null` للملزمة الأصلية (قيمتها "") ولأي معرّف مش معروف.
 */
export function themeSwatch(value: string): readonly string[] | null {
  return SWATCH_BY_ID.get(value as never) ?? null;
}

export function ItemVisual({
  item,
  avatarEmoji,
  size = "md",
}: {
  item: ShopItem;
  /** الصورة الملبوسة — الإطار بيتعرض حواليها عشان المعاينة تبقى واقعية */
  avatarEmoji?: string;
  size?: "sm" | "md" | "lg";
}) {
  const box =
    size === "lg" ? "text-5xl" : size === "sm" ? "text-xl" : "text-[2rem]";

  switch (item.category) {
    /* الثيم: أربع شرايح — الصفحة، الكارت، الضربة، الحبر */
    case "theme": {
      const sw = themeSwatch(item.value);
      // «الملزمة الأصلية» قيمتها "" — مفيش عيّنة، فبنوريه الورق الحالي
      if (!sw) {
        return (
          <div className="shop-thumb" aria-hidden>
            📄
          </div>
        );
      }
      return (
        <div className="shop-thumb !p-0 overflow-hidden" aria-hidden>
          <div className="flex w-full h-full">
            {sw.map((c, i) => (
              <span key={i} className="flex-1" style={{ background: c }} />
            ))}
          </div>
        </div>
      );
    }

    case "avatar":
      return (
        <div className={`shop-thumb ${box}`} aria-hidden>
          {item.value}
        </div>
      );

    /* الإطار حوالين الصورة الحالية — كده اللي بيشتري بيشوف النتيجة */
    case "frame":
      return (
        <div className="shop-thumb" aria-hidden>
          <span
            className={`shop-frame frame-${item.value} text-xl`}
            style={{ ["--frame-size" as string]: size === "lg" ? "72px" : "46px" }}
          >
            {avatarEmoji || "🦉"}
          </span>
        </div>
      );

    case "title":
      return (
        <div className="shop-thumb" aria-hidden>
          <span className="tag">{item.value}</span>
        </div>
      );

    /* الرفيق: أول مرحلة كبيرة والباقي صغير — التطوّر بيبان من الكارت */
    case "companion": {
      const stages = companionStages(item.value);
      return (
        <div className="shop-thumb flex-col gap-1" aria-hidden>
          <span className={box}>{stages[0]}</span>
          <span className="text-[10px] opacity-70 tracking-widest">
            {stages.slice(1).join(" ")}
          </span>
        </div>
      );
    }

    case "sound":
      return (
        <div className="shop-thumb" aria-hidden>
          <Music className="w-7 h-7 text-ink-soft" strokeWidth={1.5} />
        </div>
      );

    case "effect":
      return (
        <div className="shop-thumb" aria-hidden>
          <Sparkles className="w-7 h-7 text-ink-soft" strokeWidth={1.5} />
        </div>
      );

    default:
      return (
        <div className="shop-thumb" aria-hidden>
          🎁
        </div>
      );
  }
}
