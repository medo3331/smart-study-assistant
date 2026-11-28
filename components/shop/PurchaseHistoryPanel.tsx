"use client";

/* ==========================================================================
   سجل مشترياتك (D-M-10) — view فوق coin_ledger (حركات الصرف بس)
   طلابات الفلوس (كوينز/كريدت/اشتراك) في قسم الطلبات بتاعتها فوق.
   ========================================================================== */

import { useEffect, useState } from "react";
import { ReceiptText } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";

type HistoryRow = {
  id: string;
  source: string;
  label_ar: string;
  amount: number;
  created_at: string;
};

export function PurchaseHistoryPanel({ supabase }: { supabase: SupabaseClient | null }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void supabase
      .from("shop_purchase_history")
      .select("id, source, label_ar, amount, created_at")
      .order("created_at", { ascending: false })
      .limit(8)
      .then(({ data }) => {
        if (alive) setRows((data ?? []) as HistoryRow[]);
      });
    return () => { alive = false; };
  }, [supabase]);

  if (!rows || rows.length === 0) return null;

  return (
    <section className="space-y-2" aria-labelledby="history-title">
      <h2 id="history-title" className="font-display font-extrabold text-[15px] text-ink flex items-center gap-2">
        <ReceiptText className="w-4 h-4 text-ink-soft" aria-hidden />
        سجل مشترياتك
      </h2>
      <div className="rounded-[var(--r-md,12px)] border border-rule bg-paper-2 divide-y divide-rule">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[12px]">
            <span className="text-ink-soft">{r.label_ar}</span>
            <span className="flex items-center gap-3">
              <span className="text-ink ltr-num tnum">{r.amount} كوين</span>
              <span className="text-[10px] text-ink-soft">
                {new Date(r.created_at).toLocaleDateString("ar-EG")}
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
