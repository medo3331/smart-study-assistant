// lib/lesson/lab.ts
//
// 🧪 مختبر حل المشكلات — P6 (Subject Labs): Lab واحد فعلي للمواد الحسابية/
// البرمجية — حل تدريجي بتوجيه AI **بدون محاكيات**:
//   • «خطة» — المسألة تتقسم لخطوات (توجيه، مش إجابات نهائية).
//   • «خطوة» — الطالب يقدّم محاولته لكل خطوة والموديل بيقيّمها
//     (correct / partial / wrong + فيدباك) — نفس نداء الراوت الواحد.
//
// التخزين: `lesson_content.labs` jsonb (عمود من db/119) — آخر ٣ جلسات.
// الملف نقّي (pure) — قابل للاختبار مباشرة بـ vitest.

/** أقصى خطوات في الخطة. */
export const MAX_LAB_STEPS = 8;
/** أقل خطوات مقبولة — أقل من كده الرد مش خطة حل. */
export const MIN_LAB_STEPS = 2;
/** حدود النصوص. */
export const MAX_LAB_PROBLEM_CHARS = 3_000;
export const MAX_LAB_ATTEMPT_CHARS = 4_000;
export const MAX_LAB_FEEDBACK_CHARS = 1_200;
export const MAX_LAB_UNDERSTANDING_CHARS = 800;
/** أقصى جلسات محفوظة لكل درس. */
export const MAX_STORED_LABS = 3;

export type LabVerdict = "correct" | "partial" | "wrong";

export type LabStep = { title: string; guidance: string };

export type LabAttempt = {
  stepIndex: number;
  attempt: string;
  verdict: LabVerdict;
  feedback: string;
  at: string;
};

export type LabSession = {
  id: string;
  problem: string;
  understanding: string;
  steps: LabStep[];
  attempts: LabAttempt[];
  createdAt: string;
  updatedAt: string;
};

export function isLabVerdict(value: unknown): value is LabVerdict {
  return value === "correct" || value === "partial" || value === "wrong";
}

/** parse خطة الحل من رد الموديل — JSON (ممكن متغلف) ⇒ { understanding, steps } أو null. */
export function parseLabPlan(raw: string): { understanding: string; steps: LabStep[] } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;

  const understanding =
    typeof record.understanding === "string" && record.understanding.trim()
      ? record.understanding.trim().slice(0, MAX_LAB_UNDERSTANDING_CHARS)
      : "";

  if (!Array.isArray(record.steps)) return null;
  const steps: LabStep[] = [];
  for (const item of record.steps.slice(0, MAX_LAB_STEPS)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const title = typeof (item as { title?: unknown }).title === "string" ? ((item as { title: string }).title).trim() : "";
    const guidance =
      typeof (item as { guidance?: unknown }).guidance === "string" ? ((item as { guidance: string }).guidance).trim() : "";
    if (!title || !guidance) continue;
    steps.push({ title: title.slice(0, 200), guidance: guidance.slice(0, MAX_LAB_FEEDBACK_CHARS) });
  }
  if (steps.length < MIN_LAB_STEPS) return null;
  return { understanding, steps };
}

/** parse تقييم محاولة خطوة — JSON ⇒ { verdict, feedback } أو null. */
export function parseLabVerdict(raw: string): { verdict: LabVerdict; feedback: string } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (!isLabVerdict(record.verdict)) return null;
  const feedback = typeof record.feedback === "string" ? record.feedback.trim().slice(0, MAX_LAB_FEEDBACK_CHARS) : "";
  if (!feedback) return null;
  return { verdict: record.verdict, feedback };
}

/** تحقق شكل جلسة — يستخدم في القراءة والحفظ. */
function validSession(item: unknown): LabSession | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const record = item as Record<string, unknown>;
  const problem = typeof record.problem === "string" ? record.problem.trim() : "";
  if (!problem) return null;
  if (!Array.isArray(record.steps) || record.steps.length === 0) return null;
  const steps: LabStep[] = [];
  for (const step of record.steps) {
    if (!step || typeof step !== "object" || Array.isArray(step)) continue;
    const title = typeof (step as { title?: unknown }).title === "string" ? ((step as { title: string }).title).trim() : "";
    const guidance =
      typeof (step as { guidance?: unknown }).guidance === "string" ? ((step as { guidance: string }).guidance).trim() : "";
    if (title && guidance) steps.push({ title: title.slice(0, 200), guidance: guidance.slice(0, MAX_LAB_FEEDBACK_CHARS) });
  }
  if (steps.length === 0) return null;
  const attempts: LabAttempt[] = [];
  if (Array.isArray(record.attempts)) {
    for (const item of record.attempts) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const a = item as Record<string, unknown>;
      if (typeof a.stepIndex !== "number" || !Number.isInteger(a.stepIndex)) continue;
      if (typeof a.attempt !== "string" || !a.attempt.trim()) continue;
      if (!isLabVerdict(a.verdict)) continue;
      attempts.push({
        stepIndex: a.stepIndex,
        attempt: a.attempt.slice(0, MAX_LAB_ATTEMPT_CHARS),
        verdict: a.verdict,
        feedback: typeof a.feedback === "string" ? a.feedback.slice(0, MAX_LAB_FEEDBACK_CHARS) : "",
        at: typeof a.at === "string" ? a.at : "",
      });
    }
  }
  return {
    id: typeof record.id === "string" && record.id ? record.id.slice(0, 64) : "",
    problem: problem.slice(0, MAX_LAB_PROBLEM_CHARS),
    understanding: typeof record.understanding === "string" ? record.understanding.slice(0, MAX_LAB_UNDERSTANDING_CHARS) : "",
    steps,
    attempts,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : "",
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
  };
}

/** قراءة كل الجلسات المخزّنة (الأحدث الأول) — best-effort ⇒ []. */
export function readLabs(raw: unknown): LabSession[] {
  if (!Array.isArray(raw)) return [];
  const out: LabSession[] = [];
  for (const item of raw.slice(0, MAX_STORED_LABS)) {
    const session = validSession(item);
    if (session) out.push(session);
  }
  return out;
}

/** آخر جلسة (للعرض عند الفتح) — best-effort ⇒ null. */
export function readLatestLab(raw: unknown): LabSession | null {
  return readLabs(raw)[0] ?? null;
}

/** دمج جلسة (جديدة أو محدّثة) في القائمة المخزّنة — الأحدث أولًا بحد أقصى. */
export function upsertLabSession(stored: unknown, session: LabSession): LabSession[] {
  const rest = readLabs(stored).filter((existing) => existing.id !== session.id);
  return [session, ...rest].slice(0, MAX_STORED_LABS);
}
