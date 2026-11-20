import Link from "next/link";
import QRCode from "qrcode";
import { Activity, ArrowRight, BookOpen, CheckCircle2, Coins, Crown, FileText, FolderOpen, GraduationCap, MessageSquare, QrCode, RefreshCw, ShieldAlert } from "lucide-react";
import { requireAdminPermission } from "@/lib/admin/auth-check";
import { hasPermission } from "@/lib/auth-roles";
import { createServiceClient } from "@/lib/supabase/admin";
import { regenerateUserCodeFormAction } from "@/app/admin/actions/user-code-form-action";
import { AdminCard, AdminNotice, AdminPageHeader } from "@/components/admin/ui";
import { getUserConsumption } from "@/lib/admin/user-consumption";
import { getUserProfileInsights } from "@/lib/admin/user-profile-insights";
import { SITE_URL } from "@/lib/seo";

/** تنسيق حجم الملف بالبايت لوحدة مقروءة */
function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/** تاريخ مختصر + تمييز انتهاء الصلاحية: منتهٍ = rose، أقرب من 7 أيام = amber */
function expiryBadge(iso: string | null): { text: string; cls: string } {
  if (!iso) return { text: "بدون انتهاء", cls: "text-slate-300" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { text: iso, cls: "text-slate-300" };
  const text = d.toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
  const diff = d.getTime() - Date.now();
  if (diff <= 0) return { text: `${text} — منتهٍ`, cls: "text-rose-400 font-bold" };
  if (diff <= 7 * 86400_000) return { text: `${text} — يقارب الانتهاء`, cls: "text-amber-300 font-bold" };
  return { text, cls: "text-emerald-300" };
}

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
    .select("id, display_name, email, persona, role, public_user_code, education_stage_id, education_grade_id, education_track_id, created_at")
    .eq("id", id)
    .maybeSingle();

  const [canRegenerate, consumption, insights, authUserResult, stageResult, gradeResult, trackResult] = await Promise.all([
    hasPermission(supabase, user.id, user.email ?? null, "users.regenerate_code"),
    profile ? getUserConsumption(id) : Promise.resolve(null),
    profile ? getUserProfileInsights(id) : Promise.resolve(null),
    service.auth.admin.getUserById(id),
    profile?.education_stage_id ? service.from("education_stages").select("name").eq("id", profile.education_stage_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    profile?.education_grade_id ? service.from("education_grades").select("name").eq("id", profile.education_grade_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    profile?.education_track_id ? service.from("education_tracks").select("name").eq("id", profile.education_track_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  const profileEmail = (profile?.email as string | null) || authUserResult.data.user?.email || null;
  const education = [stageResult.data?.name, gradeResult.data?.name, trackResult.data?.name].filter(Boolean).join(" · ");

  const code = (profile?.public_user_code as string | null) ?? null;
  const profileUrl = code ? `${SITE_URL}/u/${code}` : null;
  const qrSvg = profileUrl
    ? await QRCode.toString(profileUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M", width: 220 })
    : null;
  const qrDataUri = qrSvg ? `data:image/svg+xml;base64,${Buffer.from(qrSvg).toString("base64")}` : null;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="ملف الطالب والتحليلات"
        subtitle="الملف الشخصي، ما يدرسه الطالب، التقدم، الاستهلاك، نشاط الذكاء الاصطناعي، والاشتراك — جميع السجلات مرتبطة بـUUID الحساب؛ كود MAG معرّف مساعد."
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
                <dd className="text-slate-200" dir="ltr">{profileEmail || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">المرحلة / الصف / المسار</dt>
                <dd className="text-slate-200">{education || "غير مسجل"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">الشخصية / الدور</dt>
                <dd className="text-slate-200">{profile.persona || "—"} / {profile.role || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">UUID الموحد (مفتاح الربط)</dt>
                <dd className="text-slate-200 font-mono break-all" dir="ltr">{profile.id}</dd>
              </div>
              <div>
                <dt className="text-slate-500">كود MAG</dt>
                <dd className="text-amber-300 font-mono" dir="ltr">{profile.public_user_code || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">تاريخ التسجيل</dt>
                <dd className="text-slate-200">{profile.created_at ? new Date(profile.created_at).toLocaleDateString("ar-EG") : "—"}</dd>
              </div>
            </dl>
          </AdminCard>

          <AdminCard title="الاستهلاك والمزايا" tone="purple">
            {consumption && consumption.errors.length > 0 ? (
              <AdminNotice tone="amber">
                أرقام N/A: {consumption.errors.join(" | ")}
              </AdminNotice>
            ) : null}
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="flex items-start gap-2">
                <FolderOpen size={15} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <dt className="text-slate-500">الملفات المرفوعة</dt>
                  <dd className="text-slate-200">
                    {consumption?.filesCount !== null && consumption !== null
                      ? `${consumption.filesCount} ملف (${fmtBytes(consumption.filesBytes ?? 0)})`
                      : "N/A — غير قابل للتحقق من هنا"}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <MessageSquare size={15} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <dt className="text-slate-500">رسائل AI المستهلكة (حجز رصيد)</dt>
                  <dd className="text-slate-200">
                    {consumption?.messagesCount !== null && consumption !== null
                      ? `${consumption.messagesCount} رسالة`
                      : "N/A — غير قابل للتحقق من هنا"}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Coins size={15} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <dt className="text-slate-500">رصيد النقاط الحالي (مجموع ai_credit_ledger.delta)</dt>
                  <dd className="text-slate-200">
                    {consumption?.creditsBalance !== null && consumption !== null
                      ? consumption.creditsBalance
                      : "N/A — غير قابل للتحقق من هنا"}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <MessageSquare size={15} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <dt className="text-slate-500">الحصص الحالية (24h/يوم)</dt>
                  <dd className="text-slate-200">
                    {consumption?.quota ? (
                      <>
                        رسائل: {consumption.quota.messages_24h}
                        {consumption.quota.message_limit != null ? ` / ${consumption.quota.message_limit}` : ""} · رفعات: {consumption.quota.uploads_today}
                        {consumption.quota.upload_limit != null ? ` / ${consumption.quota.upload_limit}` : ""}
                      </>
                    ) : "N/A — غير قابل للتحقق من هنا"}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Crown size={15} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <dt className="text-slate-500">الخطة الحالية (entitlements)</dt>
                  <dd className="text-slate-200">
                    {consumption === null ? (
                      "—"
                    ) : consumption.currentPlan ? (
                      <span className={consumption.currentPlan.is_trial ? "text-amber-300 font-bold" : "text-emerald-300 font-bold"}>
                        {consumption.currentPlan.is_trial ? "تجربة" : consumption.currentPlan.value}
                        {consumption.currentPlan.expires_at
                          ? ` — ${expiryBadge(consumption.currentPlan.expires_at).text}`
                          : ""}
                      </span>
                    ) : (
                      <span className="text-slate-300">Free (مفيش خطة نشطة)</span>
                    )}
                  </dd>
                </div>
              </div>
            </dl>

            {consumption?.activeSubscription ? (
              (() => {
                const exp = expiryBadge(consumption.activeSubscription.expires_at);
                return (
                  <div className="mt-3 border-t border-slate-700 pt-3 text-xs">
                    <p className="text-slate-500 mb-1">آخر اشتراك غير ملغى (subscription_activations)</p>
                    <p className="text-slate-200">
                      <span className="bg-amber-500/15 text-amber-300 px-1.5 py-0.5 rounded text-[10px] font-bold">
                        {consumption.activeSubscription.plan_key}
                      </span>{" "}
                      لمدة {consumption.activeSubscription.duration_days} يوم — فُعّل{" "}
                      <span dir="ltr">{consumption.activeSubscription.created_at.slice(0, 10)}</span> —{" "}
                      <span className={exp.cls}>{exp.text}</span>
                      {consumption.activeSubscription.note ? (
                        <span className="text-slate-400"> — ملاحظة: {consumption.activeSubscription.note}</span>
                      ) : null}
                    </p>
                  </div>
                );
              })()
            ) : consumption ? (
              <p className="mt-3 border-t border-slate-700 pt-3 text-xs text-slate-400">
                مفيش اشتراك غير ملغٍّ لهذا المستخدم (أو الجدول غير متاح — راجع أسباب N/A بالأعلى).
              </p>
            ) : null}
          </AdminCard>

          <AdminCard title="ما يدرسه الطالب والتقدم" tone="blue">
            {insights?.courses.length || insights?.workspaceSubjects.length ? (
              <div className="space-y-3">
                {insights.courses.map((course) => {
                  const total = course.total_days;
                  const completed = course.completed_days;
                  const percent = total ? Math.round((completed / total) * 100) : 0;
                  return <div key={course.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div><p className="flex items-center gap-2 text-sm font-bold text-slate-100"><BookOpen size={15} className="text-blue-300" />{course.subject}</p><p className="mt-1 text-[11px] text-slate-400">{[course.category, course.sub_category].filter(Boolean).join(" · ") || "منهج دراسي"} · {new Date(course.created_at).toLocaleDateString("ar-EG")}</p></div>
                      <span className="text-xs text-emerald-300">{completed} / {total} درس مكتمل</span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-label={`تقدم ${course.subject}`} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-emerald-400" style={{ width: `${percent}%` }} /></div>
                  </div>;
                })}
                {insights.workspaceSubjects.map((subject) => <div key={subject.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                  <p className="flex items-center gap-2 text-sm font-bold text-slate-100"><GraduationCap size={15} className="text-blue-300" />{subject.name}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{[subject.stage, subject.grade_or_year, subject.specialization, subject.curriculum].filter(Boolean).join(" · ")}</p>
                </div>)}
              </div>
            ) : <AdminNotice>{insights?.errors.some((error) => error.source.includes("مواد") || error.source.includes("تقدم")) ? "بيانات المواد غير متاحة حاليًا — راجع تفاصيل المصدر بالأسفل." : "لا توجد مواد أو مسارات دراسة مسجلة لهذا الحساب."}</AdminNotice>}
          </AdminCard>

          <AdminCard title="تحليلات الاستخدام والنشاط الأخير" tone="purple">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"><p className="text-[11px] text-slate-400">عمليات AI الإجمالية</p><p className="mt-1 text-xl font-bold text-slate-100">{insights?.ai.total ?? "N/A"}</p></div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"><p className="text-[11px] text-slate-400">مكتملة</p><p className="mt-1 text-xl font-bold text-emerald-300">{insights?.ai.completed ?? "N/A"}</p></div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"><p className="text-[11px] text-slate-400">فاشلة</p><p className="mt-1 text-xl font-bold text-rose-300">{insights?.ai.failed ?? "N/A"}</p></div>
            </div>
            {insights?.ai.recent.length ? <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-950/30 px-3">
              {insights.ai.recent.map((operation, index) => <li key={`${operation.created_at}-${index}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                <span className="flex items-center gap-2 text-slate-200"><Activity size={14} className="text-purple-300" />{operation.task_type} · <span dir="ltr">{operation.model}</span></span>
                <span className={operation.status === "completed" ? "text-emerald-300" : "text-rose-300"}>{operation.status === "completed" ? "مكتملة" : "فاشلة"} · {new Date(operation.created_at).toLocaleString("ar-EG")}</span>
              </li>)}
            </ul> : <AdminNotice>لا يوجد نشاط AI مسجل أو أن سجل التحليلات غير متاح.</AdminNotice>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"><p className="flex items-center gap-2 text-[11px] text-slate-400"><FileText size={14} />المحاضرات المحفوظة</p><p className="mt-1 font-bold text-slate-100">{insights?.lectures.length ?? "N/A"}{insights && insights.lectures.length === 10 ? "+ (آخر 10)" : ""}</p></div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"><p className="flex items-center gap-2 text-[11px] text-slate-400"><CheckCircle2 size={14} />جلسات الامتحان</p><p className="mt-1 font-bold text-slate-100">{insights?.exams.length ?? "N/A"}{insights && insights.exams.length === 10 ? "+ (آخر 10)" : ""}</p></div>
            </div>
            {insights?.lectures.length ? <div className="space-y-2"><h3 className="text-xs font-bold text-slate-300">آخر المحاضرات</h3>{insights.lectures.slice(0, 5).map((lecture) => <div key={lecture.id} className="flex flex-wrap justify-between gap-2 rounded-lg border border-slate-800 px-3 py-2 text-xs"><span className="text-slate-200">{lecture.title || lecture.original_filename || "محاضرة بدون عنوان"}</span><span className="text-slate-400">{lecture.status} · {new Date(lecture.created_at).toLocaleDateString("ar-EG")}</span></div>)}</div> : null}
            {insights?.exams.length ? <div className="space-y-2"><h3 className="text-xs font-bold text-slate-300">آخر جلسات الامتحان</h3>{insights.exams.slice(0, 5).map((exam) => <div key={exam.id} className="flex flex-wrap justify-between gap-2 rounded-lg border border-slate-800 px-3 py-2 text-xs"><span className="text-slate-200">{exam.mode} · {exam.total_lectures} محاضرات</span><span className="text-slate-400">{exam.status} · {new Date(exam.created_at).toLocaleDateString("ar-EG")}</span></div>)}</div> : null}
            {insights?.errors.length ? <AdminNotice tone="amber">مصادر غير متاحة: {insights.errors.map((error) => `${error.source}: ${error.message}`).join(" · ")}</AdminNotice> : null}
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
