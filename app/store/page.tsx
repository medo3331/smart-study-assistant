import { createClient } from "@/lib/supabase/server";
import StoreClient, { type CreditPack } from "@/components/store/StoreClient";
import Link from "next/link";

/**
 * /store — متجر الكريدت: حزم + طلب شراء + تأكيد دفع يدوي + «طلباتي».
 * الأسعار من credit_packs (لا fallback)، وتعليمات الدفع من
 * app_settings.billing_payment_instructions.
 */
export const dynamic = "force-dynamic";

const INSTRUCTIONS_KEY = "billing_payment_instructions";

export default async function StorePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAuthenticated = !!user && !user.is_anonymous;

  let packs: CreditPack[] = [];
  let instructions: string | null = null;

  try {
    const { data: packRows } = await supabase
      .from("credit_packs")
      .select("id, title_ar, credits, price, currency")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    packs = (packRows ?? []) as CreditPack[];
  } catch {
    packs = [];
  }
  try {
    const { data: setting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", INSTRUCTIONS_KEY)
      .maybeSingle();
    const value = (setting as { value?: string } | null)?.value;
    instructions = typeof value === "string" && value.trim() ? value.trim() : null;
  } catch {
    instructions = null;
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#0B0F1E] text-[#E7E9F5]">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link href="/dashboard" className="text-sm text-[#9AA0C0] hover:text-white mb-6 inline-block">← العودة للوحة</Link>
        <h1 className="text-3xl font-extrabold mb-2">المتجر</h1>
        <p className="text-[#9AA0C0] mb-2">
          اشترِ رصيد AI Credits: اطلب الحزمة، حوّل المبلغ، أكّد الدفع برقم العملية — وسيشحن الرصيد بعد مراجعة الإدارة.
        </p>
        <p className="mb-8 text-sm">
          <Link href="/shop" className="text-violet-300 underline underline-offset-4 hover:text-violet-200">
            عايز كوينز؟ شحن الكوينز والتبديل بين الكوينز والكريدت في متجر المنصة ↗
          </Link>
        </p>
        <StoreClient packs={packs} instructions={instructions} isAuthenticated={isAuthenticated} />
        <footer className="text-center text-xs text-[#7A8298] pt-6 mt-8 border-t border-[#2A3050]">Magiclly — دفع يدوي</footer>
      </div>
    </main>
  );
}
