import Link from "next/link";
import QRCode from "qrcode";
import { ArrowRight, QrCode, RefreshCw, ShieldAlert } from "lucide-react";
import { requireAdminPermission } from "@/lib/admin/auth-check";
import { hasPermission } from "@/lib/auth-roles";
import { createServiceClient } from "@/lib/supabase/admin";
import { regenerateUserCodeFormAction } from "@/app/admin/actions/user-code-form-action";
import { AdminCard, AdminNotice, AdminPageHeader } from "@/components/admin/ui";
import { SITE_URL } from "@/lib/seo";

/**
 * 👤 تفاصيل المستخدم + QR Code (المرحلة 3).
 *
 * - العرض محكوم بـ users.read؛ إعادة التوليد بـ users.regenerate_code — الفحص
 *   الحقيقي جوه الـserver action نفسه (إخفاء الزر هنا مجرد UX).
 * - الـQR بيشفّر الرابط العام الكامل `${SITE_URL}/u/<code>` — الدليل إن
 *   SITE_URL (lib/seo.ts:29) هو المصدر الكنسي للدومين و/u/[code] هو المسار
 *   العام الفعلي للكود. مفيش identifier موازٍ: المحتوى هو public_user_code نفسه.
 * - التوليد server-side بمكتبة qrcode (SVG محلي — بلا API خارجي وبلا endpoint
 *   جديد؛ التحميل عبر data URI).
 */
export default async function AdminUserDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { user, supabase } = await requireAdminPermission("users.read");

  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("id, display_name, email, persona, role, public_user_code")
    .eq("id", id)
    .maybeSingle();

  const canRegenerate = await hasPermission(supabase, user.id, user.email ?? null, "users.regenerate_code");

  const code = (profile?.public_user_code as string | null) ?? null;
  const profileUrl = code ? `${SITE_URL}/u/${code}` : null;
  const qrSvg = profileUrl
    ? await QRCode.toString(profileUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M", width: 220 })
    : null;
  const qrDataUri = qrSvg ? `data:image/svg+xml;base64,${Buffer.from(qrSvg).toString("base64")}` : null;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="تفاصيل المستخدم + QR Code"
        subtitle="الكود العام (MAG-XXX-XXXX) وQR قابل للتحميل + توليد/إعادة توليد محكوم بالصلاحيات ومسجّل في audit_log."
        badge="users.read"
        permissionKey="users.regenerate_code"
      />

      {sp.success ? <AdminNotice tone="emerald">تم: {sp.success}</AdminNotice> : null}
      {sp.error ? <AdminNotice tone="rose">خطأ: {sp.error}</AdminNotice> : null}

      <div className="text-xs">
        <Link href="/admin/users" className="inline-flex items-center gap-1 text-slate-400 hover:text-amber-300">
          <ArrowRight size={14} /> العودة لإدارة المستخدمين
        </Link>
      </div>


      {!profile ? (
        <AdminCard tone="rose" title="المستخدم غير موجود">
          <p className="text-xs text-slate-300">
            مفيش صف في <code>profiles</code> بالمعرّف: <code dir="ltr" className="font-mono">{id}</code>
          </p>
        </AdminCard>
      ) : (
        <>
          <AdminCard title="بيانات المستخدم" tone="default">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-slate-500">الاسم</dt>
                <dd className="text-slate-200">{profile.display_name || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">الإيميل</dt>
                <dd className="text-slate-200" dir="ltr">{profile.email || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">الشخصية / الدور</dt>
                <dd className="text-slate-200">{profile.persona || "—"} / {profile.role || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">UUID</dt>
                <dd className="text-slate-200 font-mono" dir="ltr">{profile.id}</dd>
              </div>
            </dl>
          </AdminCard>

          <AdminCard title="كود المستخدم + QR" tone="amber">
            {code && qrSvg && qrDataUri ? (
              <div className="flex flex-col items-center gap-4 py-2">
                <div
                  className="bg-white p-3 rounded-2xl shadow-lg [&>svg]:block"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
                <code className="font-mono text-amber-300 text-xl font-bold" dir="ltr">{code}</code>
                <p className="text-[11px] text-slate-400 font-mono" dir="ltr">{profileUrl}</p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <a
                    href={qrDataUri}
                    download={`${code}.svg`}
                    className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition"
                  >
                    <QrCode size={14} /> تحميل QR (SVG)
                  </a>
                  <Link href={`/u/${code}`} target="_blank" className="text-xs text-slate-300 underline hover:text-amber-300">
                    فتح الرابط العام
                  </Link>
                </div>
              </div>
            ) : (
              <AdminNotice tone="rose">
                المستخدم ده ماعندوش <code>public_user_code</code> (مثلًا صف قديم قبل تفعيل الـtrigger).
                زر التوليد بالأسفل بيغطي الحالة دي — نفس العملية بتعمل توليد أول مرة.
              </AdminNotice>
            )}
          </AdminCard>

          <AdminCard title={code ? "إعادة توليد الكود" : "توليد كود"} tone="rose">
            <p className="text-[11px] text-slate-300 leading-relaxed flex items-start gap-2">
              <ShieldAlert size={16} className="text-rose-400 shrink-0 mt-0.5" />
              <span>
                تحذير: إعادة التوليد بتبطل الكود القديم فورًا (أي QR مطبوع أو متشارك هيتحول لكود غير صالح)،
                وبتتسجّل في <code>audit_log</code> بـ <code>action=qr_regenerate</code> مع الكود القديم والجديد.
              </span>
            </p>
            {canRegenerate ? (
              <form action={regenerateUserCodeFormAction}>
                <input type="hidden" name="target_user_id" value={profile.id} />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition"
                >
                  <RefreshCw size={14} /> {code ? "إعادة توليد الكود" : "توليد كود جديد"}
                </button>
              </form>
            ) : (
              <AdminNotice tone="default">
                ليس لديك صلاحية <code>users.regenerate_code</code> (Owner/Admin) — الزر مخفي،
                والفحص الحقيقي بيتم جوه الـserver action حتى لو وصل الطلب بطريقة تانية.
              </AdminNotice>
            )}
          </AdminCard>
        </>
      )}
    </div>
  );
}
