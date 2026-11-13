/* ==========================================================================
   هياكل تحميل كروت مساحة العمل

   الشكل بيقلّد كارت الملف/المحاضرة (أيقونة + عنوان + سطر تفاصيل + تاج)
   عشان الصفحة ماتقفزش لما البيانات تنزل. النبض من `animate-pulse` في
   Tailwind، والألوان من توكنز الملزمة فبتشتغل في الثيمين.
   ========================================================================== */

interface WorkspaceCardSkeletonsProps {
  count?: number;
  /** كروت الملفات بتاخد عمود واحد؛ المحاضرات عمودين على الشاشات الكبيرة. */
  columns?: 1 | 2;
}

export function WorkspaceCardSkeletons({ count = 4, columns = 1 }: WorkspaceCardSkeletonsProps) {
  return (
    <div
      className={`grid gap-3 ${columns === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}
      aria-hidden
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="sheet-card p-4">
          <div className="flex items-start gap-3 animate-pulse">
            <div className="w-10 h-10 shrink-0 rounded-[var(--r-sm)] bg-paper-3" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3.5 w-2/3 rounded-full bg-paper-3" />
              <div className="h-2.5 w-1/3 rounded-full bg-paper-3" />
              <div className="h-5 w-20 rounded-full bg-paper-3" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
