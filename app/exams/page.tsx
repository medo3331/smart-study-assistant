/* ======================================================================
   /exams — مولّد الامتحانات + بنك الامتحانات الرسمي (تبويبيان)
   ----------------------------------------------------------------------
   • «امتحاناتي» (الافتراضي): مولّد بالذكاء الاصطناعي — الطالب يختار
     المادة والمحاضرات وشكل الأسئلة (أنواع/صعوبة/عدد)، والمحرّك الحالي
     (`exam_sessions`) بيولّد ويخزّن ويرجع للطالب.
     يتفتح مباشرة بـ `?gen=1` — ده مدخل الربط من صفحة الدرس والمساعد.
   • «بنك الامتحانات الرسمي»: نفس محتوى `past_exams` القديم (قراءة فقط).
   الواجهة كلها في `components/exams/ExamsHub` (client island).
   ====================================================================== */

import { type Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ExamsHub } from "@/components/exams/ExamsHub";

export const metadata: Metadata = {
  title: "امتحاناتي وبنك الامتحانات — Magicly",
  description: "ولّد امتحانًا من محاضراتك بالذكاء الاصطناعي، أو راجع امتحانات سابقة مُنظمة حسب الدولة ومنهج ومادة وسنة.",
};

// Server-side fetch — uses service role (server-only, safe from browser RLS)
async function getTaxonomyAndExams() {
  const sb = await createClient();
  // Only published exams visible; unpublished (our 2024 exam) hidden by RLS for anon
  // We still show taxonomy so user can browse if/when published exams exist
  const [c, cu, s, a, exams] = await Promise.all([
    sb.from("countries").select("id,name,code").limit(10),
    sb.from("curricula").select("id,name,code").limit(10),
    sb.from("subjects").select("id,name,code").limit(10),
    sb.from("academic_years").select("id,label").limit(10),
    sb.from("past_exams").select("id,title,subject_id,academic_year_id,is_published,exam_date,duration_minutes,total_marks,exam_file_path,answer_file_path,source_name").eq("is_published", true).limit(10),
  ]);
  return {
    countries: c.data ?? [],
    curricula: cu.data ?? [],
    subjects: s.data ?? [],
    years: a.data ?? [],
    exams: exams.data ?? [],
    error: c.error || cu.error || s.error || a.error || exams.error || null,
  };
}

type ExamsInitial = {
  tab: "my" | "bank";
  gen: boolean;
  subject: string;
  subjectId: string;
  lecture: string;
  dayId: string;
};

export default async function ExamsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const str = (key: string, max = 120) => {
    const value = params[key];
    return typeof value === "string" ? value.slice(0, max) : "";
  };

  // نيّة الطالب من الـURL (من صفحة الدرس/المساعد) — يُتحقق منها عند الإنشاء.
  const initial: ExamsInitial = {
    tab: str("tab") === "bank" ? "bank" : "my",
    gen: str("gen") === "1",
    subject: str("subject"),
    subjectId: str("subjectId", 64),
    lecture: str("lecture", 64),
    dayId: str("dayId", 64),
  };

  const d = await getTaxonomyAndExams();
  const exams = d.exams as Array<{
    id: string;
    title: string;
    exam_date: string | null;
    duration_minutes: number | null;
    total_marks: number | null;
  }>;

  // محتوى تبويب البنك (يمرّر كـchildren — الـhub بيعرضه تحت `?tab=bank`).
  const bankSlot = d.error ? (
    <section className="max-w-5xl mx-auto px-6 py-12" aria-label="خطأ تحميل البنك">
      <h1 className="text-3xl font-extrabold mb-4">بنك الامتحانات</h1>
      <p className="text-red-400">تعذر تحميل الامتحانات حاليًا. حاول مرة أخرى لاحقًا.</p>
      <p className="text-xs text-slate-500 mt-2">لا تظهر بيانات وهمية.</p>
    </section>
  ) : (
    <section className="max-w-5xl mx-auto px-6 py-8">
      <header className="mb-10">
        <h1 className="text-4xl font-extrabold tracking-tight mb-2">بنك الامتحانات</h1>
        <p className="text-slate-400 text-base leading-relaxed">راجع امتحانات سابقة وجرّب استعدادك — من مصر، المنهج العام، إلى المادة والسنة والامتحان.</p>
      </header>

      {/* Taxonomy breadcrumbs — only from DB, never hardcoded */}
      <nav aria-label="تسلسل اختيار الامتحان" className="flex flex-wrap gap-3 mb-8 text-sm">
        <span className="px-3 py-1 rounded-full bg-[#161B36] border border-[#2A3050] text-amber-300">الدولة</span>
        <span className="text-slate-500">↓</span>
        <span className="px-3 py-1 rounded-full bg-[#161B36] border border-[#2A3050] text-amber-300">المنهج</span>
        <span className="text-slate-500">↓</span>
        <span className="px-3 py-1 rounded-full bg-[#161B36] border border-[#2A3050] text-amber-300">المادة</span>
        <span className="text-slate-500">↓</span>
        <span className="px-3 py-1 rounded-full bg-[#161B36] border border-[#2A3050] text-amber-300">السنة</span>
        <span className="text-slate-500">↓</span>
        <span className="px-3 py-1 rounded-full bg-[#161B36] border border-[#2A3050] text-[#F0E6D2]">الامتحان</span>
      </nav>

      {/* Taxonomy selectors — driven by DB (only existing rows shown) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <SelectBox label="الدولة" items={d.countries.map((x: { id: string; name: string }) => ({ id: x.id, label: x.name }))} />
        <SelectBox label="المنهج" items={d.curricula.map((x: { id: string; name: string }) => ({ id: x.id, label: x.name }))} />
        <SelectBox label="المادة" items={d.subjects.map((x: { id: string; name: string }) => ({ id: x.id, label: x.name }))} />
        <SelectBox label="السنة" items={d.years.map((x: { id: string; label: string }) => ({ id: x.id, label: x.label }))} />
      </div>

      {/* Published exams — RLS-controlled; unpublished exam hidden */}
      <section aria-label="الامتحانات المنشورة">
        <h2 className="text-xl font-bold mb-4">الامتحانات المتاحة</h2>
        {d.exams.length === 0 ? (
          <EmptyState message="لا توجد امتحانات منشورة حاليًا." sub="سيتم إضافة المزيد من الامتحانات قريبًا." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {exams.map((ex) => (
              <ExamCard
                key={ex.id}
                exam={{
                  id: ex.id,
                  title: ex.title,
                  exam_date: ex.exam_date,
                  duration_minutes: ex.duration_minutes,
                  total_marks: ex.total_marks,
                }}
              />
            ))}
          </div>
        )}
      </section>
    </section>
  );

  return <ExamsHub initial={initial}>{bankSlot}</ExamsHub>;
}

/* ------------------------------------------------------------------ */
// Bank subcomponents — نفس شكل الصفحة القديمة (المحتوى لم يتغيّر)

function SelectBox({ label, items }: { label: string; items: { id: string; label: string }[] }) {
  return (
    <div className="rounded-2xl border border-[#2A3050] bg-[#13182E] p-4 shadow-md">
      <label className="block text-xs text-slate-400 mb-2 font-medium" htmlFor={`sel-${label}`}>{label}</label>
      <select id={`sel-${label}`} className="w-full bg-[#0D1029] border border-[#2A3050] rounded-xl px-3 py-2 text-sm text-[#F0E6D2] focus:outline-none focus:border-amber-300" aria-label={label}>
        <option value="">اختر {label}</option>
        {items.map((it) => (
          <option key={it.id} value={it.id}>{it.label}</option>
        ))}
      </select>
    </div>
  );
}

function ExamCard({ exam }: { exam: { id: string; title: string; exam_date: string | null; duration_minutes: number | null; total_marks: number | null } }) {
  return (
    <article className="rounded-2xl border border-[#2A3050] bg-[#13182E] p-5 shadow hover:shadow-lg transition-shadow" aria-label={`امتحان ${exam.title}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300 bg-amber-950/40 px-2.5 py-1 rounded-full border border-amber-700/30">امتحان</span>
        {exam.exam_date ? (
          <span className="text-xs text-slate-400">{String(exam.exam_date)}</span>
        ) : null}
      </div>
      <h3 className="text-lg font-extrabold leading-snug mb-2">{exam.title}</h3>
      <div className="flex flex-wrap gap-2 text-xs text-slate-300 mb-3">
        {exam.duration_minutes ? <span>المدة: {exam.duration_minutes} دقيقة</span> : null}
        {exam.total_marks ? <span>الدرجة: {exam.total_marks}</span> : null}
      </div>
      <div className="flex gap-3">
        <a href={`/exams/${encodeURIComponent(exam.id)}`} className="inline-flex items-center gap-2 rounded-xl bg-[#2A3050] hover:bg-[#3A4060] text-[#F0E6D2] px-4 py-2 text-sm font-bold transition-colors">عرض الامتحان</a>
      </div>
    </article>
  );
}

function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#2A3050] bg-[#13182E]/60 p-10 text-center" role="status" aria-live="polite">
      <div className="text-4xl mb-3">📋</div>
      <h3 className="text-xl font-extrabold mb-2">{message}</h3>
      {sub ? <p className="text-slate-400 text-sm">{sub}</p> : null}
    </div>
  );
}
