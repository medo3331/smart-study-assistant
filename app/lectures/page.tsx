/* ======================================================================
   📚 محاضراتي — قائمة محاضرات المستخدم + عرض التفريغ (المرحلة ٣)
   ======================================================================
   الصفحة دي **قراءة فقط**: بتعرض اللي اتخزّن فعلاً في `public.lectures`.
   مفيش أي AI هنا (ملخص/شرح/فلاش/أسئلة) — دي مرحلة تانية، والأعمدة
   (`summary` / `explanation`) موجودة في الجدول ومستنية.

   ⚠️ ليه Server Component: الاستعلام بيحصل على السيرفر بعميل الجلسة
   (`createClient`) — فـ RLS شغّال والصفحة **مش** بتملك أي صلاحية
   استثنائية. وكمان بيخلينا نعمل redirect للزائر على السيرفر بدل ما
   نلمّع شاشة فاضية لثانية.

   ⚠️ التصفية بمعرّف المستخدم **مكتوبة صريح** في الاستعلام:
   `.eq("user_id", user.id)`. ده مش تكرار لـ RLS — ده طبقتين:
   RLS بتضمن إن الصف ما يظهرش أصلاً لو الفلتر اتنسى؛ الفلتر الصريح
   بيضمن الفلتر موجود. لو اتشال واحد، التانية لسه واقفة.
   ====================================================================== */

import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageShell, DataNotice, EmptyState } from "@/app/dashboard/components/PageShell";
import { LectureProcessActions } from "@/components/lectures/LectureProcessActions";

export const metadata: Metadata = {
  title: "محاضراتي — Magicly",
  description: "كل محاضراتك المحفوظة وتفريغها النصي في مكان واحد.",
};

/** المدة بالثواني → "12:34" أو "1:05:20" (نفس دالة الواجهة). */
function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** التاريخ بصيغة عربية مقروءة. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ar-EG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const SOURCE_LABEL: Record<string, string> = {
  upload: "ملف مرفوع",
  live_recording: "تسجيل مباشر",
};

const STATUS_LABEL: Record<string, string> = {
  processing: "جاري",
  completed: "جاهزة",
  failed: "فشلت",
};

/** صف المحاضرة كما بتقراه الصفحة. */
type LectureListItem = {
  id: string;
  title: string | null;
  original_filename: string | null;
  source_type: string;
  status: string;
  created_at: string;
  duration_seconds: number | null;
  transcript_text: string | null;
  summary: string | null;
  explanation: string | null;
};

export default async function MyLecturesPage() {
  const supabase = await createClient();

  // ١) المصادقة — الزائر يروح لصفحة الدخول (بعده = /lectures عشان يرجع).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/lectures");

  // ٢) محاضرات المستخدم بس + النص (عشان نفتحها من نفس الاستعلام).
  //    ⚠️ `summary` و`explanation` اتضافوا للاختيار عشان نعرف نعرض زرار
  //    المعالجة بس لو المحاضرة **لسه** مالهاش. الاختيار ده مش بيكسر
  //    حاجة: الأعمدة موجودة فعلاً في الجدول من migration #14.
  const { data, error } = await supabase
    .from("lectures")
    .select(
      "id, title, original_filename, source_type, status, created_at, duration_seconds, transcript_text, summary, explanation",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const lectures = (data ?? []) as LectureListItem[];

  return (
    <PageShell
      eyebrow="محاضراتي"
      title="محاضراتي 🎙️"
      lede="كل محاضرة حفظتها في حسابك — مع تفريغها النصي. تقدر تاخد منها ملخص وشرح بالذكاء الاصطناعي."
    >
      {/* ⚠️ مافيش fake data: لو الاستعلام فشل بنقولّك صريح، ومش بنعرض
          قائمة فاضية تخلّي الطالب يفتكر إن مفيش محاضرات. */}
      {error ? (
        <DataNotice message="مقدرناش نحمّل محاضراتك دلوقتي. حاول تاني كمان شوية." />
      ) : lectures.length === 0 ? (
        <EmptyState
          icon="🎙️"
          title="لسه مفيش محاضرات"
          body="ارفع تسجيل محاضرة من صفحة تفريغ المحاضرات، وسجّل دخول الأول — وهي تتحفظ هنا."
        />
      ) : (
        <section className="sheet-card divide-y divide-rule">
          {lectures.map((lecture) => (
            <article key={lecture.id} className="p-4">
              <details>
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-bold text-ink">
                      {lecture.title ?? lecture.original_filename ?? "محاضرة"}
                    </h2>
                    <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-ink-soft dark:bg-white/10">
                      {STATUS_LABEL[lecture.status] ?? lecture.status}
                    </span>
                  </div>

                  <p className="mt-1 text-xs text-ink-soft">
                    {/* ⬇️ لاحظ: كل الحقول دي نصوص من قاعدة البيانات بتترسم
                        كنص عادي (JSX بيهرّبها تلقائياً) — مافيش أي
                        dangerouslySetInnerHTML في الملف، فالنص اللي رجع
                        من ElevenLabs مش يقدر ينفّذ HTML. */}
                    {formatDate(lecture.created_at)}
                    {" · "}
                    {SOURCE_LABEL[lecture.source_type] ?? lecture.source_type}
                    {lecture.duration_seconds !== null && (
                      <>
                        {" · "}
                        {formatDuration(lecture.duration_seconds)}
                      </>
                    )}
                  </p>
                </summary>

                <div className="mt-3">
                  {/* ✨ معالجة بالذكاء الاصطناعي (Phase 4-A).
                      ملخص/شرح بس — flashcards وMCQ مرحلة تانية. الكومبوننت
                      بيخفي الزرار لما المحتوى موجود أصلاً. */}
                  <LectureProcessActions
                    lectureId={lecture.id}
                    hasSummary={Boolean(lecture.summary?.trim())}
                    hasExplanation={Boolean(lecture.explanation?.trim())}
                  />
                </div>

                {/* النتيجة المحفوظة من قبل — بتظهر بعد أول تحميل للصفحة.
                    (اللي اتولّد في نفس الجلسة بيعرضه الكومبوننت فوق فوراً.) */}
                {lecture.summary && (
                  <section className="mt-3">
                    <h3 className="text-sm font-bold text-ink">الملخص</h3>
                    <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/5 p-3 text-sm leading-relaxed text-ink dark:bg-white/10">
                      {lecture.summary}
                    </pre>
                  </section>
                )}

                {lecture.explanation && (
                  <section className="mt-3">
                    <h3 className="text-sm font-bold text-ink">الشرح</h3>
                    <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/5 p-3 text-sm leading-relaxed text-ink dark:bg-white/10">
                      {lecture.explanation}
                    </pre>
                  </section>
                )}

                <div className="mt-3">
                  {lecture.transcript_text ? (
                    <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/5 p-3 text-sm leading-relaxed text-ink dark:bg-white/10">
                      {lecture.transcript_text}
                    </pre>
                  ) : (
                    <p className="text-sm text-ink-soft">
                      مفيش نص محفوظ لهذه المحاضرة.
                    </p>
                  )}
                </div>
              </details>
            </article>
          ))}
        </section>
      )}
    </PageShell>
  );
}
