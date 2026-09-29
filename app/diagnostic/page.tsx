import { type Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
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
   The bank currently holds verified questions for exactly one subject
   (Mathematics, from the MOE 2023 paper). The route requires a
   subject_id, and picking one arbitrarily in the browser would be a guess
   that 404s the moment the bank grows. Instead we ask the database which
   subject actually has published questions, and say so plainly when none
   does — an honest empty state beats a button that fails.

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

  const { data, error } = await sb
    .from("diagnostic_question_bank")
    .select("subject_id, subjects(id, name)")
    .eq("status", "published")
    .in("source_type", ["official", "verified", "curated", "validated"])
    .limit(200);

  if (error) {
    return { subject: null, planId, error: error.message };
  }

  // Group in JS rather than trusting a join shape we have not verified:
  // the relation comes back nested, and a count in SQL would hide that.
  const byId = new Map<string, { name: string; count: number }>();
  for (const row of (data ?? []) as Array<{
    subject_id: string | null;
    subjects: { id: string; name: string } | { id: string; name: string }[] | null;
  }>) {
    const rel = row.subjects;
    const s = Array.isArray(rel) ? rel[0] : rel;
    if (!row.subject_id || !s?.id) continue;
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
      />
    </main>
  );
}
