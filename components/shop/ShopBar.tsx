"use client";

/* ==========================================================================
   الشريط العلوي — الرصيد والمستوى والدوري والصورة واللقب

   الصفحتين بيلبسوه: في المتجر بيقول «معاك كام»، وفي المخزن بيقول «شكلك
   إيه دلوقتي». نفس الكمبوننت عشان الرقم مايختلفش بين صفحتين.

   ⚠️ الكوينز بتتكسب بالمذاكرة بس. مفيش زرار «اشتري كوينز» هنا ولا في أي
   مكان تاني، ومفيش أي مسار لفلوس حقيقية في المشروع. لو حد فكّر يضيف
   واحد بعدين: ده قرار حاصل، مش سهو.
   ========================================================================== */

import { motion } from "framer-motion";
import { Coins } from "lucide-react";
import { equippedItem, equippedValue, type ShopState } from "@/lib/shop/shop-data";
import { levelFromXp, nextLeague, XP_PER_LEVEL } from "@/lib/shop/economy";

export function ShopBar({ state }: { state: ShopState }) {
  const avatar = equippedValue(state, "avatar");
  const frame = equippedValue(state, "frame");
  const title = equippedItem(state, "title");
  const level = levelFromXp(state.xp);
  const up = nextLeague(state.xp);

  // تقدّم المستوى الحالي: الباقي من القسمة على سقف المستوى
  const inLevel = state.xp % XP_PER_LEVEL;
  const levelPct = Math.round((inLevel / XP_PER_LEVEL) * 100);

  return (
    <div className="shop-bar">
      {/* الصورة جوّه البرواز الملبوس — أول حاجة تبان عشان دي «إنت» */}
      <span className={`shop-frame frame-${frame} text-2xl`} aria-hidden>
        {avatar}
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-display font-extrabold text-[13px] text-ink leading-tight truncate">
          {title?.value || "طالب"}
        </p>
        <p className="text-[10px] text-ink-soft tnum ltr-num">
          {state.league.icon} {state.league.name} · المستوى {level}
        </p>
      </div>

      {/* الرصيد — الرقم اللي الصفحة كلها بتدور حوله، فأكبر حاجة في الشريط */}
      <div className="text-center px-1">
        <motion.p
          // الحركة بتشتغل لما الرقم يتغيّر: الشرا بيبان في الشريط مش في الكارت بس
          key={state.balance}
          initial={{ scale: 1.14 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 18 }}
          className="ltr-num font-display font-extrabold text-lg text-ink leading-none tnum flex items-center gap-1.5"
        >
          <Coins className="w-4 h-4 text-ink-soft" aria-hidden />
          {state.balance}
        </motion.p>
        <p className="text-[9px] text-ink-soft mt-0.5">كوين</p>
      </div>

      <div className="text-center px-1 border-s border-rule ps-3">
        <p className="ltr-num font-display font-extrabold text-lg text-ink leading-none tnum">
          {state.xp}
        </p>
        <p className="text-[9px] text-ink-soft mt-0.5">XP</p>
      </div>

      {/* التقدّم في المستوى + اللي فاضل للدوري الجاي.
          ⚠️ العدّاد محتاج ابن بـ `.meter-fill` وكلاس خلفية — `.meter` لوحده
          قناة فاضية، وspan من غير الكلاس مابيبانش خالص. */}
      <div className="w-full basis-full space-y-1">
        <div className="meter meter-sm">
          <motion.div
            className="meter-fill"
            // اللون من `--marker` مباشرة مش من كلاس Tailwind: المتغيّر بيتغيّر
            // مع الباليتة الملبوسة، فالعدّاد بيمشي مع الثيم لوحده.
            style={{ background: "var(--marker-deep)" }}
            initial={{ width: 0 }}
            animate={{ width: `${levelPct}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
        <p className="text-[9px] text-ink-soft tnum ltr-num">
          {up
            ? `فاضل ${up.xpNeeded} XP لدوري «${up.league.name}» ${up.league.icon}`
            : "وصلت لأعلى دوري 👑"}
        </p>
      </div>
    </div>
  );
}
