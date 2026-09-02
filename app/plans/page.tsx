import { getPlanSettings } from "@/lib/plans/settings";
import { createClient } from "@/lib/supabase/server";
import PlansPaymentInfo from "@/components/plans/PaymentInfo";

export default async function PlansPageServer() {
  const settings = await getPlanSettings();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let userPlan: "free" | "premium" | "unknown" = "free";
  if (user && !user.is_anonymous) {
    try {
      const { data: ent } = await supabase.rpc("has_entitlement", { p_user_id: user.id, p_kind: "plan", p_value: "premium" });
      userPlan = ent ? "premium" : "free";
    } catch { userPlan = "unknown"; }
  }

  const s = settings || { freePeriodEnabled: true, paymentsEnabled: false, source: "default" };

  return (
    <div dir="rtl" className="min-h-screen bg-[#0D1029] text-[#E7E9F5] px-4 sm:px-6 md:px-10 py-10 md:py-16">
      <div className="max-w-5xl mx-auto">
        <header className="mb-10 md:mb-14">
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight leading-tight mb-3 text-[#F0E6D2]">خطط Magiclly</h1>
          <p className="text-base md:text-lg text-[#9AA0C0] leading-relaxed max-w-2xl">جزء من أساس المنصة — اختر ما يناسبك. كل ميزة مبنية على ما موجود فعلاً.</p>
        </header>

        {s.freePeriodEnabled && (
          <div className="rounded-2xl border bg-[#7C5CFF]/10 border-[#7C5CFF]/30 p-4 md:p-5 mb-10 flex items-start gap-3">
            <span aria-hidden className="text-xl shrink-0">🎁</span>
            <div>
              <h2 className="font-bold text-[#B69CFF] text-base mb-1">فترة تجريبية مجانية</h2>
              <p className="text-sm text-[#9AA0C0]">ي حالياً جميع الميزات متاحة مجانًا. لا حاجة للدفع الآن — يمكنك الاستمتاع بكل ما في المنصة.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-12">
          <section className="rounded-3xl border border-[#2A3050] bg-[#13182E] p-6 md:p-8 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#B0BEC5] to-[#7C5CFF] opacity-60" />
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-extrabold text-[#F0E6D2]">مجاني</h2>
              {userPlan === "free" && <span className="text-xs font-bold bg-[#B0BEC5]/20 text-[#B0BEC5] px-2.5 py-1 rounded-full">الحالي</span>}
            </div>
            <p className="text-[#9AA0C0] text-sm mb-6">ابدأ الآن — كل ما تحتاجه للتجربة بدون أي دفع.</p>
            <ul className="space-y-3 mb-8">
              {["مساعد ذكاء اصطناعي (10/3س + 6 صور/5س)", "مستويات ودوريات", "متجر الكوينز", "عجلة الحظ (بعد دراسة)", "حدود الذكاء (محدودة)"].map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm"><span aria-hidden className="text-amber-400 text-base">✓</span><span className="text-[#E7E9F5] font-medium">{f}</span></li>
              ))}
            </ul>
            <div className="pt-4 border-t border-[#2A3050]">
              <a href="/dashboard" className="inline-block w-full text-center rounded-xl bg-[#B0BEC5]/10 hover:bg-[#B0BEC5]/20 text-[#B0BEC5] font-bold py-3.5 transition">متاح مجانًا حاليًا</a>
            </div>
          </section>

          <section className="rounded-3xl border border-[#7C5CFF]/40 bg-gradient-to-b from-[#1A1030] to-[#13182E] p-6 md:p-8 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#B69CFF] to-[#F0E6D2] opacity-80" />
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-extrabold text-[#F0E6D2]">مميز</h2>
              {userPlan === "premium" && <span className="text-xs font-bold bg-[#B69CFF]/20 text-[#B69CFF] px-2.5 py-1 rounded-full">الحالي</span>}
            </div>
            <p className="text-[#9AA0C0] text-sm mb-6">كل مزايا المنصة — AI غير محدود — دعم مباشر — ميزات متقدمة.</p>
            <ul className="space-y-3 mb-8">
              {["مساعد ذكاء اصطناعي (غير محدود)", "مستويات ودوريات", "متجر الكوينز", "عجلة الحظ", "حدود الذكاء (غير محدودة)", "دعم مباشر (مستقبل)"].map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm"><span aria-hidden className="text-[#B69CFF] text-base">✓</span><span className="text-[#E7E9F5] font-medium">{f}</span></li>
              ))}
            </ul>
            <div className="pt-4 border-t border-[#2A3050]">
              <a href={s.paymentsEnabled ? "/contact" : "/dashboard"} className={`inline-block w-full text-center rounded-xl font-bold py-3.5 transition ${s.paymentsEnabled ? "bg-gradient-to-r from-[#B69CFF] to-[#F0E6D2] text-[#0D1029]" : "bg-[#B69CFF]/15 text-[#B69CFF] hover:bg-[#B69CFF]/25"}`}>{s.paymentsEnabled ? "اشترك الآن" : "متاح مجانًا حاليًا — Premium قريبًا"}</a>
              <p className="text-[11px] text-[#7A8298] mt-2">الدفع غير مفعل حالياً. عند التفعيل، ستتوفر طرق الدفع عبر WhatsApp الدعم.</p>
            </div>
          </section>
        </div>

        <section className="rounded-3xl border border-[#2A3050] bg-[#13182E] p-6 md:p-8 mb-10 overflow-x-auto">
          <h3 className="text-xl font-extrabold text-[#F0E6D2] mb-6">المقارنة</h3>
          <table className="w-full text-sm" aria-label="مقارنة الخطط">
            <thead><tr className="border-b border-[#2A3050]"><th className="text-right py-3 text-[#9AA0C0] font-semibold">الميزة</th><th className="text-center py-3 text-[#B0BEC5] font-bold">مجاني</th><th className="text-center py-3 text-[#B69CFF] font-bold">مميز</th></tr></thead>
            <tbody>
              {[["مساعد الذكاء الاصطناعي", "10/3س + 6 صور/5س", "غير محدود"], ["نظام مستويات ودوريات", "نعم", "نعم"], ["متجر الكوينز", "نعم", "نعم"], ["عجلة الحظ", "نعم (بعد دراسة)", "نعم"], ["حدود الذكاء", "محدودة", "غير محدودة"], ["دعم مباشر", "—", "نعم (مستقبل)"]].map((row) => (
                <tr key={row[0]} className="border-b border-[#20283A]/60"><td className="py-3 text-[#E7E9F5] font-medium">{row[0]}</td><td className="py-3 text-center text-[#B0BEC5]">{row[1]}</td><td className="py-3 text-center text-[#B69CFF]">{row[2]}</td></tr>
              ))}
            </tbody>
          </table>
        </section>

        <PlansPaymentInfo />

        <footer className="text-center text-xs text-[#7A8298] pt-6 border-t border-[#2A3050]">
          <p>Magiclly — Plans Foundation • الدفع غير مفعل حالياً • لا يوجد اشتراك • لا يوجد Stripe • لا يوجد checkout</p>
        </footer>
      </div>
    </div>
  );
}
