"use client";

/* ==========================================================================
   محوّل الكوينز ↔ الكريدت (D-M-08)

   تبديل يدوي بالاتجاهين بسعرين مختلفين (شراء أغلى من بيع) — عشان ميبقاش
   فيه دايرة ربح من الفرق. المعاينة هنا بتستخدم نفس معادلات `lib/shop/exchange`
   لكن **الخصم الفعلي في RPCs السيرفر** — لو السعر اتغيّر من اللوحة قبل ما
   المستخدم يضغط، السيرفر هو اللي بيقول النتيجة النهائية.

   ⚠️ الواجهة ما بتحسبش الرصيد الجديد محليًا — بعد نجاح التبديل بنقرأ
   الأرصدة اللي الـ RPC رجّعها (نفس قاعدة use-shop: التحديث من رد الداتابيز).
   ========================================================================== */

import { useCallback, useEffect, useState } from "react";
import { ArrowLeftRight, RefreshCw } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  creditsForCoins,
  coinsForCredits,
  exchangeErrorMessage,
  validateExchangeInput,
  type ExchangeSettings,
} from "@/lib/shop/exchange";

type Direction = "coins_to_credits" | "credits_to_coins";

const DEFAULT_SETTINGS: ExchangeSettings = {
  coins_to_credits_enabled: false,
  credits_to_coins_enabled: false,
  rate_coins_per_credit: 10,
  rate_coins_per_credit_out: 8,
  min_coins: 50,
  min_credits: 10,
  daily_cap_coins: 3000,
  daily_cap_credits: 300,
};

export function ExchangeWidget({
  supabase,
  coinBalance,
  onChanged,
}: {
  supabase: SupabaseClient | null;
  /** رصيد الكوينز الحالي — جاي من use-shop (نفس مصدر الحقيقة بتاع المتجر). */
  coinBalance: number;
  /** بيتنده بعد أي تبديل ناجح عشان المتجر يحدّث رصيده من السيرفر. */
  onChanged: () => void;
}) {
  const [settings, setSettings] = useState<ExchangeSettings | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [direction, setDirection] = useState<Direction>("coins_to_credits");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refreshBalances = useCallback(async () => {
    if (!supabase) return;
    const [coins, credits] = await Promise.all([
      supabase.rpc("coin_balance"),
      supabase.rpc("ai_credit_balance"),
    ]);
    if (typeof credits.data === "number") setCreditBalance(credits.data);
    onChanged();
    void coins; // رصيد الكوينز بيتحدّث في use-shop عن طريق onChanged
  }, [supabase, onChanged]);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    // الإعدادات عامة (RLS read للجميع) — ولو الجدول لسه ماتعملش
    // نعرض الويدجت مقفول بدل ما نكسر الصفحة.
    void supabase
      .from("economy_exchange_settings")
      .select("coins_to_credits_enabled, credits_to_coins_enabled, rate_coins_per_credit, rate_coins_per_credit_out, min_coins, min_credits, daily_cap_coins, daily_cap_credits")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        if (alive && data) setSettings(data as ExchangeSettings);
        else if (alive) setSettings(null);
      });
    void supabase.rpc("ai_credit_balance").then(({ data }) => {
      if (alive && typeof data === "number") setCreditBalance(data);
    });
    return () => { alive = false; };
  }, [supabase]);

  const s = settings;
  const coinsToCredits = direction === "coins_to_credits";
  const num = Number(amount);

  /* المعاينة — نفس معادلات السيرفر بالظبط */
  const preview = s
    ? coinsToCredits
      ? creditsForCoins(num, s.rate_coins_per_credit)
      : coinsForCredits(num, s.rate_coins_per_credit_out)
    : 0;

  const validation = s ? validateExchangeInput(num, direction, s) : { valid: false, error: null };

  async function submit() {
    if (!supabase || !s || !validation.valid || busy) return;
    setBusy(true);
    setMessage(null);
    const rpcName = coinsToCredits ? "exchange_coins_to_credits" : "exchange_credits_to_coins";
    const { data, error } = await supabase.rpc(rpcName, {
      [coinsToCredits ? "p_coins" : "p_credits"]: num,
    });
    setBusy(false);
    if (error) {
      setMessage({ ok: false, text: exchangeErrorMessage(error.message) });
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setMessage({
      ok: true,
      text: coinsToCredits
        ? `تم التبديل: +${row?.credits_granted ?? preview} كريدت لرصيدك.`
        : `تم التبديل: +${row?.coins_granted ?? preview} كوين لرصيدك.`,
    });
    setAmount("");
    await refreshBalances();
  }

  if (!s) {
    // الجدول غير موجودة أو التبديل مقفول من الإدارة — بلا ضوضاء
    return null;
  }
  if (!s.coins_to_credits_enabled && !s.credits_to_coins_enabled) return null;

  return (
    <section className="space-y-3" aria-labelledby="exchange-title">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 id="exchange-title" className="font-display font-extrabold text-[15px] text-ink flex items-center gap-2">
          <ArrowLeftRight className="w-4 h-4 text-ink-soft" aria-hidden />
          محوّل الكوينز والكريدت
        </h2>
        <span className="mono text-[11px] text-ink-soft">
          {coinsToCredits
            ? `${s.rate_coins_per_credit} كوين = 1 كريدت`
            : `1 كريدت = ${s.rate_coins_per_credit_out} كوين`}
        </span>
      </div>

      <div className="rounded-[var(--r-md,12px)] border border-rule bg-paper-2 p-4 space-y-4">
        {/* الأرصدة */}
        <div className="flex items-center gap-4 flex-wrap text-[12px]">
          <span className="text-ink-soft">
            🪙 كوينزك: <b className="text-ink ltr-num tnum">{coinBalance}</b>
          </span>
          <span className="text-ink-soft">
            💎 كريدتك: <b className="text-ink ltr-num tnum">{creditBalance ?? "—"}</b>
          </span>
          <button
            type="button"
            onClick={() => void refreshBalances()}
            className="ms-auto inline-flex items-center gap-1 text-[11px] text-ink-soft hover:text-ink"
            aria-label="تحديث الأرصدة"
          >
            <RefreshCw className="w-3 h-3" aria-hidden /> تحديث
          </button>
        </div>

        {/* الاتجاه */}
        <div className="flex gap-1.5" role="tablist" aria-label="اتجاه التبديل">
          {([
            { id: "coins_to_credits" as Direction, label: "كوينز → كريدت", enabled: s.coins_to_credits_enabled },
            { id: "credits_to_coins" as Direction, label: "كريدت → كوينز", enabled: s.credits_to_coins_enabled },
          ]).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={direction === tab.id}
              disabled={!tab.enabled}
              onClick={() => { setDirection(tab.id); setAmount(""); setMessage(null); }}
              className={`mono text-[11px] px-3 py-2 rounded-[6px] border transition disabled:opacity-40 disabled:cursor-not-allowed ${
                direction === tab.id
                  ? "bg-ink text-paper-2 border-ink"
                  : "bg-paper-2 text-ink-soft border-rule hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* المبلغ + المعاينة */}
        <div className="flex items-end gap-3 flex-wrap">
          <label className="block text-[12px] text-ink-soft">
            المبلغ ({coinsToCredits ? "كوين" : "كريدت"})
            <input
              type="number"
              inputMode="numeric"
              min={coinsToCredits ? s.min_coins : s.min_credits}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={coinsToCredits ? String(s.min_coins) : String(s.min_credits)}
              className="mt-1 w-36 bg-paper border border-rule rounded-[var(--r-sm,8px)] px-3 py-2 text-[13px] text-ink tnum focus:outline-none focus:border-rule-strong"
            />
          </label>
          <p className="text-[12px] text-ink-soft" aria-live="polite">
            {num > 0 && preview > 0 ? (
              <>
                هياخد <b className="text-ink ltr-num tnum">{preview}</b> {coinsToCredits ? "كريدت" : "كوين"}
              </>
            ) : (
              "اكتب المبلغ لتشوف النتيجة"
            )}
          </p>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!validation.valid || busy}
            className="btn btn-marker text-sm ms-auto"
          >
            {busy ? "جارٍ التبديل…" : "بدّل الآن"}
          </button>
        </div>

        {amount !== "" && !validation.valid && validation.error && (
          <p className="text-[11px] text-rose-500" role="alert">{validation.error}</p>
        )}
        {message && (
          <p
            role="status"
            className={`text-[12px] rounded-[var(--r-sm,8px)] border px-3 py-2 ${
              message.ok
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                : "border-rose-500/30 bg-rose-500/10 text-rose-600"
            }`}
          >
            {message.text}
          </p>
        )}

        <p className="text-[10px] text-ink-soft leading-relaxed">
          سعر البيع أقل من سعر الشراء عشان يمنع اللف والدوران على نفس الرصيد.
          فيه سقف تبديل يومي ({s.daily_cap_coins} كوين / {s.daily_cap_credits} كريدت).
        </p>
      </div>
    </section>
  );
}
