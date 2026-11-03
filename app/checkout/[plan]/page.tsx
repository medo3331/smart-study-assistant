import { createClient } from "@/lib/supabase/server";
import { getPlanSettings } from "@/lib/plans/settings";
import { SITE_LINKS } from "@/lib/site-links";
import Link from "next/link";

type PlanRow = { plan_key:string; name:string|null; display_name_ar:string|null; profile_limit:number|null; messages_per_2h:number|null; uploads_daily:number|null; max_file_size_mb:number|null; file_types:string[]|null; video_audio_exclusive:boolean|null; trial_days:number|null; price_monthly:number|null; currency:string|null; is_active:boolean|null; };
const FALLBACK: Record<string,PlanRow> = {
 free:{plan_key:"free",name:"Free",display_name_ar:"مجاني",profile_limit:5,messages_per_2h:20,uploads_daily:5,max_file_size_mb:20,file_types:["pdf","text","image"],video_audio_exclusive:false,trial_days:0,price_monthly:0,currency:"USD",is_active:true},
 pro:{plan_key:"pro",name:"Pro",display_name_ar:"Pro",profile_limit:30,messages_per_2h:60,uploads_daily:30,max_file_size_mb:150,file_types:["pdf","text","image","video","audio"],video_audio_exclusive:true,trial_days:7,price_monthly:9.99,currency:"USD",is_active:true},
 ultra:{plan_key:"ultra",name:"Ultra",display_name_ar:"Ultra",profile_limit:100,messages_per_2h:200,uploads_daily:60,max_file_size_mb:1024,file_types:["pdf","text","image","video","audio"],video_audio_exclusive:true,trial_days:14,price_monthly:19.99,currency:"USD",is_active:true},
};
export default async function CheckoutPage({ params }: { params: Promise<{ plan: string }> }) {
 const { plan: planKey } = await params;
 const key=(planKey||"").toLowerCase();
 const settings=await getPlanSettings();
 const supabase=await createClient();
 let plan:PlanRow|null=null;
 try { const {data}=await supabase.from("subscription_plans").select("plan_key,name,display_name_ar,profile_limit,messages_per_2h,uploads_daily,max_file_size_mb,file_types,video_audio_exclusive,trial_days,price_monthly,currency,is_active").eq("plan_key",key).eq("is_active",true).maybeSingle(); plan=(data as PlanRow|null)??null;}catch{plan=null;}
 if(!plan) plan=FALLBACK[key]??null;
 if(!plan) return (<main dir="rtl" className="min-h-screen bg-[#0B0F1E] text-[#E7E9F5] flex items-center justify-center p-6"><div className="max-w-md text-center space-y-4"><h1 className="text-2xl font-extrabold">الباقة غير موجودة</h1><p className="text-[#9AA0C0]">لم نجد الباقة المطلوبة.</p><Link href="/plans" className="inline-block px-5 py-2.5 rounded-xl bg-violet-500/20 text-violet-300 font-bold">العودة للباقات</Link></div></main>);
 const price=plan.price_monthly && plan.price_monthly>0?`${Number(plan.price_monthly).toFixed(2)} ${plan.currency||"USD"}`:"مجاني";
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
