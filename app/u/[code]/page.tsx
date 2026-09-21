import { redirect } from "next/navigation";

export default async function UserPublicPage({ params }: { params: Promise<{ code?: string }> }) {
  const sp = await params;
  const code = sp?.code || "";

  // Basic validation: must match MAG-XXXXXX pattern
  if (!/^MAG-[A-Z0-9]{6}$/i.test(code)) {
    redirect("/?error=كود_غير_صالح");
  }

  // Minimal safe display — no sensitive data exposed
  return (
    <div className="min-h-screen bg-[#090d16] text-white p-10 flex items-center justify-center dir-rtl">
      <div className="max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-8 space-y-4 shadow-xl text-center">
        <h1 className="text-2xl font-extrabold text-amber-400">كود المستخدم</h1>
        <p className="text-sm text-slate-400">تم التعرف على كود: <span className="font-mono text-amber-300">{code}</span></p>
        <p className="text-xs text-slate-500">هذا رابط عام — لا يحتوي على بيانات حساسة. لتفعيل الاشتراك، يجب التواصل مع الدعم عبر واتساب مع إرسال هذا الكود.</p>
        <div className="pt-4">
          <a href="/" className="inline-block bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-6 py-2.5 rounded-xl text-sm transition">العودة للرئيسية</a>
        </div>
      </div>
    </div>
  );
}
