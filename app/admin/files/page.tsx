import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderOpen, Search, Tags, Trash2, Undo2 } from "lucide-react";
import { requireAdminPermission } from "@/lib/admin/auth-check";
import { isPgConfigured, pgQuery } from "@/lib/admin/pg";
import { createServiceClient } from "@/lib/supabase/admin";
import { updateFileClassification, softDeleteFile, restoreFile } from "@/app/admin/actions/files-manage";
import { filesFormAction } from "@/app/admin/actions/files-forms";
import { AdminCard, AdminNotice, AdminPageHeader, AdminStatCard, AdminTableWrap } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/**
 * 📁 إدارة الملفات — المرحلة 4.7 (استبدل الـskeleton بالكامل):
 * - قراءة حقيقية لجدول files: service_role ثم fallback DATABASE_URL
 *   (مفيش session fallback لأن RLS بيقرا ملفات المالك فقط ويُضلل).
 * - فلاتر query params: المستخدم (UUID/كود)، النوع، التاريخ، المحذوفين.
 * - تصنيف/soft-delete/استرجاع عبر server actions بفحص files.moderate
 *   على السيرفر + audit (قبل/بعد في details).
 * - soft-delete يحتاج deleted_at (SQL #12 اليدوي) — لحد تنفيذه الصفحة
 *   بتقول "نفّذ SQL #12" بدل ما توههم.
 */

const PAGE_SIZE = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface FileRow {
  id: string;
  profile_id: string;
  file_name: string;
  original_name: string;
  file_size: number;
  file_type: string;
  classification: string | null;
  stage: string | null;
  grade: string | null;
  subject: string | null;
  created_at: string;
  deleted_at: string | null;
  owner_email: string | null;
  owner_name: string | null;
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export default async function AdminFilesPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; type?: string; from?: string; to?: string; show?: string; page?: string; success?: string; error?: string }>;
}) {
  const sp = await searchParams;
  await requireAdminPermission("files.moderate");

  const fUser = (sp.user ?? "").trim();
  const fType = (sp.type ?? "").trim();
  const fFrom = (sp.from ?? "").trim();
  const fTo = (sp.to ?? "").trim();
  const fShow: "active" | "deleted" | "all" = sp.show === "deleted" ? "deleted" : sp.show === "all" ? "all" : "active";
  const pageNum = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const offset = (pageNum - 1) * PAGE_SIZE;
  const hasAnyFilter = Boolean(fUser || fType || fFrom || fTo || fShow !== "active" || pageNum > 1);

  const dbReady = isPgConfigured();
  const serviceRoleReady = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  // ── فلتر المستخدم: UUID مباشر أو كود MAG → user_id (كود غير موجود = تنبيه)
  let resolvedUserId: string | null = null;
  let userNotFound = false;
  let ownerInfo: { id: string; email: string | null; name: string | null } | null = null;
  if (fUser) {
    if (UUID_RE.test(fUser)) {
      resolvedUserId = fUser;
    } else {
      try {
        const svc = createServiceClient();
        const { data: codeRow } = await svc.from("user_codes").select("user_id").eq("code", fUser).maybeSingle();
        if (codeRow) resolvedUserId = (codeRow as any).user_id;
        else userNotFound = true;
      } catch {
        userNotFound = true;
      }
    }
  }

  let rows: FileRow[] = [];
  let totalCount: number | null = null;
  let readError: string | null = null;
  let source = "unavailable";
  let deletedCol = false;

  // ── مسار 1: service_role (probe لعمود deleted_at لأن SQL #12 يدوي)
  try {
    const service = createServiceClient();
    const probe = await service.from("files").select("id, deleted_at").limit(1);
    if (probe.error) {
      const msg = probe.error.message || "";
      if (!/deleted_at/.test(msg)) throw probe.error; // خطأ غير متوقع مش عمود ناقص
      deletedCol = false;
    } else {
      deletedCol = true;
    }

    const cols = deletedCol
      ? "id, profile_id, file_name, original_name, file_size, file_type, classification, stage, grade, subject, created_at, deleted_at"
      : "id, profile_id, file_name, original_name, file_size, file_type, classification, stage, grade, subject, created_at";

    let q = service.from("files").select(cols, { count: "exact" });
    if (resolvedUserId) q = q.eq("profile_id", resolvedUserId);
    if (fType) q = q.eq("file_type", fType);
    if (fFrom) q = q.gte("created_at", fFrom);
    if (fTo) q = q.lte("created_at", `${fTo}T23:59:59.999Z`);
    if (deletedCol && fShow === "active") q = q.is("deleted_at", null);
    if (deletedCol && fShow === "deleted") q = q.not("deleted_at", "is", null);

    const { data, error, count } = await q.order("created_at", { ascending: false }).range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows = ((data ?? []) as any[]).map((r) => ({ ...r, deleted_at: r.deleted_at ?? null, owner_email: null, owner_name: null })) as FileRow[];
    totalCount = count;

    // هوية أصحاب الملفات (دفعة واحدة) للعرض والرابط لصفحة المستخدم
    const ids = [...new Set(rows.map((r) => r.profile_id))];
    if (ids.length) {
      const { data: profiles } = await service.from("profiles").select("id, email, display_name").in("id", ids);
      const map = new Map(((profiles ?? []) as any[]).map((p) => [p.id, p]));
      rows = rows.map((r) => {
        const p = map.get(r.profile_id);
        return { ...r, owner_email: p?.email ?? null, owner_name: p?.display_name ?? null };
      });
    }
    if (resolvedUserId) {
      const { data: own } = await service.from("profiles").select("id, email, display_name").eq("id", resolvedUserId).maybeSingle();
      ownerInfo = own ? { id: (own as any).id, email: (own as any).email ?? null, name: (own as any).display_name ?? null } : null;
    }
    source = "service_role";
  } catch (serviceError) {
    // ── مسار 2: DATABASE_URL مباشر (نفس منهج باقي صفحات اللوحة)
    if (!dbReady) {
      readError =
        ((serviceError as { message?: string })?.message || "service_role unavailable") +
        " | DATABASE_URL غير موجود — غير قابل للتحقق من هنا";
    } else {
      try {
        const colCheck = await pgQuery<{ has: boolean }>(
          `SELECT exists(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='files' AND column_name='deleted_at') AS has`
        );
        deletedCol = !!colCheck[0]?.has;

        const where: string[] = [];
        const params: unknown[] = [];
        if (resolvedUserId) { params.push(resolvedUserId); where.push(`f.profile_id = $${params.length}`); }
        if (fType) { params.push(fType); where.push(`f.file_type = $${params.length}`); }
        if (fFrom) { params.push(fFrom); where.push(`f.created_at >= $${params.length}::timestamptz`); }
        if (fTo) { params.push(`${fTo}T23:59:59.999Z`); where.push(`f.created_at <= $${params.length}::timestamptz`); }
        if (deletedCol && fShow === "active") where.push("f.deleted_at IS NULL");
        if (deletedCol && fShow === "deleted") where.push("f.deleted_at IS NOT NULL");
        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

        const delColSql = deletedCol ? "f.deleted_at" : "NULL::timestamptz AS deleted_at";
        rows = await pgQuery<FileRow>(
          `SELECT f.id::text, f.profile_id::text, f.file_name, f.original_name, f.file_size, f.file_type,
                  f.classification, f.stage, f.grade, f.subject, f.created_at::text, ${delColSql},
                  p.email AS owner_email, p.display_name AS owner_name
             FROM public.files f
             LEFT JOIN public.profiles p ON p.id = f.profile_id
             ${whereSql}
            ORDER BY f.created_at DESC
            LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
          params
        );
        const [cnt] = await pgQuery<{ n: string }>(
          `SELECT count(*)::text AS n FROM public.files f ${whereSql}`,
          params
        );
        totalCount = cnt ? parseInt(cnt.n, 10) : null;
        if (resolvedUserId) {
          if (rows.length) {
            ownerInfo = { id: resolvedUserId, email: rows[0].owner_email, name: rows[0].owner_name };
          } else {
            const [own] = await pgQuery<{ email: string | null; display_name: string | null }>(
              `SELECT email, display_name FROM public.profiles WHERE id = $1`,
              [resolvedUserId]
            );
            ownerInfo = own ? { id: resolvedUserId, email: own.email, name: own.display_name } : null;
          }
        }
        source = "DATABASE_URL";
      } catch (e) {
        readError =
          ((serviceError as { message?: string })?.message || "service_role unavailable") +
          " | " +
          ((e as { message?: string })?.message || "pg read failed");
      }
    }
  }

  /** رابط يحافظ على الفلاتر (بعد الكتابة/بين الصفحات) */
  const qs = (over: Record<string, string | undefined> = {}): string => {
    const u = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      user: fUser || undefined,
      type: fType || undefined,
      from: fFrom || undefined,
      to: fTo || undefined,
      show: fShow !== "active" ? fShow : undefined,
      page: undefined,
      ...over,
    };
    for (const [k, v] of Object.entries(merged)) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `/admin/files?${s}` : "/admin/files";
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="إدارة الملفات"
        subtitle="عرض/تصنيف/حذف ملفات المستخدمين — قراءة حقيقية من جدول files وaudit على كل كتابة (Phase 4.7)."
        badge="files.moderate"
        permissionKey="files.moderate"
      />

      {sp.success ? <AdminNotice tone="emerald">تم: {sp.success}</AdminNotice> : null}
      {sp.error ? <AdminNotice tone="rose">خطأ: {sp.error}</AdminNotice> : null}
      {!deletedCol && !readError ? (
        <AdminNotice tone="amber" title="SQL #12 بانتظار التنفيذ اليدوي">
          عمود <code>deleted_at</code> غير موجود في <code>files</code> — الحذف/الاسترجاع غير متاح لحد تنفيذ{" "}
          <code>db/12-files-deleted-at.sql</code> يدويًا (أفعال الصفحات بترفض برسالة صادحة بدل وهم النجاح).
        </AdminNotice>
      ) : null}
      {userNotFound ? (
        <AdminNotice tone="rose">
          كود المستخدم <code dir="ltr">{fUser}</code> غير موجود في <code>user_codes</code> — الفلتر طُبّق على غير موجود
          (صفر نتيجة صحيحة).
        </AdminNotice>
      ) : null}
      <AdminCard title="جاهزية المصادر (فحص بيئة حقيقي)" tone="default">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <AdminStatCard
            label="مصدر القراءة الحالي"
            value={source}
            tone={source !== "unavailable" ? "emerald" : "rose"}
            hint={
              source === "service_role"
                ? "service_role يتجاوز RLS — نفس مصدر باقي الصفحات"
                : source === "DATABASE_URL"
                  ? "استعلام PG مباشر (fallback)"
                  : "N/A — غير قابل للتحقق من هنا"
            }
          />
          <AdminStatCard
            label="الحذف اللين (deleted_at)"
            value={deletedCol ? "جاهز" : "SQL #12 مطلوب"}
            tone={deletedCol ? "emerald" : "amber"}
            hint={deletedCol ? "الأفعال (حذف/استرجاع) مفعّلة" : "نفّذ db/12-files-deleted-at.sql يدويًا"}
          />
          <AdminStatCard
            label="DATABASE_URL"
            value={dbReady ? "موجود" : "غير موجود"}
            tone={dbReady ? "emerald" : "rose"}
            hint={dbReady ? "مسار fallback جاهز" : "N/A — fallback غير متاح"}
          />
          <AdminStatCard
            label="SUPABASE_SERVICE_ROLE_KEY"
            value={serviceRoleReady ? "موجود" : "غير موجود"}
            tone={serviceRoleReady ? "emerald" : "rose"}
            hint={serviceRoleReady ? "المسار الأساسي جاهز" : "مطلوب لعرض ملفات كل المستخدمين"}
          />
        </div>
      </AdminCard>
      {/* Phase 4.7: فلاتر query params — تُبنى داخل استعلام PG (server-side) */}
      <AdminCard title="فلاتر" tone="default">
        <form method="GET" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-400">المستخدم (UUID أو كود)</span>
            <input
              name="user"
              type="text"
              defaultValue={fUser}
              placeholder="MAG-XXX-XXXX أو UUID"
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono w-56"
              dir="ltr"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-400">النوع</span>
            <select name="type" defaultValue={fType} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100">
              <option value="">الكل</option>
              <option value="pdf">pdf</option>
              <option value="word">word</option>
              <option value="text">text</option>
              <option value="image">image</option>
              <option value="video">video</option>
              <option value="audio">audio</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-400">من تاريخ</span>
            <input name="from" type="date" defaultValue={fFrom} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100" dir="ltr" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-400">إلى تاريخ</span>
            <input name="to" type="date" defaultValue={fTo} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100" dir="ltr" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-400">الحالة</span>
            <select name="show" defaultValue={fShow} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100">
              <option value="active">نشط</option>
              <option value="deleted">محذوف</option>
              <option value="all">الكل</option>
            </select>
          </label>
          <button type="submit" className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-amber-950 font-bold px-4 py-2 rounded-lg text-xs">
            <Search size={13} /> تطبيق
          </button>
          {fUser || fType || fFrom || fTo || fShow !== "active" ? (
            <Link href="/admin/files" className="text-xs text-slate-400 underline hover:text-amber-300 py-2">
              مسح الفلاتر
            </Link>
          ) : null}
        </form>
        {ownerInfo ? (
          <p className="text-[11px] text-slate-400 mt-2">
            عرض ملفات: <span className="text-slate-200">{ownerInfo.name || ownerInfo.email || ownerInfo.id}</span> (
            <Link href={`/admin/users/${ownerInfo.id}`} className="text-amber-300 underline">
              صفحة المستخدم
            </Link>
            )
          </p>
        ) : null}
      </AdminCard>
      <AdminCard
        title={
          totalCount !== null
            ? `${totalCount} ملف${hasAnyFilter ? " مطابق" : ""} — صفحة ${pageNum} (المصدر: ${source})`
            : `حتى ${PAGE_SIZE} ملف — صفحة ${pageNum} (المصدر: ${source})`
        }
        tone="amber"
      >
        {readError ? (
          <AdminNotice tone="rose">
            تعذّر قراءة <code>files</code>: {readError} — <strong>غير قابل للتحقق من هنا</strong>.
          </AdminNotice>
        ) : rows.length === 0 ? (
          <AdminNotice tone="amber">
            صفر ملف مطابق للفلاتر الحالية (رقم حقيقي — مش خطأ). جرّب مسح الفلاتر أو غيّر الحالة.
          </AdminNotice>
        ) : (
          <AdminTableWrap>
            <thead>
              <tr className="bg-slate-950/60 text-amber-300">
                <th className="text-right px-3 py-2">الملف والمالك</th>
                <th className="text-right px-3 py-2">النوع/الحجم/التاريخ</th>
                <th className="text-right px-3 py-2">التصنيف (classification/stage/grade/subject)</th>
                <th className="text-right px-3 py-2">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => {
                const backFields = (
                  <>
                    {fUser ? <input type="hidden" name="back_user" value={fUser} /> : null}
                    {fType ? <input type="hidden" name="back_type" value={fType} /> : null}
                    {fFrom ? <input type="hidden" name="back_from" value={fFrom} /> : null}
                    {fTo ? <input type="hidden" name="back_to" value={fTo} /> : null}
                    {fShow !== "active" ? <input type="hidden" name="back_show" value={fShow} /> : null}
                    {pageNum > 1 ? <input type="hidden" name="back_page" value={String(pageNum)} /> : null}
                  </>
                );
                return (
                  <tr key={f.id} className={`border-t border-slate-800 hover:bg-slate-800/30 ${f.deleted_at ? "opacity-60" : ""}`}>
                    <td className="p-3 text-[11px]">
                      <p className="text-slate-200 font-bold" dir="ltr">{f.file_name}</p>
                      <p className="text-slate-500" dir="ltr">{f.original_name}</p>
                      <p className="text-slate-400 mt-1">
                        {f.owner_name || f.owner_email || f.profile_id.slice(0, 8)} ·{" "}
                        <Link href={`/admin/users/${f.profile_id}`} className="text-amber-300 underline hover:text-amber-200">
                          صفحة المستخدم
                        </Link>
                      </p>
                      {f.deleted_at ? (
                        <span className="inline-block mt-1 text-[10px] bg-rose-500/10 text-rose-300 px-1.5 py-0.5 rounded">
                          محذوف {f.deleted_at.slice(0, 10)}
                        </span>
                      ) : null}
                    </td>
                    <td className="p-3 text-[10px] text-slate-400">
                      <span className="bg-slate-700/50 px-1.5 py-0.5 rounded text-slate-300">{f.file_type}</span>
                      <br />
                      {fmtBytes(f.file_size)}
                      <br />
                      <span dir="ltr">{f.created_at.slice(0, 10)}</span>
                    </td>
                    <td className="p-3">
                      <form action={filesFormAction} className="flex flex-wrap items-center gap-1">
                        <input type="hidden" name="op" value="classify" />
                        <input type="hidden" name="file_id" value={f.id} />
                        {backFields}
                        <input name="classification" defaultValue={f.classification ?? ""} placeholder="classification" aria-label="classification"
                          className="bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-[10px] text-slate-100 w-24" />
                        <input name="stage" defaultValue={f.stage ?? ""} placeholder="stage" aria-label="stage"
                          className="bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-[10px] text-slate-100 w-16" />
                        <input name="grade" defaultValue={f.grade ?? ""} placeholder="grade" aria-label="grade"
                          className="bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-[10px] text-slate-100 w-14" />
                        <input name="subject" defaultValue={f.subject ?? ""} placeholder="subject" aria-label="subject"
                          className="bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-[10px] text-slate-100 w-20" />
                        <button type="submit" className="inline-flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-amber-950 font-bold px-2 py-1 rounded text-[10px]">
                          <Tags size={10} /> حفظ
                        </button>
                      </form>
                    </td>
                    <td className="p-3">
                      {f.deleted_at ? (
                        <form action={filesFormAction} className="flex items-center gap-1">
                          <input type="hidden" name="op" value="restore" />
                          <input type="hidden" name="file_id" value={f.id} />
                          {backFields}
                          <button type="submit" className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2.5 py-1.5 rounded text-[10px]">
                            <Undo2 size={11} /> استرجاع
                          </button>
                        </form>
                      ) : (
                        <form action={filesFormAction} className="flex items-center gap-1">
                          <input type="hidden" name="op" value="delete" />
                          <input type="hidden" name="file_id" value={f.id} />
                          {backFields}
                          <input name="reason" placeholder="سبب (اختياري)" aria-label="سبب الحذف"
                            className="bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-[10px] text-slate-100 w-24" />
                          <button type="submit" className="inline-flex items-center gap-1 bg-rose-600 hover:bg-rose-500 text-white font-bold px-2.5 py-1.5 rounded text-[10px]">
                            <Trash2 size={11} /> حذف
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </AdminTableWrap>
        )}
        {/* Phase 4.7: pagination بتحافظ على الفلاتر (50 صف/صفحة) */}
        {totalCount !== null && totalCount > PAGE_SIZE ? (
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-700 text-xs">
            {pageNum > 1 ? (
              <Link href={qs({ page: String(pageNum - 1) })} className="text-amber-300 hover:text-amber-200 underline">
                ← الصفحة السابقة
              </Link>
            ) : (
              <span className="text-slate-600">أول صفحة</span>
            )}
            <span className="text-slate-400">
              صفحة {pageNum} من {Math.ceil(totalCount / PAGE_SIZE)} (إجمالي {totalCount})
            </span>
            {pageNum * PAGE_SIZE < totalCount ? (
              <Link href={qs({ page: String(pageNum + 1) })} className="text-amber-300 hover:text-amber-200 underline">
                الصفحة التالية →
              </Link>
            ) : (
              <span className="text-slate-600">آخر صفحة</span>
            )}
          </div>
        ) : null}
      </AdminCard>
      <AdminNotice tone="default">
        <FolderOpen size={12} className="inline" /> مصدر الكتابة الحالي: <code>app/api/upload/route.ts</code> →
        فحص حصة <code>subscription_quotas</code> → إدراج صف في <code>files</code> → تحديث الحصة. كل تعديل من
        اللوحة (تصنيف/حذف/استرجاع) بيمر على <code>files.moderate</code> مرتين (الغلاف + files-manage) وبيتسجّل في{" "}
        <code>audit_log</code> بتفاصيل قبل/بعد — تقدر تفلترها من صفحة سجل العمليات بـ
        <code> action=files.moderate</code>.
      </AdminNotice>
    </div>
  );
}