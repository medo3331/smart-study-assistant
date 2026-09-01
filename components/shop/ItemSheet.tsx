"use client";

/* ==========================================================================
   ورقة العنصر — معاينة + شرا + تلبيس

   نفس شكل مودالات المشروع (`ShopModal.tsx`): طبقة `bg-ink/45 backdrop-blur`
   وجوّاها `sheet-card card-lift`. الزيادة هنا وصولية: `role="dialog"`
   و`aria-modal` وESC والتركيز بيدخل جوّه ويرجع لمكانه بعد الغلق —
   المودالات القديمة مافيهاش ده، والجديد مايستنسخش النقص.

   المعاينة الحقيقية للثيم: المستخدم يشوف الباليتة جوّه الورقة **من غير** ما
   الصفحة كلها تقلب.

   ⚠️ مش بـ `data-pack`: الباليتات متعرّفة على `:root[data-pack="..."]` بس،
   فالسمة على div جوّه الصفحة مالهاش أي أثر (اتجرّبت — معاينة فاضية من غير
   رسالة). الألوان بتتحقن inline من `swatch`، ودي نفس قيم globals.css
   بالحرف عشان الملفين مولّدين من نفس السكربت.
   ========================================================================== */

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Lock, Check, Coins, Zap } from "lucide-react";
import type { ShopItem } from "@/lib/shop/types";
import { CATEGORY } from "@/lib/shop/types";
import { RARITY } from "@/lib/shop/rarity";
import { ItemVisual, themeSwatch } from "./ItemVisual";
import { getUsefulMeta } from "@/lib/shop/useful";

export function ItemSheet({
  item,
  owned,
  equipped,
  lockedNeed,
  balance,
  busy,
  avatarEmoji,
  offer,
  onBuy,
  onEquip,
  onUnequip,
  onClose,
}: {
  item: ShopItem;
  owned: boolean;
  equipped: boolean;
  lockedNeed: string | null;
  balance: number;
  busy: boolean;
  avatarEmoji?: string;
  /**
   * عرض النهارده على العنصر ده، لو موجود في جدول اليوم.
   *
   * ⚠️ **السعر ده هو اللي بيتخصم فعلاً.** `purchase_item` بتسأل جدول اليوم
   * بنفسها، فلو الورقة عرضت `item.price` والعنصر عليه خصم، المستخدم يشوف
   * رقم ويتخصم منه رقم تاني — وحساب «الرصيد كفاية» يبقى غلط كمان
   * فيمنع شرا هو أصلاً يقدر عليه.
   *
   * `undefined` = مفيش عرض، والسعر العادي هو الصح.
   */
  offer?: { price: number; final: number; discount: number } | null;
  onBuy: () => void;
  onEquip: () => void;
  /** القلع — المخزن بس بيبعته، والمتجر لأ. `undefined` = الزرار مايبانش */
  onUnequip?: () => void;
  onClose: () => void;
}) {
  const rar = RARITY[item.rarity];
  const cat = CATEGORY[item.category];
  const locked = lockedNeed !== null;
  const price = offer ? offer.final : item.price;
  const affordable = balance >= price;
  /* ألوان الثيم للمعاينة: inline عشان يغلب الورق الحالي من غير ما نلمس
     `:root[data-pack]`. الترتيب: [الصفحة، الكارت، الضربة، الحبر]. */
  const sw = item.category === "theme" ? themeSwatch(item.value) : null;
  const themeStyle: Record<string, string> | undefined = sw
    ? {
        "--sw-page": sw[0],
        "--sw-card": sw[1],
        "--sw-stroke": sw[2],
        "--sw-ink": sw[3],
      }
    : undefined;

  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  /* ESC يقفل + التركيز يرجع للكارت اللي فتح الورقة. الرجوع مهم: من غيره
     التركيز بيروح لأول الصفحة، فاللي بيستخدم الكيبورد بيضيع مكانه في
     شبكة فيها ٨٤ كارت. */
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      // حصر التركيز: Tab من آخر عنصر بيرجع لأول واحد وبالعكس
      if (e.key !== "Tab" || !sheetRef.current) return;
      const nodes = sheetRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    // القفل عشان الخلفية ماتتحركش ورا الورقة
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-sheet-title"
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className="sheet-card card-lift p-6 w-full max-w-md space-y-4"
        style={{ ["--rar" as string]: rar.fill }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow eyebrow-flush mb-1.5">{cat.name}</p>
            <h3 className="h3" id="item-sheet-title">
              {item.name}
            </h3>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="إغلاق"
            className="mono text-ink-soft hover:text-ink px-2 py-1 rounded-[6px] hover:bg-paper-3 transition"
          >
            ✕
          </button>
        </div>

        {/* المعاينة الكبيرة — للثيم عيّنة صفحة مصغّرة بألوان الباليتة */}
        <div
          className="shop-preview"
          style={sw ? { ...themeStyle, background: "var(--sw-page)" } : undefined}
        >
          {sw ? (
            <div
              className="shop-preview-demo"
              style={{ background: "var(--sw-card)", color: "var(--sw-ink)" }}
              aria-hidden
            >
              <span className="shop-preview-line" />
              <span className="shop-preview-line" style={{ width: "66%" }} />
              <span
                className="text-[11px] font-bold w-fit px-1 rounded-[3px]"
                style={{ background: "var(--sw-stroke)", color: "var(--sw-ink)" }}
              >
                الضربة الفسفورية
              </span>
            </div>
          ) : (
            <ItemVisual item={item} avatarEmoji={avatarEmoji} size="lg" />
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="shop-badge" style={{ color: rar.ink }}>
            {rar.name}
          </span>
          {equipped && (
            <span className="shop-badge" style={{ color: rar.ink }}>
              <Check className="w-2.5 h-2.5" aria-hidden /> ملبوس
            </span>
          )}
          {owned && !equipped && <span className="shop-badge text-ink-soft">عندك</span>}
        </div>

        <p className="text-[13px] text-ink-soft leading-relaxed">{item.desc}</p>

        {/* المفيدة — وضح الـ effect بدون ادعاء استخدام AI */}
        {item.category === "useful" && (() => {
          const m = getUsefulMeta(item);
          if (!m) return null;
          return (
            <p className="text-[12px] text-ink leading-relaxed bg-paper border border-rule rounded-[var(--r-sm)] p-3 flex items-start gap-2">
              <Zap className="w-3.5 h-3.5 shrink-0 mt-0.5 text-ink" aria-hidden />
              <span>
                {m.type === "entitlement" ? <>يمنح: <b>{(m as { value: string }).value}</b> (دائم)</> : null}
                {m.type === "ai_credit" ? <>يمنح: <b>{(m as { amount: number }).amount} AI Credits</b> — تُحفظ في رصيدك</> : null}
              </span>
            </p>
          );
        })()}

        {locked && !owned && (
          <p className="text-[12px] text-ink leading-relaxed bg-paper border border-rule rounded-[var(--r-sm)] p-3 flex items-start gap-2">
            <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-ink-soft" aria-hidden />
            <span>
              مقفول لحد ما تحقّق: <b>{lockedNeed}</b>
            </span>
          </p>
        )}

        {/* السعر والرصيد جنب بعض — قرار الشرا محتاج الرقمين مع بعض */}
        {!owned && (
          <div className="flex items-baseline justify-between bg-paper rounded-[var(--r-sm)] px-4 py-3">
            <span className="tag">
              السعر
              {offer && offer.discount > 0 && (
                <b className="ms-1.5 ltr-num tnum" style={{ color: rar.ink }}>
                  −{offer.discount}٪ النهارده
                </b>
              )}
            </span>
            <span className="ltr-num font-display font-extrabold text-xl text-ink tnum flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-ink-soft" aria-hidden />
              {/* المشطوب جنب السعر الفعلي — الخصم يبان بالمقارنة */}
              {offer && offer.discount > 0 && (
                <span className="text-sm font-normal text-ink-soft line-through">
                  {offer.price}
                </span>
              )}
              {price}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-ink-soft tnum ltr-num">
            رصيدك: {balance} كوين
          </span>

          {owned ? (
            /* الملبوس + فيه قلع = زرار «اقلعه». الملبوس من غير قلع (الصورة
               والثيم والبرواز) = كلمة «ملبوس» مطفية، مافيش «فاضي» للخانات دي. */
            equipped && onUnequip ? (
              <button
                onClick={onUnequip}
                disabled={busy}
                className="btn btn-quiet text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? "..." : "اقلعه"}
              </button>
            ) : (
              <button
                onClick={onEquip}
                disabled={busy || equipped}
                className="btn btn-marker text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {equipped ? "ملبوس" : busy ? "..." : "البسه"}
              </button>
            )
          ) : (
            <button
              onClick={onBuy}
              disabled={busy || locked || !affordable}
              className="btn btn-marker text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy
                ? "..."
                : locked
                  ? "مقفول"
                  : affordable
                    ? "اشتري"
                    : "الرصيد مش كفاية"}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
