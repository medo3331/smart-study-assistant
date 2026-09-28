/* ============================================================================
   Phase 1 — Diagnostic Core (deterministic, pure, testable)
   ---------------------------------------------------------------------------
   الملف ده هو **مصدر الحقيقة الوحيد** لـ:
     • WEAK_THRESHOLD
     • حساب الدرجة (scoring)
     • كشف نقاط الضعف
     • تحديث الـmastery التراكمي

   ليه ملف جديد مش تعديل على القديم؟
   ---------------------------------------------------------------------------
   كان في **ثلاث** نسخ من `detectWeakTopics` في المشروع:
     1. lib/diagnostic-scoring.ts        → كانت بترمي exception
     2. lib/diagnostic-recommendations.ts → كانت بتثق في `is_correct`
     3. lib/diagnostic-scoring.ts (تانية) → شرط مختلف تمامًا

   النسخة التانية كانت بتثق في `is_correct` اللي **العميل بيبعته**، وده
   hole أمني حقيقي: سياسة الـRLS `diag_answers: user insert` بتسمح
   للمستخدم يكتب العمود ده بنفسه. فلو اتحسب عليه، حد يقدر يبعت score
   كامل لنفسه.

   هنا `isCorrectQuestion` بتقارن `selected_option_index` بـ
   `correct_option_index` من بنك الأسئلة **بس**.

   ---------------------------------------------------------------------------
   Phase 1 — PURE ONLY
   مفيش Supabase · مفيش API · مفيش UI · مفيش LLM · مفيش Date.now.
   نفس المدخلات ⇒ نفس المخرجات دايمًا. ده اللي يخلي الـloop قابل
   للإثبات بـtests بدل ما نبني عليه ونتguess.
   ========================================================================== */

/** أقل نسبة دقة يبقى الموضوع عندها ضعيفًا. */
export const WEAK_THRESHOLD = 0.6;

/** أقل عدد أسئلة نسمح بالحكم على موضوع بناءً عليه. */
export const MIN_QUESTIONS_FOR_JUDGEMENT = 2;

/** أقل عدد محاولات قبل ما الـmastery التراكمي يتحسب. */
/** أقل عدد أسئلة نعتبره دليل حقيقي (مش سؤال واحد عابر). */
export const MIN_ATTEMPTS_FOR_EVIDENCE = 1;

/** الاسم اللي بنحطه لموضوع ما ليهاش topic_id. */
export const UNTAGGED_TOPIC = "general";

/* ---------------------------------------------------------------------------
   الأنواع — مقلوبة من الـSQL
   ---------------------------------------------------------------------------
   أي تغيير في الـmigration لازم يتقابل هنا، وده اللي بيتحقق منه
   describe("schema alignment") في lib/__tests__/diagnostic-loop.test.ts.
   ------------------------------------------------------------------------- */

/**
 * row من public.diagnostic_question_bank (اللي نحتاجه بس).
 *
 * `correct_option_index` هو **مصدر الحقيقة الوحيد** للإجابة الصحيحة.
 * عمود `is_correct` في diagnostic_answers **مش** مصدر — العميل بيكتبه.
 */
export interface BankQuestion {
  id: string;
  /** FK → subjects.id — NOT NULL في الـSQL. */
  subject_id: string;
  /** FK → diagnostic_units.id — **nullable** (on delete set null). */
  unit_id: string | null;
  /** FK → diagnostic_topics.id — **nullable**. السطر ده مهم جدًا. */
  topic_id: string | null;
  question_type: "mcq" | "true_false";
  /** 0-based. حد app-level: لازم يكون < options_json.length. */
  correct_option_index: number;
}

/** row من public.diagnostic_answers — اللي عميل الطالب بيبعته. */
export interface DiagnosticAnswerInput {
  question_id: string;
  /** 0-based. العميل بيبعت ده وخلاص. */
  selected_option_index: number;
}

/** نتيجة سؤال واحد بعد ما اتحسبت على السيرفر. */
export interface QuestionResult {
  question_id: string;
  /**
   * معلومة داخلية — **متترجعش للعميل** في Phase 2.
   * الـroute اللي هيبعت الأسئلة لازم يشيل `correct_option_index`
   * من الـpayload.
   */
  correct_option_index: number;
  selected_option_index: number;
  /** محسوب هنا من question bank — مش من العميل. */
  is_correct: boolean;
  /** `UNTAGGED_TOPIC` لو `topic_id` كان null. */
  topic: string;
  unit_id: string | null;
}

/** أداء موضوع واحد. */
export interface TopicStat {
  topic: string;
  total: number;
  correct: number;
  /** ٠–١. 0 لو total = 0. */
  accuracy: number;
}

/** موضوع ضعيف. */
export interface WeakTopic {
  topic: string;
  accuracy: number;
  questions_attempted: number;
  questions_correct: number;
  /** priority أعلى = أضعف. */
  priority: "high" | "medium" | "low";
}

/** نتيجة الـscoring الكاملة. */
export interface DiagnosticResult {
  score: number;
  total: number;
  percentage: number;
  correct_count: number;
  wrong_count: number;
  per_question: QuestionResult[];
  topic_performance: TopicStat[];
  weak_topics: WeakTopic[];
  strong_topics: string[];
  insufficient_data_topics: string[];
}

/**
/**
 * الـmastery التراكمي لموضوع واحد — **evidence-weighted** (Phase 2).
 *
 * ⚠️ التغيير من Phase 1: الوزن بقى **بالأسئلة** مش **بالجلسات**.
 *
 * Phase 1 كان session-weighted:
 *   (previous_mastery + current_accuracy) / 2
 *   ⇒ جلسة من سؤالين وزنها زي جلسة من 10. غلط.
 *
 * دلوقتي evidence-weighted:
 *   (previous_correct + current_correct)
 *   ────────────────────────────────
 *   (previous_attempts + current_attempts)
 *
 * مثال: previous 3/10 ثم current 2/2 ⇒ 5/12 = 41.67%
 *
 * ⚠️ **`correct` و `attempts` لازم يكونوا counts صحيحة مش نسب.**
 * بنخزّن `mastery` + `attempts` + `correct` مع بعض، والـ`correct`
 * بيتحسب مرة واحدة وقت الكتابة ويتراجع منه. لو استنتجنا
 * `previous_correct` من `round(mastery × attempts)` هنخسر precision
 * وهنكون بنكرّر خطأ التقريب مع كل جلسة.
 */
export interface MasteryState {
  /** ٠–١ = correct / attempts. مش بتتقرب. */
  mastery: number;
  /** إجمالي الأسئلة اللي اتجاوبت على الموضوع ده. */
  attempts: number;
  /**
   * إجمالي الأسئلة الصح. **مصدر truth** للـmastery.
   * `mastery` مجرد cache مقروء من `correct / attempts`.
   */
  correct: number;
}

/** الخريطة: topic → MasteryState. */
export type MasteryMap = Record<string, MasteryState>;

/** التغيّر في الـmastery بعد جلسة جديدة. */
export interface MasteryDelta {
  topic: string;
  previous: number;
  updated: number;
  delta: number;
  attempts: number;
  correct: number;
}
/* ---------------------------------------------------------------------------
   ١) الدرجة
   ---------------------------------------------------------------------------
   `scoreDiagnosticSession` هنا **خالصة**: بتاخد الإجابات + بنك الأسئلة
   اللي الراوت قراهم من الداتابيز. الـI/O جوه Phase 2.

   `is_correct` من العميل مش بيدخل في الحساب خالص. لو بعتنا
   `is_correct` — حتى بالشكل الصح — بتتجاهل. نحسب من
   `correct_option_index` ونقارن. ده هو العقد الأمني للـPhase دي.
   ------------------------------------------------------------------------- */

/**
 * الحكم على سؤال واحد — المصدر الوحيد للحقيقة.
 *
 * `selected === correct` هو كل الحل. مفيش مرجع تاني.
 */
export function isCorrectQuestion(
  selected: number,
  correct: number
): boolean {
  // NaN ماشي صح: مقارنة NaN مع أي حاجة بتطلع false، وده المطلوب
  // (إجابة مش رقم = إجابة غلط، مش exception).
  return selected === correct;
}

/** خريطة question_id → row بنك الأسئلة. */
function indexQuestions(
  questions: readonly BankQuestion[]
): Map<string, BankQuestion> {
  const map = new Map<string, BankQuestion>();
  for (const q of questions) {
    map.set(q.id, q);
  }
  return map;
}

/** جمع إحصائيات لكل موضوع من نتائج الأسئلة. */
function aggregateByTopic(
  results: readonly QuestionResult[]
): TopicStat[] {
  const buckets = new Map<string, { total: number; correct: number }>();

  for (const r of results) {
    const b = buckets.get(r.topic) ?? { total: 0, correct: 0 };
    b.total += 1;
    if (r.is_correct) b.correct += 1;
    buckets.set(r.topic, b);
  }

  const out: TopicStat[] = [];
  for (const [topic, b] of buckets) {
    out.push({
      topic,
      total: b.total,
      correct: b.correct,
      accuracy: b.total === 0 ? 0 : b.correct / b.total,
    });
  }
  // ترتيب ثابت عشان الـtests تبقى حتمية.
  return out.sort((a, b) => a.topic.localeCompare(b.topic));
}

/**
 * يحسب نتيجة جلسة تشخيص كاملة.
 *
 * @param answers  إجابات العميل — الحقل الوحيد المسموح بيه
 *                 `selected_option_index`. لو فيها `is_correct` (بأي
 *                 شكل) **بتتجاهل تمامًا** — مش بنقراها أصلاً.
 * @param questions بنك الأسئلة: الـsource of truth.
 */
export function scoreDiagnosticSession(
  answers: readonly DiagnosticAnswerInput[],
  questions: readonly BankQuestion[]
): DiagnosticResult {
  const bank = indexQuestions(questions);
  const per_question: QuestionResult[] = [];

  for (const a of answers) {
    const q = bank.get(a.question_id);
    if (!q) {
      // سؤال مش في البنك = مستحيل نتحقق منه. بنعدّيه غلط (المتّ
      // المحافظ) بدل ما نرمي ونخسر باقي الجلسة. قرار مقصود: فضّل
      // نحسب conservatively على ما نلخبط المستخدم.
      per_question.push({
        question_id: a.question_id,
        correct_option_index: -1,
        selected_option_index: a.selected_option_index,
        is_correct: false,
        topic: UNTAGGED_TOPIC,
        unit_id: null,
      });
      continue;
    }

    per_question.push({
      question_id: q.id,
      correct_option_index: q.correct_option_index,
      selected_option_index: a.selected_option_index,
      is_correct: isCorrectQuestion(
        a.selected_option_index,
        q.correct_option_index
      ),
      // topic_id nullable في الـSQL — لازم نتعامل مع null صراحةً
      // وإلا هنحط undefined كمفتاح موضوع.
      topic: q.topic_id ?? UNTAGGED_TOPIC,
      unit_id: q.unit_id,
    });
  }

  const topic_performance = aggregateByTopic(per_question);
  const total = per_question.length;
  const correct_count = per_question.filter((r) => r.is_correct).length;

  const { weak, strong, insufficient } = classifyTopics(topic_performance);

  return {
    score: correct_count,
    total,
    percentage: total === 0 ? 0 : (correct_count / total) * 100,
    correct_count,
    wrong_count: total - correct_count,
    per_question,
    topic_performance,
    weak_topics: weak,
    strong_topics: strong,
    insufficient_data_topics: insufficient,
  };
}

/* ---------------------------------------------------------------------------
   ٢) نقاط الضعف
   ---------------------------------------------------------------------------
   نسخة واحدة بس. القاعدة مكتوبة صريحة:

     • total >= 2 && accuracy < 0.60          → weak
     • total === 1 && correct === 0           → weak  (ثقة منخفضة بس غلط واضح)
     • total === 1 && correct === 1           → insufficient (مش ضعيف)
     • total === 0                            → insufficient
     • غير كده                                → strong

   ليه موضوع واحد غلط = weak؟ لأنه سؤال واحد غلط في موضوع شفته أول مرة
   أقل دليل ممكن. لكن **مش** بنحسبه strong — بنحسبه insufficient-data
   (بيظهر للطالب إن عايز بيانات أكتر) وده أأمن من اعتقاد إن مستواه كويس.
   ------------------------------------------------------------------------- */

/** تصنيف كل المواضيع لـ weak / strong / insufficient. */
export function classifyTopics(
  stats: readonly TopicStat[]
): { weak: WeakTopic[]; strong: string[]; insufficient: string[] } {
  const weak: WeakTopic[] = [];
  const strong: string[] = [];
  const insufficient: string[] = [];

  for (const s of stats) {
    if (s.total === 0) {
      insufficient.push(s.topic);
      continue;
    }

    if (s.total < MIN_QUESTIONS_FOR_JUDGEMENT) {
      // موضوع واحد على الأقل — لو صح = insufficient، لو غلط = weak.
      if (s.correct === 0) {
        weak.push({
          topic: s.topic,
          accuracy: 0,
          questions_attempted: s.total,
          questions_correct: 0,
          priority: "high",
        });
      } else {
        insufficient.push(s.topic);
      }
      continue;
    }

    if (s.accuracy < WEAK_THRESHOLD) {
      weak.push({
        topic: s.topic,
        accuracy: s.accuracy,
        questions_attempted: s.total,
        questions_correct: s.correct,
        priority: s.accuracy < 0.4 ? "high" : "medium",
      });
    } else {
      strong.push(s.topic);
    }
  }

  // الأضعف الأول — ده اللي بيخلّي الـreplanner ياخد قراره بسهولة.
  weak.sort((a, b) => {
    if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
    return a.topic.localeCompare(b.topic); // tie-break حتمي
  });

  strong.sort();
  insufficient.sort();

  return { weak, strong, insufficient };
}

/** واجهة مختصة: من إحصائيات إلى نقاط ضعف بس. */
export function detectWeakTopics(
  stats: readonly TopicStat[]
): WeakTopic[] {
  return classifyTopics(stats).weak;
}

/* ---------------------------------------------------------------------------
   ٣) الـMastery التراكمي — evidence-weighted
   ---------------------------------------------------------------------------
   فصل مقصود بين **الحساب** و**الحفظ**:
     • الدوال هنا = حساب نقي. مفيش DB.
     • الـpersistence في الـAPI (Phase 2).

   ⚠️ **source of truth** = `diagnostic_answers` (كل إجابة، ما اتجاوبت
   غلط أو صح). `user_weaknesses` مجرد **materialized aggregate** —
   ممكن يتبنى تاني من الإجابات في أي وقت:

       diagnostic_answers  →  aggregate  →  user_weaknesses

   عشان كده بنخزّن **`correct` كعدد صحيح** مش كنسبة. لو خزّنّا النسبة
   بس كان لازم نستنتج `previous_correct = round(mastery × attempts)`
   ونخسر precision مع كل جلسة — خطأ تراكم بيخلي الـmastery ينحرف
   عن الحقيقة.
   ------------------------------------------------------------------------- */

/**
 * يحدّث الـmastery لموضوع واحد من evidence جديد.
 *
 * @param previous الحالة المتراكمة السابقة، أو null لو أول مرة.
 * @param current  إحصائيات الجلسة الحالية لهذا الموضوع.
 *
 * الـformula:
 *   new_correct   = previous.correct   + current.correct
 *   new_attempts  = previous.attempts  + current.total
 *   new_mastery   = new_correct / new_attempts
 */
export function updateTopicMastery(
  previous: MasteryState | null,
  current: TopicStat
): MasteryState {
  // ⚠️ `correct` ماينفعش يتعدّى `total` أبدًا. من غير clamp، بيانات
  // ناقصة أو فاسدة هتطلع mastery > 1، وattempts/correct متناقضين،
  // والـmastery بعد كده بيبقى مستحيل يتعاد بناؤه من الإجابات.
  const currentTotal = Math.max(0, current.total);
  const currentCorrect = Math.min(Math.max(0, current.correct), currentTotal);

  // أول مرة: الداتا الحالية هي كل اللي عندنا.
  if (!previous || previous.attempts <= 0) {
    return {
      mastery: currentTotal === 0 ? 0 : currentCorrect / currentTotal,
      attempts: currentTotal,
      correct: currentCorrect,
    };
  }

  const newCorrect = previous.correct + currentCorrect;
  const newAttempts = previous.attempts + currentTotal;

  // لو مفيش أسئلة جديدة، الحالة ما تتغيّرش.
  if (newAttempts === 0) {
    return { ...previous };
  }

  return {
    mastery: clamp01(newCorrect / newAttempts),
    attempts: newAttempts,
    correct: newCorrect,
  };
}

/**
 * يحدّث خريطة mastery كاملة من نتائج جلسة.
 *
 * @returns الخريطة الجديدة + قائمة التغييرات (للشرح في الـUI).
 */
export function updateMastery(
  previous: MasteryMap,
  topicPerformance: readonly TopicStat[]
): { mastery: MasteryMap; deltas: MasteryDelta[] } {
  const next: MasteryMap = { ...previous };
  const deltas: MasteryDelta[] = [];

  for (const s of topicPerformance) {
    const before = previous[s.topic] ?? null;
    const after = updateTopicMastery(before, s);
    next[s.topic] = after;
    deltas.push({
      topic: s.topic,
      previous: before?.mastery ?? 0,
      updated: after.mastery,
      delta: after.mastery - (before?.mastery ?? 0),
      attempts: after.attempts,
      correct: after.correct,
    });
  }

  return { mastery: next, deltas };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
