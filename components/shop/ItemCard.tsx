"use client";

/* ==========================================================================
   كارت العنصر — المتجر والمخزن بيستخدموه بنفس الشكل

   الكارت **زرار** مش div: كل الكروت بتفتح المعاينة، والطلب فيه لوحة مفاتيح
   وقارئ شاشة يشتغلوا. زرار واحد بيجيب التركيز والـ Enter والـ Space
   ببلاش بدل ما نعمل tabIndex وonKeyDown بالإيد.

   ⚠️ لون الندرة داخل عن طريق `--rar` (متغير inline) مش كلاس بلون —
   عشان الكلاسات في globals.css تفضل توكنز والشرط الوحيد اللي بيتغيّر
   هو المتغير. كده الـ١٥ باليتة بتشتغل من غير ١٥×٦ قاعدة.
   ========================================================================== */

import { Star, Check, Lock } from "lucide-react";
import { motion } from "framer-motion";
import type { ShopItem } from "@/lib/shop/types";
import { RARITY } from "@/lib/shop/rarity";
import { ItemVisual } from "./ItemVisual";

export type CardState = {
  owned: boolean;
  equipped: boolean;
  favorite: boolean;
  /** الشرط لسه ما اتحققش — النص اللي بيتعرض تحت */
  lockedNeed: string | null;
  affordable: boolean;
};

export function ItemCard({
  item,
  state,
  avatarEmoji,
  justBought,
  onOpen,
  onToggleFavorite,
}: {
  item: ShopItem;
  state: CardState;
  avatarEmoji?: string;
  /** بيشغّل وميضة الشرا مرة واحدة */
  justBought?: boolean;
  onOpen: () => void;
  /** النجمة للمملوك بس — المتجر بيبعت undefined للعناصر اللي مش متملّكة */
  onToggleFavorite?: () => void;
}) {
  const rar = RARITY[item.rarity];
  const locked = state.lockedNeed !== null;

  /* الوصف المسموع: الكارت زرار واحد فلازم اسمه يقول كل حاجة — الاسم
     والندرة والحالة والسعر. من غير كده قارئ الشاشة بيسمع «مبتدئ» وبس. */
  const status = state.equipped
    ? "ملبوس"
    : state.owned
      ? "عندك"
      : locked
        ? `مقفول: ${state.lockedNeed}`
        : `السعر ${item.price} كوين`;

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileTap={{ scale: 0.97 }}
      className={`shop-card ${state.equipped ? "shop-card-on" : ""} ${
        locked && !state.owned ? "shop-card-locked" : ""
      } ${justBought ? "shop-card-bought" : ""}`}
      style={{ ["--rar" as string]: rar.fill }}
      aria-label={`${item.name} — ${rar.name} — ${status}`}
    >
      <ItemVisual item={item} avatarEmoji={avatarEmoji} size="md" />

      <div className="min-w-0 space-y-1">
        <div className="flex items-start justify-between gap-1.5">
          <p className="font-display font-extrabold text-[13px] text-ink leading-tight truncate">
            {item.name}
          </p>
          {state.favorite && (
            <Star
              className="w-3 h-3 shrink-0 mt-0.5 fill-current"
              style={{ color: rar.ink }}
              aria-hidden
            />
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

        {state.equipped ? (
          <span className="shop-badge" style={{ color: rar.ink }}>
            <Check className="w-2.5 h-2.5" aria-hidden /> ملبوس
          </span>
        ) : state.owned ? (
          <span className="shop-badge text-ink-soft">عندك</span>
        ) : locked ? (
          <span className="shop-badge text-ink-soft">
            <Lock className="w-2.5 h-2.5" aria-hidden /> مقفول
          </span>
        ) : (
          <span
            className={`coin-pill ${state.affordable ? "" : "opacity-55"}`}
            aria-hidden
          >
            🪙 {item.price}
          </span>
        )}
      </div>

      {/* شرط الفتح مكتوب — «مقفول» لوحده مايقولش ناقص إيه */}
      {locked && !state.owned && (
        <p className="text-[9px] text-ink-soft leading-snug border-t border-rule pt-1.5">
          {state.lockedNeed}
        </p>
      )}

      {/* النجمة زرار جوّه زرار = HTML غلط، فبتتحوّل لـ span بـ role
          والتعامل بيوقف الانتشار عشان مايفتحش المعاينة معاها */}
      {state.owned && onToggleFavorite && (
        <span
          role="button"
          tabIndex={0}
          aria-label={state.favorite ? "شيل من المفضلة" : "ضيف للمفضلة"}
          aria-pressed={state.favorite}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite();
            }
          }}
          className="absolute top-1.5 end-1.5 w-6 h-6 grid place-items-center rounded-full bg-paper-3 border border-rule text-ink-soft hover:text-ink cursor-pointer"
        >
          <Star
            className={`w-3 h-3 ${state.favorite ? "fill-current" : ""}`}
            aria-hidden
          />
        </span>
      )}
    </motion.button>
  );
}
