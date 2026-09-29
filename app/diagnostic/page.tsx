import { type Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { DiagnosticFlow } from "@/components/diagnostic/DiagnosticFlow";
import { fetchActiveExamPlan } from "@/lib/exam-plans";

export const metadata: Metadata = {
  title: "تشخيص سريع — Magicly",
  description: "اختبار قصير يقيس مستواك ويعدّل خطة مذاكرتك على أساس النتيجة.",
};

/* ============================================================================
   صفحة التشخيص
   ----------------------------------------------------------------------------
   Server component that resolves which subject the diagnostic should run
   against, then hands off to the client flow.

   ⚠️ WHY IT RESOLVES THE SUBJECT HERE AND NOT IN THE CLIENT
   The exam bank holds verified, eligible questions for exactly one subject
   (Mathematics, from the MOE paper). The route requires a subject_id, and
   picking one arbitrarily in the browser would be a guess that 404s the
   moment the bank grows. Instead we ask the database which subject actually
   has eligible questions, using the same eligibility rule the start route
   and the RPC apply, and say so plainly when none does — an honest empty
   state beats a button that fails.

   ⚠️ NO NEW API ROUTE. This reuses /api/diagnostic/start and
      /api/diagnostic/submit as they are. The count query is a read the
      page has to make anyway to decide whether to render the flow at all.
   ========================================================================== */

interface SubjectRow {
  id: string;
  name: string;
  count: number;
}

async function resolveSubject(
  userId: string
): Promise<{
  subject: SubjectRow | null;
  planId: string | null;
  error: string | null;
}> {
  const sb = await createClient();

  // The student's active exam plan, if any. The submit route needs the id
  // to run the replanner; without it the diagnostic is scored and stored
  // but the schedule is never touched, and plan_updated comes back false.
  const { data: plan } = await fetchActiveExamPlan(sb, userId);
  const planId = plan?.id ?? null;

  // Counted with the service-role client, deliberately.
  //
  // This is the same reasoning as /api/diagnostic/start, applied one level up:
  // whether an exam is published on /exams and whether its questions are
  // eligible for the diagnostic are different facts. That exam is deliberately
  // unpublished while its year and sitting are still contradicted, and the
  // diagnostic does not need the publication claim to serve a verified
  // question.
  //
  // Using RLS here instead would report zero subjects and every student would
  // see the empty state — accurate about /exams, wrong about the diagnostic.
  //
  // The eligibility filter is the same one the start route and the RPC apply,
  // restated here rather than inherited, so a subject only appears when the
  // diagnostic could actually run for it.
  const admin = createServiceClient();

  const { data: exams, error: examError } = await admin
    .from("past_exams")
    .select("id, subject_id, subjects(id, name)");

  if (examError) {
    return { subject: null, planId, error: examError.message };
  }

  const examIds = (exams ?? []).map((e) => e.id);

  const { data: eligible, error: qError } = await admin
    .from("past_exam_questions")
    .select("id, exam_id")
    .eq("question_type", "mcq")
    .eq("verification_status", "verified")
    .not("topic_id", "is", null)
    .not("correct_option_index", "is", null)
    .in("exam_id", examIds)
    .limit(1000);

  if (qError) {
    return { subject: null, planId, error: qError.message };
  }

  // Grouped in JS from two flat queries rather than through a Supabase embed.
  // The relation shape for a nested select is exactly the thing a live smoke
  // test once got wrong here, and counting in JS over ids cannot be wrong in
  // the same way: a question has an exam_id, the exam has a subject_id, and
  // the join is a Map lookup.
  const subjectByExam = new Map<string, { id: string; name: string }>();
  for (const row of (exams ?? []) as Array<{
    id: string;
    subject_id: string | null;
    subjects: { id: string; name: string } | { id: string; name: string }[] | null;
  }>) {
    const rel = row.subjects;
    const s = Array.isArray(rel) ? rel[0] : rel;
    if (!row.subject_id || !s?.id) continue;
    subjectByExam.set(row.id, { id: s.id, name: s.name });
  }

  const byId = new Map<string, { name: string; count: number }>();
  for (const row of (eligible ?? []) as Array<{ id: string; exam_id: string }>) {
    const s = subjectByExam.get(row.exam_id);
    if (!s) continue;
    const entry = byId.get(s.id) ?? { name: s.name, count: 0 };
    entry.count += 1;
    byId.set(s.id, entry);
  }

  if (byId.size === 0) return { subject: null, planId, error: null };

  // The subject with the most questions is the one most likely to have 10.
  let best: SubjectRow | null = null;
  for (const [id, v] of byId) {
    if (!best || v.count > best.count) {
      best = { id, name: v.name, count: v.count };
    }
  }
  return { subject: best, planId, error: null };
}

export default async function DiagnosticPage() {
  // A student with no session gets the honest empty state rather than a
  // crash: the routes would reject the submission anyway.
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return (
      <main dir="rtl" className="max-w-2xl mx-auto p-6 text-center space-y-3">
        <h1 className="text-2xl font-bold">تشخيص سريع</h1>
        <p className="text-[var(--muted-foreground)]">لازم تسجّل دخول الأول.</p>
        <Link href="/login" className="inline-block text-sm underline underline-offset-4">
          سجّل دخول
        </Link>
      </main>
    );
  }

  const { subject, planId, error } = await resolveSubject(user.id);

  if (error) {
    return (
      <main dir="rtl" className="max-w-2xl mx-auto p-6 text-center space-y-3">
        <h1 className="text-2xl font-bold">تشخيص سريع</h1>
        <p className="text-[var(--muted-foreground)]">
          مش قادرين نحمّل الأسئلة دلوقتي. جرب تاني بعد شوية.
        </p>
        <p className="text-xs text-[var(--muted-foreground)] opacity-70">{error}</p>
      </main>
    );
  }

  if (!subject) {
    return (
      <main dir="rtl" className="max-w-2xl mx-auto p-6 text-center space-y-3">
        <h1 className="text-2xl font-bold">تشخيص سريع</h1>
        <p className="text-[var(--muted-foreground)] leading-relaxed">
          مفيش أسئلة منشورة لسه. إحنا بنجهّز bank's أول اختبار متاح قريب.
        </p>
        <Link href="/dashboard" className="inline-block text-sm underline underline-offset-4">
          ارجع للداشبورد
        </Link>
      </main>
    );
  }

  return (
    <main dir="rtl" className="py-6">
      <DiagnosticFlow
        subjectId={subject.id}
        subjectName={subject.name}
        planId={planId ?? undefined}
        // The exam plan is rendered by ExamPlanCard on the dashboard, so
        // that is where "see your plan" should land. Without this prop the
        // notice renders its heading and reasons but no link at all, since
        // PlanChangeNotice treats planHref as optional.
        planHref={planId ? "/dashboard" : undefined}
      />
    </main>
  );
}
