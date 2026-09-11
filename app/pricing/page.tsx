import type { Metadata } from "next";
import Link from "next/link";
import { Check, Crown, Sparkles, Zap } from "lucide-react";
import { getPlanSettings } from "@/lib/plans/settings";
import { createClient } from "@/lib/supabase/server";
import {
  AGENT_LIMITS,
  FREE_TEXT_LIMIT,
  FREE_TEXT_WINDOW_HOURS,
  FREE_VISION_LIMIT,
  FREE_VISION_WINDOW_HOURS,
  GUEST_LIMIT,
  GUEST_WINDOW_HOURS,
} from "@/lib/ai/rate-limit";
import { ALL_AGENTS } from "@/lib/ai/agents/registry";

/* ==========================================================================
   /pricing — الباقات

   ⚠️ الأرقام هنا **مستوردة** من lib/ai/rate-limit.ts مش مكتوبة بالإيد.
   أي تعديل على الحدود هناك بينعكس هنا أوتوماتيك — من غير كده الصفحة
   هتقول للطلاب رقم والمنصة بتطبّق رقم تاني.

   ⚠️ الحالة الفعلية للباقات في المشروع: باقتين بس موجودين في الداتا بيز —
   `free` (الافتراضي) و`premium` (عبر entitlements kind='plan'). مفيش جدول
   plans ولا user_subscriptions، فـ Pro وUltra معروضين هنا كـ «قريبًا» من
   غير سعر، لأن عرض سعر لباقة مش موجودة بيعتبر إعلان عن حاجة مش متاحة.

   🎨 الألوان كلها من توكنز data-theme (paper/paper-2/paper-3/ink/ink-soft/
   rule/marker). مقصود: المشروع فيه ٨ ثيمات والافتراضي **فاتح**
   (indigo-light)، فأي `text-white` على `bg-slate-950` كان هيبقى أبيض على
   أبيض في الثيم الفاتح لأن --color-slate-950 متظبط على var(--paper).
   ========================================================================== */

export const metadata: Metadata = {
  title: "الباقات والأسعار",
  description:
    "باقات Magiclly: ما المتاح مجانًا اليوم بالحدود الفعلية، والباقتين الجايين (Pro وUltra) — بالأرقام الحقيقية مش التقريبية.",
};

/** أسماء عربية للوكلاء — المعرّفات من AGENT_LIMITS والوصف من registry. */
const AGENT_LABELS: Record<string, string> = {
  quiz_generator: "توليد الاختبارات",
  research: "البحث والتقارير",
  document_analyzer: "تحليل الملفات (PDF/DOCX/صور)",
  image: "توليد الصور التوضيحية",
};

function agentLabel(id: string): string {
  return AGENT_LABELS[id] || (ALL_AGENTS as Record<string, { label?: string }>)[id]?.label || id;
}

const FREE_AGENTS = Object.entries(AGENT_LIMITS);

type Tier = {
  id: string;
  name: string;
  icon: typeof Zap;
  tagline: string;
  price: string;
  priceNote: string;
  available: boolean;
  current?: boolean;
  popular?: boolean;
  features: string[];
  cta: { label: string; href: string; disabled?: boolean };
};

export default async function PricingPage() {
  const settings = await getPlanSettings();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // نفس نمط /plans بالظبط: الباقة بتتحسب من entitlements مش من عمود في profiles
  let userPlan: "free" | "premium" | "unknown" = "free";
  if (user && !user.is_anonymous) {
    try {
      const { data: ent } = await supabase.rpc("has_entitlement", {
        p_user_id: user.id,
        p_kind: "plan",
        p_value: "premium",
      });
      userPlan = ent ? "premium" : "free";
    } catch {
      userPlan = "unknown";
    }
  }

  const tiers: Tier[] = [
    {
      id: "free",
      name: "المجانية",
      icon: Sparkles,
      tagline: "كل حاجة تشتغل بيها من غير ما تدفع — بحدود زمنية واضحة.",
      price: "0",
      priceNote: "للأبد",
      available: true,
      current: userPlan === "free",
      features: [
        `${FREE_TEXT_LIMIT} رسالة ذكية كل ${FREE_TEXT_WINDOW_HOURS} ساعات`,
        `${FREE_VISION_LIMIT} تحليلات صور وملفات كل ${FREE_VISION_WINDOW_HOURS} ساعات`,
        ...FREE_AGENTS.map(
          ([id, cfg]) => `${agentLabel(id)}: ${cfg.limit} كل ${cfg.windowHours} ساعات`
        ),
        "كل النماذج المجانية المتاحة على المنصة",
        `الزائر من غير تسجيل: ${GUEST_LIMIT} طلبات كل ${GUEST_WINDOW_HOURS} ساعة`,
      ],
      cta: { label: "ابدأ مجانًا", href: "/register" },
    },
    {
      id: "pro",
      name: "الطالب المتميز (Pro)",
      icon: Zap,
      tagline: "للمذاكرة اليومية والتحضير للاختبارات — حدود أعلى بكتير.",
      price: "—",
      priceNote: "السعر يُعلن عند الإطلاق",
      available: false,
      popular: true,
      features: [
        "رسائل ذكية وتحليل ملفات بلا حدود عملية",
        "رفع حدود الوكلاء (اختبارات، بحث، ملفات، صور)",
        "فتح حدود النماذج المتقدمة",
        "أولوية في الدعم",
      ],
      cta: { label: "قريبًا", href: "/plans", disabled: true },
    },
    {
      id: "ultra",
      name: "العبقري (Ultra)",
      icon: Crown,
      tagline: "بلا حدود، للطالب اللي بيستخدم المنصة طول اليوم.",
      price: "—",
      priceNote: "السعر يُعلن عند الإطلاق",
      available: false,
      features: [
        "كل مزايا Pro",
        "أعلى أولوية في النماذج والوكلاء",
        "دعم فني مباشر",
        "وصول مبكر للميزات الجديدة",
      ],
      cta: { label: "قريبًا", href: "/plans", disabled: true },
    },
  ];

  return (
    <div dir="rtl" className="min-h-screen bg-paper text-ink px-4 py-14 sm:px-6 md:py-20">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-12">
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-4">
            اختر خطة نجاحك
          </h1>
          <p className="text-ink-soft max-w-2xl mx-auto leading-relaxed">
            الأرقام المعروضة هنا هي الحدود الفعلية المطبّقة على المنصة — مأخوذة من نفس الملف
            اللي بيطبّقها السيرفر.
          </p>
        </header>

        {/* الحالة الفعلية للدفع — من app_settings عبر getPlanSettings */}
        {!settings.paymentsEnabled && (
          <div className="rounded-2xl border border-rule bg-paper-2 p-4 md:p-5 mb-12 flex items-start gap-3 max-w-3xl mx-auto">
            <span aria-hidden className="text-xl shrink-0">
              🎁
            </span>
            <div className="text-sm leading-relaxed">
              <h2 className="font-bold mb-1">الدفع غير مفعّل حاليًا</h2>
              <p className="text-ink-soft">
                كل الميزات المتاحة اليوم مجانية. باقتا Pro وUltra لسه قيد التجهيز —
                ومعروضين هنا من غير سعر لحد ما يتفعّلوا فعليًا.
              </p>
            </div>
          </div>
        )}

        {userPlan === "premium" && (
          <div className="rounded-2xl border border-marker/40 bg-paper-2 p-4 mb-12 text-sm text-center max-w-3xl mx-auto">
            حسابك مشترك في <span className="font-bold text-marker">Premium</span> حاليًا —
            الحدود الموسّعة مفعّلة عندك.
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-14">
          {tiers.map((tier) => (
            <section
              key={tier.id}
              className={
                "relative rounded-3xl border-2 bg-paper-2 p-7 flex flex-col transition-transform hover:-translate-y-1 " +
                (tier.popular ? "border-marker/60 shadow-xl" : "border-rule")
              }
            >
              {tier.popular && (
                <div className="absolute -top-3 inset-x-0 mx-auto w-fit rounded-full bg-marker px-3 py-1 text-[11px] font-bold text-[var(--on-marker)]">
                  الأكثر طلبًا
                </div>
              )}
              {!tier.available && (
                <div className="absolute -top-3 inset-x-0 mx-auto w-fit rounded-full bg-paper-3 border border-rule px-3 py-1 text-[11px] font-bold text-ink-soft">
                  قريبًا
                </div>
              )}

              <span
                aria-hidden
                className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-rule bg-paper-3"
              >
                <tier.icon className="h-6 w-6 text-marker" />
              </span>

              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-extrabold">{tier.name}</h2>
                {tier.current && (
                  <span className="rounded-full bg-paper-3 border border-rule px-2 py-0.5 text-[10px] font-bold text-ink-soft">
                    باقتك الحالية
                  </span>
                )}
              </div>
              <p className="text-sm text-ink-soft mb-5 leading-relaxed">{tier.tagline}</p>

              <div className="mb-6">
                <span className="text-4xl font-extrabold">{tier.price}</span>
                {tier.price === "0" && <span className="text-ink-soft"> ج.م</span>}
                <span className="text-ink-soft text-sm"> / {tier.priceNote}</span>
              </div>

              <ul className="space-y-3 mb-7 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-marker" aria-hidden />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {tier.cta.disabled ? (
                <span
                  aria-disabled="true"
                  className="block w-full rounded-xl border border-rule bg-paper-3 py-3 text-center text-sm font-bold text-ink-soft"
                >
                  {tier.cta.label}
                </span>
              ) : (
                <Link
                  href={tier.cta.href}
                  className="block w-full rounded-xl bg-marker py-3 text-center text-sm font-bold text-[var(--on-marker)] transition hover:opacity-90"
                >
                  {tier.cta.label}
                </Link>
              )}
            </section>
          ))}
        </div>

        {/* المقارنة — حدود الخطة المجانية الحقيقية مقابل الباقات الجاية */}
        <section className="rounded-3xl border border-rule bg-paper-2 p-6 md:p-8 mb-12 overflow-x-auto">
          <h2 className="text-xl font-extrabold mb-6">المقارنة</h2>
          <table className="w-full text-sm" aria-label="مقارنة الباقات">
            <thead>
              <tr className="border-b border-rule">
                <th className="py-3 text-right font-semibold text-ink-soft">الاستخدام</th>
                <th className="py-3 text-center font-bold">المجانية</th>
                <th className="py-3 text-center font-bold text-marker">Pro</th>
                <th className="py-3 text-center font-bold">Ultra</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-rule/60">
                <td className="py-3">الرسائل الذكية</td>
                <td className="py-3 text-center">
                  {FREE_TEXT_LIMIT} / {FREE_TEXT_WINDOW_HOURS}س
                </td>
                <td className="py-3 text-center text-marker">بلا حدود عملية</td>
                <td className="py-3 text-center">بلا حدود عملية</td>
              </tr>
              <tr className="border-b border-rule/60">
                <td className="py-3">تحليل الصور والملفات</td>
                <td className="py-3 text-center">
                  {FREE_VISION_LIMIT} / {FREE_VISION_WINDOW_HOURS}س
                </td>
                <td className="py-3 text-center text-marker">بلا حدود عملية</td>
                <td className="py-3 text-center">بلا حدود عملية</td>
              </tr>
              {FREE_AGENTS.map(([id, cfg]) => (
                <tr key={id} className="border-b border-rule/60">
                  <td className="py-3">{agentLabel(id)}</td>
                  <td className="py-3 text-center">
                    {cfg.limit} / {cfg.windowHours}س
                  </td>
                  <td className="py-3 text-center text-marker">بلا حدود عملية</td>
                  <td className="py-3 text-center">بلا حدود عملية</td>
                </tr>
              ))}
              <tr>
                <td className="py-3">زائر من غير حساب</td>
                <td className="py-3 text-center">
                  {GUEST_LIMIT} / {GUEST_WINDOW_HOURS}س
                </td>
                <td className="py-3 text-center">—</td>
                <td className="py-3 text-center">—</td>
              </tr>
            </tbody>
          </table>
        </section>

        <p className="text-xs text-ink-soft leading-relaxed max-w-3xl mx-auto text-center">
          ملاحظة: النماذج المتقدمة المقفولة بتتفتح عبر «Study Booster» من متجر الكوينز،
          ودي ميزة مستقلة عن الباقات. للباقة المتاحة فعليًا اليوم (Premium) وتفاصيل الدفع،
          شوف{" "}
          <Link href="/plans" className="text-marker underline">
            صفحة الخطط
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
