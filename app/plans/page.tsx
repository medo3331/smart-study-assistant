import { CREDIT_COSTS } from "@/lib/ai/credit-pricing";
import { getPlanSettings } from "@/lib/plans/settings";
import { createClient } from "@/lib/supabase/server";
import PremiumTrialCard from "@/components/plans/PremiumTrialCard";
import PlansPaymentInfo from "@/components/plans/PaymentInfo";

type PlanRow = {
  plan_key: string;
  name: string | null;
  display_name_ar: string | null;
  profile_limit: number | null;
  messages_per_2h: number | null;
  uploads_daily: number | null;
  max_file_size_mb: number | null;
  file_types: string[] | null;
  video_audio_exclusive: boolean | null;
  trial_days: number | null;
  price_monthly: number | null;
  currency: string | null;
  is_active: boolean | null;
};

const PLAN_META: Record<string, { accent: string; border: string; badge?: string; icon: string }> = {
  free: { accent: "from-slate-400 to-slate-600", border: "border-slate-700", icon: "🌱" },
  pro: { accent: "from-violet-500 to-fuchsia-500", border: "border-violet-500/50", badge: "الأكثر شعبية", icon: "⚡" },
  ultra: { accent: "from-amber-400 to-orange-500", border: "border-amber-500/50", badge: "أقصى أداء", icon: "🚀" },
};

function planFeatures(p: PlanRow): string[] {
  const out: string[] = [];
  out.push(`حتى ${p.profile_limit ?? "—"} ملف/ملفات في الملف الشخصي`);
  out.push(`${p.messages_per_2h ?? "—"} رسالة AI كل 3 ساعات`);
  out.push(`${p.uploads_daily ?? "—"} رفع/يوم`);
  out.push(`أقصى حجم ملف ${p.max_file_size_mb ?? "—"} MB`);
  if (Array.isArray(p.file_types) && p.file_types.length) out.push(`أنواع الملفات: ${p.file_types.join(", ")}`);
  out.push(p.video_audio_exclusive ? "فيديو/صوت مسموح" : "بدون فيديو/صوت");
  if (p.trial_days && p.trial_days > 0) out.push(`تجربة مجانية ${p.trial_days} يوم`);
  return out;
}

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

  const { data: plansData } = await supabase
    .from("subscription_plans")
    .select("plan_key, name, display_name_ar, profile_limit, messages_per_2h, uploads_daily, max_file_size_mb, file_types, video_audio_exclusive, trial_days, price_monthly, currency, is_active")
    .eq("is_active", true)
    .order("plan_key", { ascending: true });

  const plans = (plansData ?? []) as PlanRow[];

  return (
    <div dir="rtl" className="min-h-screen bg-[#0D1029] text-[#E7E9F5] px-4 sm:px-6 md:px-10 py-10 md:py-16">
      <div className="max-w-6xl mx-auto">
        <header className="mb-10 md:mb-14 text-center">
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight leading-tight mb-3 text-[#F0E6D2]">خطط Magiclly</h1>
          <p className="text-base md:text-lg text-[#9AA0C0] leading-relaxed max-w-2xl mx-auto">اختر الباقة التي تناسبك. كل ميزة مبنية على ما موجود فعلاً في المنصة.</p>
        </header>

        {s.freePeriodEnabled && (
          <div className="rounded-2xl border bg-[#7C5CFF]/10 border-[#7C5CFF]/30 p-4 md:p-5 mb-10 flex items-start gap-3">
            <span aria-hidden className="text-xl shrink-0">🎁</span>
            <div>
              <h2 className="font-bold text-[#B69CFF] text-base mb-1">فترة تجريبية مجانية</h2>
              <p className="text-sm text-[#9AA0C0]">حالياً جميع الميزات متاحة مجانًا. لا حاجة للدفع الآن — يمكنك الاستمتاع بكل ما في المنصة.</p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 mb-12">
          {plans.map((p) => {
            const meta = PLAN_META[p.plan_key] || PLAN_META.free;
            const isCurrent = (p.plan_key === "free" && userPlan === "free") || (p.plan_key !== "free" && userPlan === "premium");
            return (
              <section key={p.plan_key} className={`relative rounded-3xl border ${meta.border} bg-[#13182E] p-6 md:p-8 shadow-xl overflow-hidden flex flex-col`}>
                <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${meta.accent} opacity-80`} />
                {meta.badge && (
                  <span className="absolute top-4 left-4 text-[10px] font-bold bg-white/10 text-white px-2.5 py-1 rounded-full">{meta.badge}</span>
                )}
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-extrabold text-[#F0E6D2] flex items-center gap-2">
                    <span aria-hidden>{meta.icon}</span>
                    {p.display_name_ar || p.name || p.plan_key}
                  </h2>
                  {isCurrent && <span className="text-xs font-bold bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-full">الحالي</span>}
                </div>
                <p className="text-2xl font-extrabold text-[#F0E6D2] mb-2">{p.price_monthly && p.price_monthly > 0 ? `${Number(p.price_monthly).toFixed(2)} ${p.currency || "USD"}/شهر` : "مجاني"}</p>
                <p className="text-[#9AA0C0] text-sm mb-6">
                  {p.plan_key === "free" ? "ابدأ الآن — كل ما تحتاجه للتجربة بدون أي دفع." : p.plan_key === "pro" ? "كل مزايا المنصة — AI غير محدود — دعم مباشر — ميزات متقدمة." : "أقصى أداء وحدود أعلى للاستخدام 집중."}
                </p>
                <ul className="space-y-3 mb-8 flex-1">
                  {planFeatures(p).map((f) => (
                    <li key={f} className="flex items-center gap-3 text-sm">
                      <span aria-hidden className="text-emerald-400 text-base">✓</span>
                      <span className="text-[#E7E9F5] font-medium">{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="pt-4 border-t border-[#2A3050]">
                  {p.plan_key === "free" ? (
                    <a href="/dashboard" className="inline-block w-full text-center rounded-xl bg-slate-500/10 hover:bg-slate-500/20 text-slate-300 font-bold py-3.5 transition">متاح مجانًا</a>
                  ) : (
                    <a href="/contact" className={`inline-block w-full text-center rounded-xl font-bold py-3.5 transition ${s.paymentsEnabled ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white" : "bg-violet-500/15 text-violet-300 hover:bg-violet-500/25"}`}>
                      {s.paymentsEnabled ? "اشترك الآن" : "تواصل للاشتراك"}
                    </a>
                  )}
                  <p className="text-[11px] text-[#7A8298] mt-2 text-center">
                    {s.paymentsEnabled ? "الدفع مفعل — تواصل عبر WhatsApp للاشتراك." : "الدفع غير مفعل حالياً."}
                  </p>
                </div>
              </section>
            );
          })}
        </div>

        <div className="rounded-2xl border border-[#2A3050] bg-[#13182E] p-5 mb-8">
          <h2 className="font-bold mb-3">تكلفة عمليات AI (credits)</h2>
          <ul className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            {Object.entries(CREDIT_COSTS).map(([k, v]) => (
              <li key={k} className="flex justify-between border-b border-[#2A3050] py-1">
                <span>{k}</span>
                <span className="font-bold">{v}</span>
              </li>
            ))}
          </ul>
        </div>
        <PremiumTrialCard />
        <PlansPaymentInfo />

        <footer className="text-center text-xs text-[#7A8298] pt-6 border-t border-[#2A3050]">
          <p>Magiclly — Plans • {s.paymentsEnabled ? "الدفع مفعل" : "الدفع غير مفعل حالياً"} • لا يوجد Stripe • لا يوجد checkout</p>
        </footer>
      </div>
    </div>
  );
}

