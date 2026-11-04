import { createClient } from "@/lib/supabase/server";
import { getPlanSettings } from "@/lib/plans/settings";
import { SITE_LINKS } from "@/lib/site-links";
import PlansUnavailable from "@/components/plans/PlansUnavailable";
import Link from "next/link";

type PlanRow = { plan_key:string; name:string|null; display_name_ar:string|null; profile_limit:number|null; messages_per_2h:number|null; uploads_daily:number|null; max_file_size_mb:number|null; file_types:string[]|null; video_audio_exclusive:boolean|null; trial_days:number|null; price_monthly:number|null; currency:string|null; is_active:boolean|null; };
// ⚠️ لا fallback: كان هنا كائن باقات كامل بالقيم القديمة (عملة وأسعار وحدود)،
// وده يعرض للمستخدم بيانات كاذبة عند فشل القراءة. القاعدة هي المصدر الوحيد.
export default async function CheckoutPage({ params }: { params: Promise<{ plan: string }> }) {
 const { plan: planKey } = await params;
 const key=(planKey||"").toLowerCase();
 const settings=await getPlanSettings();
 const supabase=await createClient();
 let plan:PlanRow|null=null;
 let loadFailed=false;
 try {
  const {data,error}=await supabase.from("subscription_plans").select("plan_key,name,display_name_ar,profile_limit,messages_per_2h,uploads_daily,max_file_size_mb,file_types,video_audio_exclusive,trial_days,price_monthly,currency,is_active").eq("plan_key",key).eq("is_active",true).maybeSingle();
  if(error) loadFailed=true;
  plan=(data as PlanRow|null)??null;
 } catch { loadFailed=true; }
 // فشل القاعدة ≠ باقة غير موجودة: الأول خطأ قابل لإعادة المحاولة، والثاني 404 منطقي.
 if(loadFailed) return (<PlansUnavailable />);
 if(!plan) return (<main dir="rtl" className="min-h-screen bg-[#0B0F1E] text-[#E7E9F5] flex items-center justify-center p-6"><div className="max-w-md text-center space-y-4"><h1 className="text-2xl font-extrabold">الباقة غير موجودة</h1><p className="text-[#9AA0C0]">لم نجد الباقة المطلوبة.</p><Link href="/plans" className="inline-block px-5 py-2.5 rounded-xl bg-violet-500/20 text-violet-300 font-bold">العودة للباقات</Link></div></main>);
 const price=plan.price_monthly && plan.price_monthly>0?`${Number(plan.price_monthly).toFixed(2)} ${plan.currency||"EGP"}`:"مجاني";
 const waBase=SITE_LINKS.whatsapp;
 const msg=`أهلاً، أريد الاشتراك في باقة ${plan.display_name_ar||plan.name||plan.plan_key} (${price}/شهر).`;
 const waHref=`${waBase}${waBase.includes("?")?"&":"?"}text=${encodeURIComponent(msg)}`;
 const features:string[]=[];
 features.push(`حتى ${plan.profile_limit??"—"} ملف/ملفات في الملف الشخصي`);
 features.push(`${plan.messages_per_2h??"—"} رسالة AI كل 3 ساعات`);
 features.push(`${plan.uploads_daily??"—"} رفع/يوم`);
 features.push(`أقصى حجم ملف ${plan.max_file_size_mb??"—"} MB`);
 if(Array.isArray(plan.file_types)&&plan.file_types.length) features.push(`أنواع الملفات: ${plan.file_types.join(", ")}`);
 features.push(plan.video_audio_exclusive?"فيديو/صوت مسموح":"بدون فيديو/صوت");
 if(plan.trial_days&&plan.trial_days>0) features.push(`تجربة مجانية ${plan.trial_days} يوم`);
 return (<main dir="rtl" className="min-h-screen bg-[#0B0F1E] text-[#E7E9F5]"><div className="max-w-3xl mx-auto px-4 py-10">
 <Link href="/plans" className="text-sm text-[#9AA0C0] hover:text-white mb-6 inline-block">← العودة للباقات</Link>
 <h1 className="text-3xl font-extrabold mb-2">صفحة الدفع</h1>
 <p className="text-[#9AA0C0] mb-8">تفاصيل الباقة وطرق الدفع المتاحة. الدفع يدوي عبر WhatsApp.</p>
 <section className="rounded-2xl border border-[#2A3050] bg-[#13182E] p-6 mb-6">
  <div className="flex items-center justify-between mb-4"><h2 className="text-2xl font-extrabold">{plan.display_name_ar||plan.name||plan.plan_key}</h2><span className="text-2xl font-extrabold text-violet-300">{price}<span className="text-sm text-[#9AA0C0]">/شهر</span></span></div>
  <ul className="space-y-2">{features.map(f=>(<li key={f} className="flex items-center gap-2 text-sm"><span className="text-emerald-400">✓</span><span className="text-[#E7E9F5]">{f}</span></li>))}</ul>
 </section>
 <section className="rounded-2xl border border-[#2A3050] bg-[#13182E] p-6 mb-6">
  <h2 className="text-xl font-extrabold mb-3">طرق الدفع المتاحة</h2>
  {settings.paymentsEnabled?(<ul className="space-y-2 text-sm text-[#9AA0C0]"><li>• Visa</li><li>• Vodafone Cash</li><li>• InstaPay</li></ul>):(<div className="rounded-xl bg-amber-400/10 border border-amber-400/30 p-3 text-amber-300 font-bold text-sm">الدفع غير مفعل حالياً. الاشتراك متاح عبر الدعم المباشر فقط.</div>)}
 </section>
 <section className="rounded-2xl border border-[#2A3050] bg-[#13182E] p-6 mb-6">
  <h2 className="text-xl font-extrabold mb-3">التفعيل</h2>
  <p className="text-sm text-[#9AA0C0] mb-4">تواصل عبر WhatsApp لإتمام الاشتراك.</p>
  <a href={waHref} target="_blank" rel="noreferrer" className="inline-block w-full text-center rounded-xl font-bold py-3.5 transition bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:brightness-110">تواصل عبر WhatsApp</a>
 </section>
 <footer className="text-center text-xs text-[#7A8298] pt-6 border-t border-[#2A3050]">Magiclly — دفع يدوي فقط</footer>
 </div></main>);
}
