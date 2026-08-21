"use client";

/* ==========================================================================
   ورقة الصندوق — تأكيد ← فتح ← كشف

   تلات حالات في ورقة واحدة عن قصد:

     ١) **تأكيد**: السعر والاحتمالات مكتوبين قبل أي خصم. الصندوق بيصرف
        كوينز اتكسبت بالمذاكرة، فالضغطة الغلط مش لعبة — التأكيد مش خطوة
        زيادة، هو احترام للمجهود اللي جاب الكوينز.
     ٢) **فتح**: الصندوق بيهتزّ لحد ما السيرفر يرجّع. الانتظار **حقيقي**
        (نداء شبكة) مش تأخير مصنوع، فالأنيميشن بيغطّي وقت موجود أصلاً.
     ٣) **كشف**: العنصر اللي طلع، أو رسالة المكرر بالتعويض.

   ⚠️⚠️ **السحب كله في السيرفر.** الكمبوننت ده بيستلم النتيجة جاهزة من
   `open_box` وبيعرضها. مفيش `Math.random()` في أي مكان هنا — لو كان فيه،
   أي حد يفتح الكونسول ويقول «طلّعلي خرافي».

   ⚠️ الاهتزاز والأشعة متلفّيين في `prefers-reduced-motion` (في globals.css)،
   والكشف بيفضل يشتغل من غيرهم — الحركة زينة مش وسيلة الإبلاغ.
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Coins, Gift } from "lucide-react";
import type { BoxTier } from "@/lib/shop/boxes";
import { boxOdds, oddsPercent, REFUND } from "@/lib/shop/boxes";
import { itemById } from "@/lib/shop/catalog";
import { RARITY } from "@/lib/shop/rarity";
import type { BoxOutcome } from "@/lib/shop/shop-data";
import { ItemVisual } from "./ItemVisual";

type Phase = "confirm" | "opening" | "reveal";

export function BoxSheet({
  box,
  balance,
  avatarEmoji,
  onOpen,
  onClose,
}: {
  box: BoxTier;
  balance: number;
  avatarEmoji?: string;
  /** بيرجّع نتيجة السيرفر — الورقة بتعرضها، مش بتحسبها */
  onOpen: () => Promise<{ ok: boolean; message: string; data: BoxOutcome | null }>;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const [outcome, setOutcome] = useState<BoxOutcome | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const affordable = balance >= box.price;
  const odds = boxOdds(box);

  /* ESC وحصر التركيز — نفس اللي في `ItemSheet`.
     ⚠️ ESC مقفول وقت الفتح: النداء ماشي والخصم حصل، فغلق الورقة نصّه
     معناه إن المستخدم مايشوفش إيه اللي طلع من الصندوق اللي دفع فيه. */
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase !== "opening") {
        e.stopPropagation();
        onClose();
        return;
      }
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
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, [onClose, phase]);

  const run = async () => {
    setPhase("opening");
    setErr(null);
    const res = await onOpen();
    if (!res.ok || !res.data) {
      setErr(res.message || "الصندوق مافتحش");
      setPhase("confirm");
      return;
    }
    setOutcome(res.data);
    setPhase("reveal");
  };

  const item = outcome ? itemById(outcome.itemId) : undefined;
  const rar = outcome ? RARITY[outcome.rarity] : RARITY[box.top];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 backdrop-blur-sm p-4"
      onClick={() => phase !== "opening" && onClose()}
    >
      <motion.div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="box-sheet-title"
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className="sheet-card card-lift p-6 w-full max-w-md space-y-4"
        style={{ ["--rar" as string]: rar.fill }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow eyebrow-flush mb-1.5">الصناديق</p>
            <h3 className="h3" id="box-sheet-title">
              {box.name}
            </h3>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            disabled={phase === "opening"}
            aria-label="إغلاق"
            className="mono text-ink-soft hover:text-ink px-2 py-1 rounded-[6px] hover:bg-paper-3 transition disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        {/* المسرح: الصندوق أو العنصر المكشوف */}
        <div className="box-stage">
          {phase === "reveal" && outcome ? (
            <>
              <span className="reveal-rays" aria-hidden />
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 18 }}
                className="relative z-10 grid place-items-center gap-2 text-center"
              >
                {item ? (
                  <div className="w-24">
                    <ItemVisual item={item} avatarEmoji={avatarEmoji} size="md" />
                  </div>
                ) : (
                  <span className="box-lid" aria-hidden>
                    🎁
                  </span>
                )}
                <span className="shop-badge" style={{ color: rar.ink }}>
                  {rar.name}
                </span>
              </motion.div>
            </>
          ) : (
            <span
              className={`box-lid ${phase === "opening" ? "box-shaking" : ""}`}
              aria-hidden
            >
              🎁
            </span>
          )}
        </div>

        {/* الحالة المكتوبة — قارئ الشاشة بيسمعها، والحركة زينة بس */}
        <div aria-live="polite" className="space-y-3">
          {phase === "reveal" && outcome && (
            <div className="space-y-2">
              <p className="font-display font-extrabold text-lg text-ink leading-tight">
                {item?.name ?? outcome.itemId}
              </p>
              {outcome.duplicate ? (
                <p className="text-[13px] text-ink-soft leading-relaxed">
                  ده معاك بالفعل — رجعنالك{" "}
                  <b className="ltr-num tnum text-ink">{outcome.refunded}</b> كوين
                  بدله.
                </p>
              ) : (
                <p className="text-[13px] text-ink-soft leading-relaxed">
                  {item?.desc ?? "عنصر جديد اتضاف لمخزنك."}
                </p>
              )}
            </div>
          )}

          {phase === "opening" && (
            <p className="text-[13px] text-ink-soft">بنفتح...</p>
          )}

          {err && (
            <p className="text-[12px] text-ink bg-paper border border-rule rounded-[var(--r-sm)] p-3">
              {err}
            </p>
          )}
        </div>

        {phase === "confirm" && (
          <>
            <p className="text-[13px] text-ink-soft leading-relaxed">{box.desc}</p>

            {/* الاحتمالات معروضة بالرقم مش بكلام زي «فرصة كبيرة» */}
            <div className="space-y-2">
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
              <ul className="flex flex-wrap gap-x-3 gap-y-1">
                {odds.map((o) => (
                  <li
                    key={o.rarity}
                    className="text-[11px] text-ink-soft flex items-center gap-1.5"
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: RARITY[o.rarity].fill }}
                      aria-hidden
                    />
                    {RARITY[o.rarity].name}{" "}
                    <b className="ltr-num tnum text-ink">{oddsPercent(o.odds)}٪</b>
                  </li>
                ))}
              </ul>
            </div>

            {/* التعويض مكتوب صريح: «المكرر بيرجّع كوينز» لازم تبان قبل
                الدفع مش بعده، وإلا المستخدم يحسّها مقلب. */}
            <p className="text-[11px] text-ink-soft leading-relaxed bg-paper border border-rule rounded-[var(--r-sm)] p-3">
              لو طلع عنصر معاك بالفعل بيرجّع كوينز على حسب ندرته (
              <span className="ltr-num tnum">
                {REFUND[odds[0].rarity]}–{REFUND[odds[odds.length - 1].rarity]}
              </span>
              ) — والتعويض أقل من سعر الصندوق دايماً.
            </p>

            <div className="flex items-baseline justify-between bg-paper rounded-[var(--r-sm)] px-4 py-3">
              <span className="tag">السعر</span>
              <span className="ltr-num font-display font-extrabold text-xl text-ink tnum flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-ink-soft" aria-hidden />
                {box.price}
              </span>
            </div>
          </>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-ink-soft tnum ltr-num">
            رصيدك: {balance} كوين
          </span>

          {phase === "reveal" ? (
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="btn btn-quiet text-sm">
                خلاص
              </button>
              <button
                onClick={() => {
                  setOutcome(null);
                  setPhase("confirm");
                }}
                disabled={balance < box.price}
                className="btn btn-marker text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {balance < box.price ? "الرصيد مش كفاية" : "تاني"}
              </button>
            </div>
          ) : (
            <button
              onClick={run}
              disabled={phase === "opening" || !affordable}
              className="btn btn-marker text-sm disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              <Gift className="w-3.5 h-3.5" aria-hidden />
              {phase === "opening" ? "..." : affordable ? "افتح" : "الرصيد مش كفاية"}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
