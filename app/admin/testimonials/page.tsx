import { requireAdminPermission } from "@/lib/admin/auth-check";
import { AdminPageHeader, AdminCard, AdminNotice } from "@/components/admin/ui";
import { deleteTestimonial, listTestimonialsForAdmin, moderateTestimonial } from "@/app/admin/actions/testimonials-manage";
import { Star } from "lucide-react";

export default async function AdminTestimonialsPage({
  searchParams,
}: {
  searchParams?: Promise<{ success?: string; error?: string }>;
}) {
  await requireAdminPermission("announcements.manage");
  const params = (await searchParams) ?? {};
  const testimonials = await listTestimonialsForAdmin();
  const { success, error } = params;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="آراء المستخدمين"
        subtitle="راجع التقييمات قبل نشرها على صفحة المنصة."
        badge="announcements.manage"
        permissionKey="announcements.manage"
      />
      {success ? <AdminNotice tone="emerald">{success}</AdminNotice> : null}
      {error ? <AdminNotice tone="rose">{error}</AdminNotice> : null}
      <AdminCard title={`التقييمات (${testimonials.length})`} tone="default">
        {testimonials.length === 0 ? (
          <p className="text-sm text-slate-400">لسه مفيش تقييمات مستلمة.</p>
        ) : (
          <ul className="space-y-3">
            {testimonials.map((item) => (
              <li key={item.id} className="rounded-xl border border-slate-700 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <strong>{item.display_name}</strong>
                    <span className="text-amber-400 inline-flex items-center gap-1" aria-label={`${item.rating} من 5`}>
                      <Star size={14} fill="currentColor" /> {item.rating}/5
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">{new Date(item.created_at).toLocaleString("ar-EG")}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-200">{item.comment}</p>
                <div className="flex flex-wrap gap-2">
                  <form action={async () => {
                    "use server";
                    const result = await moderateTestimonial(item.id, !item.is_published);
                    const { redirect } = await import("next/navigation");
                    redirect(`/admin/testimonials?${result.ok ? "success" : "error"}=${encodeURIComponent(result.message)}`);
                  }}>
                    <button type="submit" className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600">
                      {item.is_published ? "إخفاء من الموقع" : "موافقة ونشر"}
                    </button>
                  </form>
                  <form action={async () => {
                    "use server";
                    const result = await deleteTestimonial(item.id);
                    const { redirect } = await import("next/navigation");
                    redirect(`/admin/testimonials?${result.ok ? "success" : "error"}=${encodeURIComponent(result.message)}`);
                  }}>
                    <button type="submit" className="rounded-lg border border-rose-800 px-3 py-2 text-xs text-rose-300 hover:bg-rose-950">
                      حذف
                    </button>
                  </form>
                  <span className={`self-center text-xs ${item.is_published ? "text-emerald-400" : "text-amber-300"}`}>
                    {item.is_published ? "منشور" : "بانتظار المراجعة"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>
    </div>
  );
}
