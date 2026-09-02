/* Server component — reads billing settings server-side, no client fetch needed */
import { getPlanSettings } from "@/lib/plans/settings";
import { Shield } from "lucide-react";

export default async function PlansPaymentInfo() {
  const s = await getPlanSettings();
  const payOn = s.paymentsEnabled === true;

  return (
    <div dir="rtl" className="rounded-2xl border border-[#2A3050] bg-[#13182E] p-5 space-y-4 mb-10 shadow-xl">
      <h2 className="font-extrabold text-xl text-[#F0E6D2]">التفعيل المدفوع</h2>

      {payOn ? (
        <>
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-emerald-300 text-sm font-semibold">
            حالة التفعيل: مفعل (من إعدادات Admin)
          </div>
          <div className="space-y-2">
            <h3 className="font-bold text-[#B69CFF]">طرق الدفع المتاحة</h3>
            <ul className="space-y-1 text-sm text-[#9AA0C0]">
              <li>• Visa — سيتم الإعلان عن البيانات عند التفعيل الكامل</li>
              <li>• Vodafone Cash — سيتم الإعلان عن البيانات عند التفعيل الكامل</li>
              <li>• InstaPay — سيتم الإعلان عن البيانات عند التفعيل الكامل</li>
            </ul>
          </div>
          <div className="rounded-xl bg-[#7C5CFF]/10 border border-[#7C5CFF]/30 p-3 text-[#B69CFF] font-semibold text-sm">
            تواصل مع دعم Magiclly للتفعيل عبر WhatsApp (سيتم الإعلان عن قناة الدعم قريبًا)
          </div>
        </>
      ) : (
        <>
          <div className="rounded-xl bg-amber-400/10 border border-amber-400/30 p-3 text-amber-300 font-bold text-sm">
            حالة التفعيل: معطّل حاليًا — لا يوجد دفع نشط
          </div>
          <p className="text-sm text-[#9AA0C0] leading-relaxed">
            تسجي Premium متاح عبر الدعم المباشر فقط عند تفعيل الوضع المدفوع من لوحة Admin.
          </p>
          <div className="rounded-xl bg-[#2A3050]/60 border border-[#2A3050] p-3 text-xs text-[#7A8298] leading-relaxed">
            <span className="font-bold text-[#B69CFF]">طرق الدفع المستقبلية:</span> Visa • Vodafone Cash • InstaPay — سيتم الإعلان عن التفاصيل عند التفعيل الكامل. لا يوجد رقم واتساب أو تفاصيل مالية حالياً.
          </div>
        </>
      )}

      <div className="flex items-center gap-2 text-[11px] text-[#7A8298]">
        <Shield size={14} aria-hidden />
        <span>الإعدادات من السيرفر — لا يمكن تعديلها من المتصفح.</span>
      </div>
    </div>
  );
}
