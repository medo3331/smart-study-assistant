import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { SITE_URL } from "@/lib/seo";

export default async function UserPublicPage({ params }: { params: Promise<{ code?: string }> }) {
  const sp = await params;
  const code = sp?.code || "";

  // Basic validation: must match the canonical generator format MAG-XXX-XXXX
  // (db/epic6-user-code.sql — generate_public_user_code). Phase 1.5: كان
  // /^MAG-[A-Z0-9]{6}$/i وده بيرفض كل الأكواد اللي الـtrigger بيولّدها فعليًا.
  if (!/^MAG-[A-Z0-9]{3}-[A-Z0-9]{4}$/i.test(code)) {
    redirect("/?error=كود_غير_صالح");
  }

  // Phase 3 (QR): الـQR بيشفّر الرابط العام الكامل — نفس المعلومة اللي الصفحة
  // بتعرضها أصلًا (مفيش بيانات جديدة بتتكشف). قراءة فقط: مفيش هنا أي زر
  // توليد/تعديل — التوليد/إعادة التوليد متاح للأدمن فقط من /admin/users/[id].
  // التوليد server-side بمكتبة qrcode (SVG محلي — بلا API خارجي وبلا endpoint).
  const profileUrl = `${SITE_URL}/u/${code}`;
  const qrSvg = await QRCode.toString(profileUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M", width: 200 });
  const qrDataUri = `data:image/svg+xml;base64,${Buffer.from(qrSvg).toString("base64")}`;

  // Minimal safe display — no sensitive data exposed
  return (
    <div className="min-h-screen bg-[#090d16] text-white p-10 flex items-center justify-center dir-rtl">
      <div className="max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-8 space-y-4 shadow-xl text-center">
        <h1 className="text-2xl font-extrabold text-amber-400">كود المستخدم</h1>
        <p className="text-sm text-slate-400">تم التعرف على كود: <span className="font-mono text-amber-300">{code}</span></p>
        <div className="flex flex-col items-center gap-3 py-2">
          <div
            className="bg-white p-3 rounded-2xl inline-block shadow-lg [&>svg]:block"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <a href={qrDataUri} download={`${code}.svg`} className="text-[11px] text-amber-400 underline hover:text-amber-300">
            تحميل QR (SVG)
          </a>
        </div>
        <p className="text-xs text-slate-500">هذا رابط عام — لا يحتوي على بيانات حساسة، والـQR بيشفّر نفس هذا الرابط. لتفعيل الاشتراك، يجب التواصل مع الدعم عبر واتساب مع إرسال هذا الكود.</p>
        <div className="pt-4">
          <a href="/" className="inline-block bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-6 py-2.5 rounded-xl text-sm transition">العودة للرئيسية</a>
        </div>
      </div>
    </div>
  );
}
