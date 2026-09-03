import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

export default async function ExamDetailPage({ params }: { params: { examId: string } }) {
  const sb = await createClient();
  // RLS enforced: only published exam + linked questions visible
  const examResult = await sb.from("past_exams").select("id, title, exam_date, duration_minutes, total_marks, exam_file_path, answer_file_path, source_name, source_url").eq("id", params.examId).eq("is_published", true).limit(1);
  const { data: exam, error } = examResult;

  if (error || !exam || exam.length === 0) {
    return notFound(); // unpublished exam hidden by RLS + policy
  }

  const ex = exam[0];
  // Questions — only if exam is published and questions exist; else show honest message
  const questionsResult = await sb.from("past_exam_questions").select("id, question_number, question_text, marks, question_type").eq("exam_id", params.examId).order("question_number", { ascending: true }).limit(50);
  const { data: questions, error: qErr } = questionsResult;

  return (
    <main dir="rtl" className="min-h-screen bg-[#0D1029] text-[#F0E6D2] font-sans p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        <a href="/exams" className="text-sm text-amber-300 hover:underline mb-4 inline-block">← العودة لبنك الامتحانات</a>
        <article className="rounded-3xl border border-[#2A3050] bg-[#13182E] shadow-xl p-6 md:p-8">
          <header className="mb-6">
            <h1 className="text-3xl font-extrabold leading-snug mb-3">{ex.title}</h1>
            <div className="flex flex-wrap gap-2 text-sm text-slate-300">
              {ex.exam_date ? <span>التاريخ: {String(ex.exam_date)}</span> : null}
              {ex.duration_minutes ? <span>المدة: {ex.duration_minutes} دقيقة</span> : null}
              {ex.total_marks ? <span>الدرجة: {ex.total_marks}</span> : null}
              <span>المصدر: {ex.source_name}</span>
            </div>
          </header>

          <section aria-label="تفاصيل الامتحان" className="mb-6">
            {ex.exam_file_path ? (
              <a href={ex.exam_file_path} className="inline-block rounded-xl bg-[#2A3050] hover:bg-[#3A4060] text-[#F0E6D2] px-5 py-3 font-bold mb-4" target="_blank" rel="noopener noreferrer">📄 تحميل ورقة الامتحان</a>
            ) : (
              <p className="text-sm text-slate-400 mb-4">ملف الامتحان غير متوفر حالياً — سيتم إضافته عند التحقق من المصدر.</p>
            )}
            {ex.answer_file_path ? (
              <a href={ex.answer_file_path} className="inline-block rounded-xl bg-amber-950/40 border border-amber-700/30 text-amber-200 px-5 py-3 font-bold mb-4" target="_blank" rel="noopener noreferrer">📋 نموذج الإجابة الرسمي</a>
            ) : (
              <p className="text-sm text-slate-400 mb-4">نموذج الإجابة الرسمي لم يُضف بعد.</p>
            )}
          </section>

          <section aria-label="الأسئلة" className="mb-6">
            <h2 className="text-xl font-extrabold mb-3">أسئلة الامتحان</h2>
            {qErr ? (
              <p className="text-red-400 text-sm">تعذر تحميل الأسئلة.</p>
            ) : questions && questions.length > 0 ? (
              <ol className="list-decimal list-inside space-y-3 text-sm leading-relaxed">
                {questions.map((q: any) => (
                  <li key={q.id} className="bg-[#0D1029] border border-[#2A3050] rounded-xl p-3">
                    <span className="font-bold">{q.question_number}. </span>
                    <span>{q.question_text}</span>
                    {q.marks ? <span className="text-xs text-amber-300"> ({q.marks} نقطة)</span> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <div className="rounded-xl border border-dashed border-[#2A3050] bg-[#13182E]/60 p-6 text-center" role="status" aria-live="polite">
                <p className="font-extrabold text-lg mb-1">لم تتم إضافة أسئلة هذا الامتحان بعد.</p>
                <p className="text-slate-400 text-sm">سيتم إدخال الأسئلة بعد التحقق من مصدر الامتحان الرسمي.</p>
              </div>
            )}
          </section>

          <section aria-label="الإجابات الرسمية" className="mb-4">
            <h2 className="text-xl font-extrabold mb-3">الإجابات الرسمية</h2>
            <p className="text-sm text-slate-400">لم يتم إضافة الإجابات الرسمية بعد — سيتم إدخالها بعد التحقق من نموذج الإجابة الرسمي من المصدر.</p>
          </section>
        </article>
      </div>
    </main>
  );
}
