import { FolderOpen } from "lucide-react";
import { requireAdminPermission } from "@/lib/admin/auth-check";
import { isPgConfigured } from "@/lib/admin/pg";
import { AdminCard, AdminNotice, AdminPageHeader, AdminSkeleton, AdminStatCard } from "@/components/admin/ui";

/**
 * 📁 إدارة الملفات — **هيكل أساسي فقط** (المرحلة 1).
 *
 * مفيش أي بيانات وهمية هنا. الجدول المستهدف موجود فعلًا في
 * db/epic2-file-upload.sql، والرفع الفعلي بيحصل في app/api/upload/route.ts
 * (بيقفل بالحصص ويكتب في `files`). عرض/تصنيف/حذف الملفات من اللوحة = المرحلة 4.
 */
export default async function AdminFilesPage() {
  await requireAdminPermission("files.moderate");

  // فحوص تهيئة حقيقية (وجود المتغيرات في البيئة) — مش بيانات ملفات مزيفة.
  const dbReady = isPgConfigured();
  const serviceRoleReady = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="إدارة الملفات"
        subtitle="مراجعة ملفات المستخدمين وتصنيفها — الصفحة هيكل أساسي فقط في هذه المرحلة."
        badge="files.moderate"
        permissionKey="files.moderate"
      />

      <AdminNotice tone="amber" title="هيكل أساسي فقط (Skeleton)">
        مفيش أي mock بيانات معروض. جدول <code>files</code> موجود في SQL، والكتابة فيه بتحصل من مسار الرفع،
        لكن عرض/تصنيف/حذف الملفات من اللوحة لسه مش منفّذ — التنفيذ في <strong>المرحلة 4</strong>.
      </AdminNotice>

      <AdminCard title="جاهزية المصادر (فحص بيئة حقيقي)" tone="default">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <AdminStatCard
            label="DATABASE_URL"
            value={dbReady ? "موجود" : "غير موجود"}
            tone={dbReady ? "emerald" : "rose"}
            hint={dbReady ? "الاستعلامات المباشرة هتعمل" : "N/A — أي عرض ملفات غير متاح من هنا"}
          />
          <AdminStatCard
            label="SUPABASE_SERVICE_ROLE_KEY"
            value={serviceRoleReady ? "موجود" : "غير موجود"}
            tone={serviceRoleReady ? "emerald" : "rose"}
            hint="مطلوب لقراءة/تعديل ملفات كل المستخدمين (تجاوز RLS)"
          />
        </div>
      </AdminCard>

      <AdminSkeleton
        title="إدارة الملفات"
        deferredTo="المرحلة 4"
        items={[
          { label: "عرض ملفات أي مستخدم", detail: "قراءة جدول public.files (profile_id, file_name, file_size, file_type, created_at) — يحتاج DATABASE_URL أو service_role." },
          { label: "تعديل التصنيف (classification)", detail: "عمود classification/stage/grade/subject موجود في الجدول لكن بيتكتب بـnull حاليًا من مسار الرفع." },
          { label: "حذف فعلي (soft-delete)", detail: "محتاج عمود deleted_at جديد في migration منفصل + تسجيل العملية في audit_log (files.moderate)." },
          { label: "فلترة وبحث", detail: "حسب النوع/التاريخ/المستخدم عبر query params حقيقية." },
          { label: "إحصاءات", detail: "عدد الملفات المرفوعة اليوم/الأسبوع من جدول files (المرحلة 4 — إحصاءات الصفحة الرئيسية)." },
        ]}
      />

      <AdminNotice tone="default">
        <FolderOpen size={12} className="inline" /> مصدر الكتابة الحالي: <code>app/api/upload/route.ts</code> →
        فحص حصة <code>subscription_quotas</code> → إدراج صف في <code>files</code> → تحديث الحصة. أي عرض من اللوحة
        لازم يقرأ من نفس الجدول ده (مفيش مصدر تاني).
      </AdminNotice>
    </div>
  );
}
