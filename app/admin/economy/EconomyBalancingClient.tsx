"use client";

/**
 * نماذج تعديل الاقتصاد — كل حفظ بينادي server action بيتحقق من الدور
 * وبيسجّل Audit Log. التعديل هنا عرض بس — الحماية في السيرفر.
 */

import { useState, useTransition } from "react";
import {
  updateCoinSourceRule,
  updateExchangeSettings,
  updatePackPrice,
  type BalancingActionResult,
} from "@/app/admin/actions/economy-balancing";
import type { CoinSourceRuleRow, ExchangeSettingsRow, PackRow } from "@/lib/admin/economy-balancing";

function ResultLine({ result }: { result: BalancingActionResult | null }) {
  if (!result) return null;
  return (
    <p className={`text-[11px] ${result.ok ? "text-emerald-400" : "text-rose-400"}`} role="status">
      {result.message}
    </p>
  );
}

const inputCls = "w-full rounded bg-slate-800 border border-slate-700 p-2 text-xs text-slate-200";
const btnCls = "rounded bg-amber-500/20 border border-amber-500/40 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-500/30 disabled:opacity-50";

export function EconomyBalancingClient({
  rules,
  exchange,
  coinPacks,
  creditPacks,
}: {
  rules: CoinSourceRuleRow[];
  exchange: ExchangeSettingsRow | null;
  coinPacks: PackRow[];
  creditPacks: PackRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<BalancingActionResult | null>(null);

  function run(fn: () => Promise<BalancingActionResult>) {
    startTransition(async () => {
      setResult(await fn());
    });
  }

  return (
    <div className="space-y-6">
      <ResultLine result={result} />

      {/* قواعد المكافآت */}
      <section className="rounded-2xl border border-slate-700 p-4">
        <h2 className="text-sm font-extrabold text-amber-300 mb-3">قواعد المكافآت (coin_source_rules)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="text-amber-300">
              <tr>
                <th className="text-right px-2 py-1">المصدر</th>
                <th className="text-right px-2 py-1">المبلغ</th>
                <th className="text-right px-2 py-1">سقف يومي</th>
                <th className="text-right px-2 py-1">مفعّل</th>
                <th className="px-2 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <RuleRow key={r.id} rule={r} busy={pending} onSave={(amount, dailyCap, isLive) =>
                  run(() => updateCoinSourceRule({ id: r.id, amount, dailyCap, isLive }))
                } />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* التبديل — الإجراء ياخد camelCase، التحويل يحصل هنا مش في السيرفر */}
      {exchange && (
        <ExchangeForm exchange={exchange} busy={pending} onSave={(input) => run(() => updateExchangeSettings(input))} />
      )}

      {/* الباقات */}
      <PacksForm title="باقات الكوينز (coin_packs)" packs={coinPacks} kind="coins" busy={pending}
        onSave={(packId, price, isActive) => run(() => updatePackPrice({ kind: "coins", packId, price, isActive }))} />
      <PacksForm title="باقات الكريدت (credit_packs)" packs={creditPacks} kind="credits" busy={pending}
        onSave={(packId, price, isActive) => run(() => updatePackPrice({ kind: "credits", packId, price, isActive }))} />
    </div>
  );
}

function RuleRow({ rule, busy, onSave }: {
  rule: CoinSourceRuleRow;
  busy: boolean;
  onSave: (amount: number, dailyCap: number | null, isLive: boolean) => void;
}) {
  const [amount, setAmount] = useState(String(rule.amount));
  const [cap, setCap] = useState(rule.daily_cap === null ? "" : String(rule.daily_cap));
  const [live, setLive] = useState(rule.is_live);

  return (
    <tr className="border-t border-slate-700/60">
      <td className="px-2 py-1.5 font-mono text-slate-300">{rule.id}</td>
      <td className="px-2 py-1.5 w-24">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className={inputCls} aria-label={`مبلغ ${rule.id}`} />
      </td>
      <td className="px-2 py-1.5 w-24">
        <input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="numeric" placeholder="بدون" className={inputCls} aria-label={`سقف ${rule.id}`} />
      </td>
      <td className="px-2 py-1.5">
        <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} className="accent-amber-500" aria-label={`تفعيل ${rule.id}`} />
      </td>
      <td className="px-2 py-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const amt = parseInt(amount, 10);
            const capNum = cap.trim() === "" ? null : parseInt(cap, 10);
            onSave(Number.isFinite(amt) ? amt : rule.amount, capNum === null || Number.isNaN(capNum) ? null : capNum, live);
          }}
          className={btnCls}
        >
          حفظ
        </button>
      </td>
    </tr>
  );
}

function ExchangeForm({ exchange, busy, onSave }: {
  exchange: ExchangeSettingsRow;
  busy: boolean;
  onSave: (input: Parameters<typeof updateExchangeSettings>[0]) => void;
}) {
  const [form, setForm] = useState(exchange);
  const field = (label: string, key: keyof ExchangeSettingsRow, type: "number" | "checkbox") => (
    <label className="block text-[11px] text-slate-300">
      {label}
      {type === "number" ? (
        <input
          value={String(form[key] ?? "")}
          onChange={(e) => setForm({ ...form, [key]: parseInt(e.target.value, 10) || 0 })}
          inputMode="numeric"
          className={inputCls}
        />
      ) : (
        <input
          type="checkbox"
          checked={Boolean(form[key])}
          onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
          className="accent-amber-500 block mt-1"
        />
      )}
    </label>
  );

  return (
    <section className="rounded-2xl border border-slate-700 p-4">
      <h2 className="text-sm font-extrabold text-amber-300 mb-3">محوّل الكوينز ↔ الكريدت (D-M-08)</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {field("مفعّل (كوينز→كريدت)", "coins_to_credits_enabled", "checkbox")}
        {field("مفعّل (كريدت→كوينز)", "credits_to_coins_enabled", "checkbox")}
        {field("سعر الشراء (كوينز/كريدت)", "rate_coins_per_credit", "number")}
        {field("سعر البيع (كوينز/كريدت)", "rate_coins_per_credit_out", "number")}
        {field("الحد الأدنى كوينز", "min_coins", "number")}
        {field("الحد الأدنى كريدت", "min_credits", "number")}
        {field("سقف يومي كوينز", "daily_cap_coins", "number")}
        {field("سقف يومي كريدت", "daily_cap_credits", "number")}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          onSave({
            coinsToCreditsEnabled: form.coins_to_credits_enabled,
            creditsToCoinsEnabled: form.credits_to_coins_enabled,
            rateCoinsPerCredit: form.rate_coins_per_credit,
            rateCoinsPerCreditOut: form.rate_coins_per_credit_out,
            dailyCapCoins: form.daily_cap_coins,
            dailyCapCredits: form.daily_cap_credits,
          })
        }
        className={`${btnCls} mt-3`}
      >
        حفظ إعدادات التبديل
      </button>
    </section>
  );
}

function PacksForm({ title, packs, kind, busy, onSave }: {
  title: string;
  packs: PackRow[];
  kind: "coins" | "credits";
  busy: boolean;
  onSave: (packId: string, price: number | undefined, isActive: boolean | undefined) => void;
}) {
  if (packs.length === 0) return null;
  return (
    <section className="rounded-2xl border border-slate-700 p-4">
      <h2 className="text-sm font-extrabold text-amber-300 mb-3">{title}</h2>
      <div className="space-y-2">
        {packs.map((p) => (
          <PackRow key={p.id} pack={p} unit={kind === "coins" ? "كوين" : "كريدت"} busy={busy}
            onSave={(price, isActive) => onSave(p.id, price, isActive)} />
        ))}
      </div>
    </section>
  );
}

function PackRow({ pack, unit, busy, onSave }: {
  pack: PackRow;
  unit: string;
  busy: boolean;
  onSave: (price: number | undefined, isActive: boolean | undefined) => void;
}) {
  const [price, setPrice] = useState(String(Number(pack.price)));
  const [active, setActive] = useState(pack.is_active);
  const dirty = Number(price) !== Number(pack.price) || active !== pack.is_active;

  return (
    <div className="flex flex-wrap items-center gap-3 text-[12px] border border-slate-700/60 rounded p-2">
      <span className="font-bold text-slate-200 min-w-32">{pack.title_ar}</span>
      <span className="text-slate-400">{pack.amount} {unit}</span>
      <label className="flex items-center gap-1 text-slate-300">
        السعر
        <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="w-20 rounded bg-slate-800 border border-slate-700 p-1 text-xs" />
      </label>
      <label className="flex items-center gap-1 text-slate-300">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-amber-500" />
        مفعّلة
      </label>
      <button
        type="button"
        disabled={busy || !dirty}
        onClick={() => onSave(
          Number(price) !== Number(pack.price) ? Number(price) : undefined,
          active !== pack.is_active ? active : undefined,
        )}
        className={btnCls}
      >
        حفظ
      </button>
    </div>
  );
}
