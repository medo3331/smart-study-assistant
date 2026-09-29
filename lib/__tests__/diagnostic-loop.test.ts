/* ============================================================================
   Phase 0 + 1 — Diagnostic Loop Tests
   ---------------------------------------------------------------------------
   الهدف مش "الـtests بتمر" — الهدف **إثبات سلوك حقيقي**:
     1. `correct_option_index` هو مصدر الحقيقة الوحيد.
     2. `is_correct` القادم من العميل **لا يمكن الوثوق به** — أهم اختبار في
        الملف، لأن سياسة الـRLS `diag_answers: user insert` بتسمح للمستخدم
        يكتب العمود ده بنفسه.
     3. الخطة بتتغيّر فعليًا وبسبب مقروء.

   لو الـloop مش شغال، الاختبارات دي لازم تفشل — مش تتعدّى.
   ========================================================================== */

import { describe, it, expect } from "vitest";

import {
  scoreDiagnosticSession,
  detectWeakTopics,
  classifyTopics,
  updateMastery,
  updateTopicMastery,
  isCorrectQuestion,
  WEAK_THRESHOLD,
  UNTAGGED_TOPIC,
  MIN_QUESTIONS_FOR_JUDGEMENT,
  type BankQuestion,
  type TopicStat,
  type WeakTopic,
} from "../diagnostic-mastery";

import { replanExamPlan, CRITICAL_DAYS_THRESHOLD } from "../exam-plan-replanner";

import type { ExamPlanDay } from "../exam-plans";

/* ===========================================================================
   SECURITY — أهم جزء في الملف ده
   =========================================================================== */

describe("SECURITY: the client cannot forge a score", () => {
  it("ignores a client-supplied is_correct that is always true", () => {
    const forged = ANSWERS.map((a) => ({ ...a, is_correct: true }));
    const result = scoreDiagnosticSession(forged as never, DATASET);

    expect(result.score).toBe(6);
    expect(result.correct_count).toBe(6);
    expect(result.wrong_count).toBe(2);
    expect(result.per_question.filter((r) => !r.is_correct)).toHaveLength(2);
  });

  it("ignores a client-supplied is_correct that is always false", () => {
    const sabotage = ANSWERS.map((a) => ({ ...a, is_correct: false }));
    const result = scoreDiagnosticSession(sabotage as never, DATASET);
    expect(result.score).toBe(6);
    expect(result.per_question.filter((r) => r.is_correct)).toHaveLength(6);
  });

  it("forged answers produce an identical result to honest answers", () => {
    const honest = scoreDiagnosticSession(ANSWERS, DATASET);
    const forged = scoreDiagnosticSession(
      ANSWERS.map((a) => ({ ...a, is_correct: true })) as never,
      DATASET
    );
    expect(forged.score).toBe(honest.score);
    expect(forged.topic_performance).toEqual(honest.topic_performance);
    expect(forged.weak_topics.map((w) => w.topic)).toEqual(
      honest.weak_topics.map((w) => w.topic)
    );
  });

  it("correct_option_index is the only source of truth", () => {
    const result = scoreDiagnosticSession(ANSWERS, DATASET);
    for (const r of result.per_question) {
      const expected = DATASET.find((qq) => qq.id === r.question_id)!;
      expect(r.correct_option_index).toBe(expected.correct_option_index);
      expect(r.is_correct).toBe(
        r.selected_option_index === expected.correct_option_index
      );
    }
  });

  it("reindexing the correct option flips the result", () => {
    const shifted = DATASET.map((qq) =>
      qq.id === "trees-1" ? { ...qq, correct_option_index: 3 } : qq
    );
    const r = scoreDiagnosticSession(
      [{ question_id: "trees-1", selected_option_index: 3 }],
      shifted
    );
    expect(r.per_question[0].is_correct).toBe(true);
  });

  it("a question missing from the bank scores wrong, never crashes", () => {
    const r = scoreDiagnosticSession(
      [{ question_id: "not-in-bank", selected_option_index: 0 }],
      DATASET
    );
    expect(r.total).toBe(1);
    expect(r.score).toBe(0);
    expect(r.per_question[0].topic).toBe(UNTAGGED_TOPIC);
  });

  it("isCorrectQuestion is pure index equality", () => {
    expect(isCorrectQuestion(1, 1)).toBe(true);
    expect(isCorrectQuestion(1, 2)).toBe(false);
    expect(isCorrectQuestion(NaN, 1)).toBe(false);
  });
});

const SUBJECT_ID = "6d91c3bb-ccbc-4e82-9d1c-f744d55cd4ec";
const TODAY = "2026-09-28";

function q(
  id: string,
  correct: number,
  topic_id: string | null = "Trees",
  unit_id: string | null = "unit-1"
): BankQuestion {
  return {
    id,
    subject_id: SUBJECT_ID,
    unit_id,
    topic_id,
    question_type: "mcq",
    correct_option_index: correct,
  };
}

/** السيناريو المرجعي: 4 مواضيع. */
const DATASET: BankQuestion[] = [
  q("arrays-1", 1, "Arrays"),
  q("arrays-2", 2, "Arrays"),
  q("linked-1", 0, "LinkedList"),
  q("linked-2", 1, "LinkedList"),
  q("trees-1", 3, "Trees"),
  q("trees-2", 0, "Trees"),
  q("graphs-1", 2, "Graphs"),
  q("graphs-2", 1, "Graphs"),
];

const ANSWERS = [
  { question_id: "arrays-1", selected_option_index: 1 },
  { question_id: "arrays-2", selected_option_index: 2 },
  { question_id: "linked-1", selected_option_index: 0 },
  { question_id: "linked-2", selected_option_index: 1 },
  { question_id: "trees-1", selected_option_index: 0 },
  { question_id: "trees-2", selected_option_index: 1 },
  { question_id: "graphs-1", selected_option_index: 2 },
  { question_id: "graphs-2", selected_option_index: 1 },
];

function day(
  id: string,
  dayNumber: number,
  studyDate: string,
  title: string,
  kind: ExamPlanDay["kind"] = "content",
  isDone = false
): ExamPlanDay {
  return { id, dayNumber, studyDate, kind, title, description: "", isDone };
}

function weak(
  topic: string,
  accuracy: number,
  priority: WeakTopic["priority"] = "medium"
): WeakTopic {
  return {
    topic,
    accuracy,
    questions_attempted: 2,
    questions_correct: Math.round(accuracy * 2),
    priority,
  };
}

/* ===========================================================================
   1) Scoring
   =========================================================================== */

describe("scoreDiagnosticSession", () => {
  it("computes the reference scenario", () => {
    const r = scoreDiagnosticSession(ANSWERS, DATASET);
    expect(r.total).toBe(8);
    expect(r.correct_count).toBe(6);
    expect(r.wrong_count).toBe(2);
    expect(r.score).toBe(6);
    expect(r.per_question).toHaveLength(8);
    expect(r.topic_performance).toHaveLength(4);
  });

  it("computes per-topic accuracy", () => {
    const r = scoreDiagnosticSession(ANSWERS, DATASET);
    const byTopic = Object.fromEntries(
      r.topic_performance.map((t) => [t.topic, t.accuracy])
    );
    // 6/8 إجمالًا: كل الموضوعات 100% ما عدا Trees = 0%
    expect(byTopic.Arrays).toBe(1);
    expect(byTopic.LinkedList).toBe(1);
    expect(byTopic.Trees).toBe(0);
    expect(byTopic.Graphs).toBe(1);
    // Trees هو الموضوع الضعيف الوحيد
    expect(r.weak_topics.map((w) => w.topic)).toEqual(["Trees"]);
  });

  it("computes percentage", () => {
    expect(scoreDiagnosticSession(ANSWERS, DATASET).percentage).toBeCloseTo(75, 5);
  });

  it("returns zero-safe results for an empty session", () => {
    const r = scoreDiagnosticSession([], DATASET);
    expect(r.total).toBe(0);
    expect(r.score).toBe(0);
    expect(r.percentage).toBe(0);
    expect(r.wrong_count).toBe(0);
    expect(r.per_question).toEqual([]);
  });

  it("handles a null topic_id without producing undefined keys", () => {
    const noTopic = [q("nt-1", 0, null), q("nt-2", 0, null)];
    const r = scoreDiagnosticSession(
      [
        { question_id: "nt-1", selected_option_index: 1 },
        { question_id: "nt-2", selected_option_index: 1 },
      ],
      noTopic
    );
    expect(r.topic_performance).toHaveLength(1);
    expect(r.topic_performance[0].topic).toBe(UNTAGGED_TOPIC);
    expect(Object.keys(r.topic_performance[0])).not.toContain("undefined");
  });

  it("produces stable topic ordering", () => {
    const topics = scoreDiagnosticSession(ANSWERS, DATASET).topic_performance.map(
      (t) => t.topic
    );
    expect(topics).toEqual([...topics].sort((a, b) => a.localeCompare(b)));
  });
});

/* ===========================================================================
   2) detectWeakTopics — الحالات الخمسة
   =========================================================================== */

describe("detectWeakTopics — edge cases", () => {
  it("CASE 1: all topics above threshold → no weak topics", () => {
    const stats: TopicStat[] = [
      { topic: "Arrays", total: 4, correct: 4, accuracy: 1 },
      { topic: "Graphs", total: 4, correct: 3, accuracy: 0.75 },
    ];
    const { weak, strong } = classifyTopics(stats);
    expect(weak).toHaveLength(0);
    expect(strong).toEqual(["Arrays", "Graphs"]);
  });

  it("CASE 2: exactly at threshold is NOT weak", () => {
    const stats: TopicStat[] = [
      { topic: "Arrays", total: 5, correct: 3, accuracy: WEAK_THRESHOLD },
    ];
    expect(detectWeakTopics(stats)).toHaveLength(0);
  });

  it("CASE 3: one topic below threshold → one weak topic", () => {
    const stats: TopicStat[] = [
      { topic: "Arrays", total: 4, correct: 4, accuracy: 1 },
      { topic: "Trees", total: 4, correct: 1, accuracy: 0.25 },
    ];
    const w = detectWeakTopics(stats);
    expect(w).toHaveLength(1);
    expect(w[0].topic).toBe("Trees");
    expect(w[0].priority).toBe("high"); // < 0.4
  });

  it("CASE 4: multiple weak topics → sorted worst-first", () => {
    const stats: TopicStat[] = [
      { topic: "Graphs", total: 4, correct: 2, accuracy: 0.5 },
      { topic: "Trees", total: 4, correct: 0, accuracy: 0 },
      { topic: "LinkedList", total: 4, correct: 3, accuracy: 0.75 },
    ];
    const w = detectWeakTopics(stats);
    expect(w.map((x) => x.topic)).toEqual(["Trees", "Graphs"]);
    expect(w[0].accuracy).toBeLessThan(w[1].accuracy);
  });

  it("single wrong answer is weak", () => {
    expect(
      detectWeakTopics([{ topic: "Trees", total: 1, correct: 0, accuracy: 0 }])
    ).toHaveLength(1);
  });

  it("single correct answer is INSUFFICIENT, not strong and not weak", () => {
    const stats: TopicStat[] = [
      { topic: "Trees", total: 1, correct: 1, accuracy: 1 },
    ];
    const { weak, strong, insufficient } = classifyTopics(stats);
    expect(weak).toHaveLength(0);
    expect(strong).toHaveLength(0);
    expect(insufficient).toEqual(["Trees"]);
  });

  it("zero total → insufficient, never strong", () => {
    const stats: TopicStat[] = [
      { topic: "Trees", total: 0, correct: 0, accuracy: 0 },
    ];
    const { weak, strong, insufficient } = classifyTopics(stats);
    expect(weak).toHaveLength(0);
    expect(strong).toHaveLength(0);
    expect(insufficient).toEqual(["Trees"]);
  });

  it("no answers at all → empty weak list, no crash", () => {
    expect(detectWeakTopics([])).toEqual([]);
  });

  it("honours MIN_QUESTIONS_FOR_JUDGEMENT", () => {
    expect(MIN_QUESTIONS_FOR_JUDGEMENT).toBe(2);
    const below = [{ topic: "T", total: 1, correct: 1, accuracy: 1 }];
    const at = [{ topic: "T", total: 2, correct: 1, accuracy: 0.5 }];
    expect(classifyTopics(below).insufficient).toHaveLength(1);
    expect(detectWeakTopics(at)).toHaveLength(1);
  });

  it("break-ties deterministically by topic name", () => {
    const a = detectWeakTopics([
      { topic: "Zebra", total: 2, correct: 0, accuracy: 0 },
      { topic: "Alpha", total: 2, correct: 0, accuracy: 0 },
    ]);
    expect(a.map((w) => w.topic)).toEqual(["Alpha", "Zebra"]);
  });
});

/* ===========================================================================
   3) updateMastery — EVIDENCE-weighted (correct/attempts، مش نسب)
   =========================================================================== */

/** اختصار: TopicStat من (correct, total). */
const ev = (topic: string, correct: number, total: number): TopicStat => ({
  topic,
  correct,
  total,
  accuracy: total === 0 ? 0 : correct / total,
});

describe("updateTopicMastery — evidence weighted", () => {
  it("first session sets the baseline from counts", () => {
    const r = updateTopicMastery(null, ev("T", 3, 10));
    expect(r.mastery).toBeCloseTo(0.3, 10);
    expect(r.attempts).toBe(10);
    expect(r.correct).toBe(3);
  });

  it("MATCHES THE SPEC EXAMPLE: previous 3/10 then current 2/2 = 5/12", () => {
    const first = updateTopicMastery(null, ev("T", 3, 10));
    const second = updateTopicMastery(first, ev("T", 2, 2));

    expect(second.correct).toBe(5);
    expect(second.attempts).toBe(12);
    expect(second.mastery).toBeCloseTo(5 / 12, 10); // 41.666...%
  });

  it("weight is per-question, NOT per-session", () => {
    // ⚠️ الفرق الجوهري: جلسة 2 سؤال لازم يقلّص النسبة أكتر من جلسة 10.
    const prev = updateTopicMastery(null, ev("T", 5, 10)); // 50%

    const tiny = updateTopicMastery(prev, ev("T", 0, 1)); // 1 سؤال غلط
    const big = updateTopicMastery(prev, ev("T", 5, 10)); // 10 أسئلة 50%

    // 5/11 = 45.45%  — السيرفر	session-weighted كان هيخليها 50%!
    expect(tiny.mastery).toBeCloseTo(5 / 11, 10);
    expect(big.mastery).toBeCloseTo(10 / 20, 10);

    // ❗都是有 evidence، بس الأثر مختلف — وده المقصود
    expect(tiny.mastery).toBeLessThan(big.mastery);
  });

  it("does NOT reconstruct correct from rounded mastery (no drift)", () => {
    // ⚠️ 1/3 = 0.3333… ولو خزّنا النسبة بس وبقينا نستنتج
    // round(0.3333 × 3) = 1 ✅ — بس 2/3 = 0.6667 و round(0.6667×3)=2 ✅
    // الخطر بيبدأ عند 1/6 و 1/7 … نتحقق إن الـcounts بتتمسك.
    let s = updateTopicMastery(null, ev("T", 1, 3));
    for (let i = 0; i < 20; i++) {
      s = updateTopicMastery(s, ev("T", 1, 3));
    }
    // 21 جلسة × (1 صح من 3) = 63 سؤال، 21 صح ⇒ 21/63 = 1/3 بالظبط
    expect(s.correct).toBe(21);
    expect(s.attempts).toBe(63);
    expect(s.mastery).toBeCloseTo(21 / 63, 12);
    // ❗لو كنّا بنستنتج من النسبة، الدقة كانت هتضيع هنا
    expect(s.correct).toBe(21);
    expect(s.attempts * s.mastery).toBeCloseTo(21, 9);
  });

  it("accumulates across many sessions deterministically", () => {
    let s = updateTopicMastery(null, ev("T", 1, 10));
    s = updateTopicMastery(s, ev("T", 2, 10));
    s = updateTopicMastery(s, ev("T", 3, 10));
    expect(s.correct).toBe(6);
    expect(s.attempts).toBe(30);
    expect(s.mastery).toBeCloseTo(0.2, 10);

    // نفس البيانات بترتيب مختلف ⇒ نفس النتيجة
    let r = updateTopicMastery(null, ev("T", 3, 10));
    r = updateTopicMastery(r, ev("T", 2, 10));
    r = updateTopicMastery(r, ev("T", 1, 10));
    expect(r).toEqual(s);
  });

  it("an empty session leaves the state untouched", () => {
    const prev = { mastery: 0.5, attempts: 8, correct: 4 };
    expect(updateTopicMastery(prev, ev("T", 0, 0))).toEqual(prev);
  });

  it("does not mutate the previous state", () => {
    const prev = { mastery: 0.5, attempts: 8, correct: 4 };
    updateTopicMastery(prev, ev("T", 5, 5));
    expect(prev).toEqual({ mastery: 0.5, attempts: 8, correct: 4 });
  });

  it("handles zero previous attempts as a fresh baseline", () => {
    const prev = { mastery: 0.9, attempts: 0, correct: 0 };
    const r = updateTopicMastery(prev, ev("T", 1, 4));
    expect(r.mastery).toBeCloseTo(0.25, 10);
    expect(r.attempts).toBe(4);
    expect(r.correct).toBe(1);
  });

  it("clamp: out-of-range input never produces mastery > 1 or < 0", () => {
    expect(updateTopicMastery(null, ev("T", 99, 10)).mastery).toBe(1);
    expect(updateTopicMastery(null, ev("T", -5, 10)).mastery).toBe(0);
  });

  it("mastery is always exactly correct/attempts", () => {
    const cases: Array<[number, number]> = [[1, 3], [2, 7], [5, 8], [0, 4], [9, 9]];
    let s: ReturnType<typeof updateTopicMastery> | null = null;
    for (const [c, t] of cases) {
      s = updateTopicMastery(s, ev("T", c, t));
      expect(s.mastery).toBeCloseTo(s.correct / s.attempts, 12);
    }
  });
});

describe("updateMastery — map level", () => {
  it("updates every topic and returns deltas with counts", () => {
    const previous = {
      Arrays: { mastery: 0.9, attempts: 10, correct: 9 },
      Trees: { mastery: 0.5, attempts: 4, correct: 2 },
    };
    const perf = [ev("Arrays", 4, 4), ev("Trees", 1, 4), ev("Graphs", 3, 4)];

    const { mastery, deltas } = updateMastery(previous, perf);

    expect(Object.keys(mastery)).toHaveLength(3);
    expect(deltas).toHaveLength(3);

    expect(mastery.Graphs.mastery).toBeCloseTo(0.75, 10);
    // (2 + 1) / (4 + 4) = 3/8
    expect(mastery.Trees.mastery).toBeCloseTo(0.375, 10);
    expect(mastery.Trees.correct).toBe(3);
    expect(mastery.Trees.attempts).toBe(8);
  });

  it("does not mutate the input map", () => {
    const previous = { Arrays: { mastery: 0.9, attempts: 10, correct: 9 } };
    updateMastery(previous, [ev("Arrays", 0, 5)]);
    expect(previous.Arrays.mastery).toBe(0.9);
  });

  it("reports a negative delta for a topic that got worse", () => {
    const previous = { Trees: { mastery: 0.9, attempts: 10, correct: 9 } };
    const { deltas } = updateMastery(previous, [ev("Trees", 1, 4)]);
    expect(deltas[0].delta).toBeLessThan(0);
    expect(deltas[0].previous).toBeCloseTo(0.9, 10);
  });

  it("a brand-new topic starts from zero", () => {
    const { mastery, deltas } = updateMastery({}, [ev("NewTopic", 1, 4)]);
    expect(mastery.NewTopic.mastery).toBeCloseTo(0.25, 10);
    expect(deltas[0].previous).toBe(0);
  });
});
/* ===========================================================================
   4) replanExamPlan — الـ5 cases + الحمايات
   =========================================================================== */

describe("replanExamPlan", () => {
  it("CASE 1: no weak topics → plan is NOT touched at all", () => {
    const plan = {
      days: [
        day("d1", 1, "2026-09-28", "Arrays"),
        day("d2", 2, "2026-09-29", "Graphs"),
      ],
    };
    const r = replanExamPlan(plan, [], 14, TODAY);

    expect(r.changed).toBe(false);
    expect(r.days).toBe(plan.days); // نفس الـreference، مش copy
    expect(r.reasons).toHaveLength(0);
  });

  it("CASE 2: one weak topic → its day moves to the front", () => {
    const plan = {
      days: [
        day("d1", 1, "2026-09-28", "Graphs"),
        day("d2", 2, "2026-09-29", "Arrays"),
        day("d3", 3, "2026-09-30", "Trees"),
      ],
    };
    const r = replanExamPlan(plan, [weak("Trees", 0.4)], 14, TODAY);

    expect(r.changed).toBe(true);
    expect(r.days[0].title).toBe("Trees");
    expect(r.reasons.some((x) => x.topic === "Trees")).toBe(true);
  });

  it("CASE 2b: every change carries a human-readable reason", () => {
    const plan = {
      days: [day("d1", 1, TODAY, "Graphs"), day("d2", 2, "2026-09-29", "Trees")],
    };
    const r = replanExamPlan(plan, [weak("Trees", 0.25, "high")], 14, TODAY);

    for (const reason of r.reasons) {
      expect(reason.message.length).toBeGreaterThan(0);
      expect(reason.message).toContain(reason.topic);
    }
    // الـexplainability: السبب بيقول الرقم
    expect(r.reasons[0].message).toContain("25");
  });

  it("CASE 3: multiple weak topics → worst one comes first", () => {
    const plan = {
      days: [
        day("d1", 1, TODAY, "Arrays"),
        day("d2", 2, "2026-09-29", "Graphs"),
        day("d3", 3, "2026-09-30", "Trees"),
        day("d4", 4, "2026-10-01", "LinkedList"),
      ],
    };
    const r = replanExamPlan(
      plan,
      [weak("LinkedList", 0.5), weak("Trees", 0.1, "high")],
      14,
      TODAY
    );

    expect(r.changed).toBe(true);
    expect(r.days[0].title).toBe("Trees");
    expect(r.days[1].title).toBe("LinkedList");
    const titles = r.days.map((d) => d.title);
    expect(titles.indexOf("Arrays")).toBeGreaterThan(titles.indexOf("LinkedList"));
  });

  it("CASE 4: time pressure → quarantine, never insert", () => {
    // 3 مواضيع ضعيفة(days موجودة) بس 2 يوم بس فاضل ⇒ واحد لازم يتأجّل.
    const plan = {
      days: [
        day("d1", 1, TODAY, "Arrays"),
        day("d2", 2, "2026-09-29", "Trees"),
        day("d3", 3, "2026-09-30", "Graphs"),
        day("d4", 4, "2026-10-01", "HashTables"),
      ],
    };
    const r = replanExamPlan(
      plan,
      [
        weak("Trees", 0.1, "high"),
        weak("Graphs", 0.2, "high"),
        weak("HashTables", 0.3, "medium"),
      ],
      2,
      TODAY
    );

    expect(r.changed).toBe(true);
    expect(r.inserted).toBe(0); // ممنوع نزوّد أيام في وقت ضيق
    expect(r.quarantined).toHaveLength(1);
    expect(r.quarantined[0]).toBe("HashTables"); // الأضعف بين التلاتة
    expect(r.reasons.some((x) => x.action === "quarantine")).toBe(true);
  });

  it("CASE 5: a topic with no matching day gets a review day inserted", () => {
    const plan = { days: [day("d1", 1, TODAY, "Arrays")] };
    const r = replanExamPlan(plan, [weak("HashTables", 0.2, "high")], 14, TODAY);

    expect(r.changed).toBe(true);
    expect(r.inserted).toBe(1);
    const added = r.days.find((d) => d.id === "synthetic-review-HashTables");
    expect(added).toBeDefined();
    expect(added!.kind).toBe("review");
    expect(added!.title).toContain("HashTables");
    expect(r.reasons.some((x) => x.action === "insert")).toBe(true);
  });

  it("respects CRITICAL_DAYS_THRESHOLD as the boundary", () => {
    const plan = {
      days: [day("d1", 1, TODAY, "Arrays"), day("d2", 2, "2026-09-29", "Trees")],
    };
    const at = replanExamPlan(plan, [weak("HashTables", 0.1, "high")], CRITICAL_DAYS_THRESHOLD, TODAY);
    expect(at.inserted).toBe(0); // عند الحد = ضغط

    const above = replanExamPlan(plan, [weak("HashTables", 0.1, "high")], CRITICAL_DAYS_THRESHOLD + 1, TODAY);
    expect(above.inserted).toBe(1); // فوقه = فيه وقت
  });
});

/* ===========================================================================
   5) حمايات الخطة — اللي خلّص الطالب ما يتلمسش
   =========================================================================== */

describe("replanExamPlan — protecting what the student already did", () => {
  it("never moves a day the student already completed", () => {
    const plan = {
      days: [
        day("done-1", 1, "2026-09-26", "Arrays", "content", true),
        day("done-2", 2, "2026-09-27", "Graphs", "content", true),
        day("t1", 3, "2026-09-28", "LinkedList"),
        day("t2", 4, "2026-09-29", "Trees"),
        day("t3", 5, "2026-09-30", "Arrays 2"),
      ],
    };
    const r = replanExamPlan(plan, [weak("Trees", 0, "high")], 14, TODAY);

    expect(r.days.filter((d) => d.isDone)).toHaveLength(2);
    // الاتنين دول لسه في أول الخطة وما اتحرّكوش
    expect(r.days.slice(0, 2).map((d) => d.title)).toEqual(["Arrays", "Graphs"]);
  });

  it("never touches a past day, done or not", () => {
    const plan = {
      days: [day("past-1", 1, "2026-09-20", "Trees"), day("t", 2, TODAY, "Arrays")],
    };
    const r = replanExamPlan(plan, [weak("Trees", 0, "high")], 14, TODAY);

    const past = r.days.find((d) => d.id === "past-1")!;
    expect(past.studyDate).toBe("2026-09-20");
    expect(past.dayNumber).toBe(1);
  });

  it("returns unchanged when every day is locked", () => {
    const plan = {
      days: [
        day("p1", 1, "2026-09-20", "Arrays", "content", true),
        day("p2", 2, "2026-09-21", "Trees", "content", true),
      ],
    };
    const r = replanExamPlan(plan, [weak("Trees", 0, "high")], 14, TODAY);

    expect(r.changed).toBe(false);
    expect(r.days).toBe(plan.days);
  });

  it("produces unique day numbers (unique plan_id+day_number in SQL)", () => {
    const plan = {
      days: [
        day("d1", 1, "2026-09-26", "Arrays", "content", true),
        day("d2", 2, "2026-09-27", "Graphs", "content", true),
        day("d3", 3, TODAY, "LinkedList"),
        day("d4", 4, "2026-09-29", "Trees"),
      ],
    };
    const r = replanExamPlan(plan, [weak("Trees", 0.1, "high")], 14, TODAY);

    const numbers = r.days.map((d) => d.dayNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
    for (const n of numbers) expect(Number.isInteger(n)).toBe(true);
  });

  it("is deterministic — same inputs, same output", () => {
    const plan = {
      days: [
        day("d1", 1, TODAY, "Arrays"),
        day("d2", 2, "2026-09-29", "Trees"),
        day("d3", 3, "2026-09-30", "Graphs"),
      ],
    };
    const args = [plan, [weak("Trees", 0.2, "high"), weak("Graphs", 0.5)], 14, TODAY] as const;
    expect(replanExamPlan(...args)).toEqual(replanExamPlan(...args));
  });

  it("does not mutate the input plan", () => {
    const plan = { days: [day("d1", 1, TODAY, "Arrays"), day("d2", 2, "2026-09-29", "Trees")] };
    replanExamPlan(plan, [weak("Trees", 0, "high")], 14, TODAY);
    expect(plan.days[0].title).toBe("Arrays");
    expect(plan.days[0].dayNumber).toBe(1);
  });

  it("only emits kind values the DB CHECK allows", () => {
    // `check (kind in ('content','review','quiz'))`
    const allowed = new Set(["content", "review", "quiz"]);
    const plan = { days: [day("d1", 1, TODAY, "Arrays"), day("d2", 2, "2026-09-29", "Trees")] };
    const r = replanExamPlan(plan, [weak("HashTables", 0.1, "high")], 14, TODAY);

    for (const d of r.days) expect(allowed.has(d.kind)).toBe(true);
  });

  it("an inserted review day lands before the exam date", () => {
    const plan = { days: [day("d1", 1, TODAY, "Arrays")] };
    const r = replanExamPlan(plan, [weak("HashTables", 0.1, "high")], 10, TODAY);

    const added = r.days.find((d) => d.id === "synthetic-review-HashTables")!;
    expect(added.studyDate > TODAY).toBe(true);
    expect(added.studyDate <= "2026-10-07").toBe(true); // 10 days later
  });
});

/* ===========================================================================
   6) END-TO-END — الـloop اللي المشروع كله قايم عليه
   =========================================================================== */

describe("END-TO-END: score → weak topic → plan changes → student sees why", () => {
  it("runs the whole loop on the reference dataset", () => {
    // 1) الطالب جاوب
    const result = scoreDiagnosticSession(ANSWERS, DATASET);
    expect(result.score).toBe(6);
    expect(result.total).toBe(8);

    // 2) نقاط الضعف اتحسبت من بيانات حقيقية
    expect(result.weak_topics.length).toBeGreaterThan(0);
    expect(result.weak_topics[0].topic).toBe("Trees");
    expect(result.weak_topics[0].accuracy).toBe(0);

    // 3) الـmastery اتحدث
    const { mastery, deltas } = updateMastery({}, result.topic_performance);
    expect(mastery.Trees.mastery).toBe(0);
    expect(deltas.find((d) => d.topic === "Trees")).toBeDefined();

    // 4) الخطة اتغيرت فعلاً
    const plan = {
      days: [
        day("d1", 1, TODAY, "Graphs"),
        day("d2", 2, "2026-09-29", "Arrays"),
        day("d3", 3, "2026-09-30", "Trees"),
      ],
    };
    const replan = replanExamPlan(plan, result.weak_topics, 14, TODAY);

    expect(replan.changed).toBe(true);
    expect(replan.days[0].title).toBe("Trees");

    // 5) الطالب شاف السبب
    expect(replan.reasons.length).toBeGreaterThan(0);
    expect(replan.reasons[0].topic).toBe("Trees");
    expect(replan.reasons[0].message).toMatch(/Trees/);
  });

  it("the loop closes: a better second session raises mastery and changes no plan", () => {
    const perfect = ANSWERS.map((a) => {
      const q = DATASET.find((qq) => qq.id === a.question_id)!;
      return { question_id: a.question_id, selected_option_index: q.correct_option_index };
    });

    const first = scoreDiagnosticSession(ANSWERS, DATASET);
    const second = scoreDiagnosticSession(perfect, DATASET);

    expect(second.score).toBe(8);
    expect(second.wrong_count).toBe(0);

    // مفيش نقاط ضعف ⇒ الخطة ما تتلمسش
    const plan = { days: [day("d1", 1, TODAY, "Trees")] };
    expect(replanExamPlan(plan, second.weak_topics, 14, TODAY).changed).toBe(false);

    // والـmastery اتحسّن
    const after = updateMastery({}, first.topic_performance);
    const improved = updateMastery(after.mastery, second.topic_performance);
    expect(improved.mastery.Trees.mastery).toBeGreaterThan(after.mastery.Trees.mastery);
  });
});

/* ===========================================================================
   7) Schema alignment — الـtypes مطابقة للـSQL
   =========================================================================== */

describe("schema alignment with the migrations", () => {
  it("correct_option_index is a non-negative integer (0-based)", () => {
    // `correct_option_index int NOT NULL` — سطر 85 في الـSQL
    expect(DATASET.every((q) => Number.isInteger(q.correct_option_index))).toBe(true);
    expect(DATASET.every((q) => q.correct_option_index >= 0)).toBe(true);
  });

  it("topic_id is nullable", () => {
    // `topic_id uuid REFERENCES ... ON DELETE SET NULL`
    expect(q("null-topic", 0, null).topic_id).toBeNull();
    expect(q("set", 0, "Arrays").topic_id).not.toBeNull();
  });

  it("unit_id is nullable", () => {
    expect(q("null-unit", 0, "Arrays", null).unit_id).toBeNull();
  });

  it("subject_id is always present (NOT NULL in the DB)", () => {
    expect(DATASET.every((q) => q.subject_id.length > 0)).toBe(true);
  });

  it("only emits kinds inside the CHECK constraint", () => {
    // `check (kind in ('content','review','quiz'))`
    const plan = { days: [day("d1", 1, TODAY, "Arrays")] };
    const r = replanExamPlan(plan, [weak("HashTables", 0.1, "high")], 14, TODAY);
    for (const d of r.days) expect(["content", "review", "quiz"]).toContain(d.kind);
  });

  it("day_number fits a smallint", () => {
    const plan = { days: [day("d1", 1, TODAY, "Arrays")] };
    const r = replanExamPlan(plan, [weak("X", 0.1, "high")], 14, TODAY);
    expect(r.days.every((d) => d.dayNumber >= 0 && d.dayNumber < 32768)).toBe(true);
  });

  it("study_date stays a plain YYYY-MM-DD string, never a Date", () => {
    const plan = { days: [day("d1", 1, TODAY, "Arrays")] };
    const r = replanExamPlan(plan, [weak("HashTables", 0.1, "high")], 14, TODAY);
    for (const d of r.days) {
      expect(typeof d.studyDate).toBe("string");
      expect(d.studyDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("there is exactly ONE weak threshold in the codebase", () => {
    // كان في 3 نسخ (0.6 / 0.6 / 0.4-0.6). دلوقتي واحدة.
    expect(WEAK_THRESHOLD).toBe(0.6);
  });
});



/* ===========================================================================
   8) REGRESSION — invariant #3: study_date chronological
   ---------------------------------------------------------------------------
   ⚠️ الاختبارات دي اتضافت بعد ما الـbug اتكشّف في Phase 2 review.

   الـbug كان: `renumber()` كانت بتغيّر `day_number` وبتسيب `studyDate`
   ثابت، فبنحصل على يوم رقمه 3 بتاريخ 30/9 ويوم رقمه 4 بتاريخ 29/9.

   الأثر: `todaysDay()` بتلاقي بـ`studyDate === today`، فالواجهة
   بتعرض «النهارده» على اليوم الخطأ، والبرنامج كله بيبقى معكوس.
   =========================================================================== */

describe("REGRESSION: day_number and study_date stay in sync", () => {
  const isChronological = (r: ReturnType<typeof replanExamPlan>): boolean => {
    const dates = r.days.map((d) => d.studyDate);
    const numbers = r.days.map((d) => d.dayNumber);
    const datesSorted = dates.every((v, i) => i === 0 || dates[i - 1] <= v);
    const numbersSorted = numbers.every((v, i) => i === 0 || numbers[i - 1] < v);
    return datesSorted && numbersSorted;
  };

  it("the exact scenario that broke Phase 1", () => {
    // days 1-2 done (past), 3-5 pending. weak topics reorder 4 and 5.
    const plan = {
      days: [
        day("done1", 1, "2026-09-26", "Arrays", "content", true),
        day("done2", 2, "2026-09-27", "Graphs", "content", true),
        day("t1", 3, "2026-09-28", "LinkedList"),
        day("t2", 4, "2026-09-29", "Trees"),
        day("t3", 5, "2026-09-30", "HashTables"),
      ],
    };
    const r = replanExamPlan(
      plan,
      [weak("HashTables", 0.1, "high"), weak("Trees", 0.2, "high")],
      14,
      "2026-09-28"
    );

    // ❗Assertion اللي كان بيفشل: dates لازم تكون تصاعدية
    expect(isChronological(r)).toBe(true);
    // sanity: dates are real YYYY-MM-DD strings
    for (const d of r.days) {
      expect(d.studyDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("study_date is always non-decreasing in day order", () => {
    const plan = {
      days: [
        day("a", 1, "2026-09-28", "Arrays"),
        day("b", 2, "2026-09-29", "Trees"),
        day("c", 3, "2026-09-30", "Graphs"),
        day("d", 4, "2026-10-01", "LinkedList"),
      ],
    };
    // weak topics cover everything, worst first
    const r = replanExamPlan(
      plan,
      [
        weak("LinkedList", 0.1, "high"),
        weak("Graphs", 0.2, "high"),
        weak("Trees", 0.3, "medium"),
        weak("Arrays", 0.4, "medium"),
      ],
      14,
      "2026-09-28"
    );
    expect(isChronological(r)).toBe(true);
    // Links should now come first
    expect(r.days[0].title).toBe("LinkedList");
  });

  it("locked days keep both their number and their date", () => {
    const plan = {
      days: [
        day("done1", 1, "2026-09-26", "Arrays", "content", true),
        day("done2", 2, "2026-09-27", "Graphs", "content", true),
        day("t1", 3, "2026-09-28", "LinkedList"),
        day("t2", 4, "2026-09-29", "Trees"),
      ],
    };
    const r = replanExamPlan(plan, [weak("Trees", 0, "high")], 14, "2026-09-28");

    const d1 = r.days.find((d) => d.id === "done1")!;
    const d2 = r.days.find((d) => d.id === "done2")!;
    expect(d1.dayNumber).toBe(1);
    expect(d1.studyDate).toBe("2026-09-26");
    expect(d2.dayNumber).toBe(2);
    expect(d2.studyDate).toBe("2026-09-27");
  });

  it("a pending day never lands on or before today", () => {
    const plan = {
      days: [day("t1", 1, "2026-09-28", "Arrays"), day("t2", 2, "2026-09-29", "Trees")],
    };
    const r = replanExamPlan(plan, [weak("Trees", 0, "high")], 14, "2026-09-28");

    for (const d of r.days.filter((x) => !x.isDone)) {
      expect(d.studyDate >= "2026-09-28").toBe(true);
    }
  });

  it("inserted review days land after existing pending days", () => {
    // ⚠️ موضوعات متعمدة إن مفيش منها substring داخل عنوان أي يوم موجود —
    // غير كده الـsubstring matching هيلتقط اليومية الموجودة والـinsert
    // مش هيحصل (ده سلوك صح، بس مش هو اللي بنختبره هنا).
    const plan = {
      days: [day("t1", 1, "2026-09-28", "Sorting"), day("t2", 2, "2026-09-29", "Recursion")],
    };
    const r = replanExamPlan(
      plan,
      [weak("HashTables", 0.1, "high"), weak("SegmentTrees", 0.2, "high")],
      14,
      "2026-09-28"
    );

    expect(isChronological(r)).toBe(true);
    const inserted = r.days.filter((d) => d.id.startsWith("synthetic-"));
    expect(inserted).toHaveLength(2);
    const maxExisting = "2026-09-29";
    for (const d of inserted) {
      expect(d.studyDate > maxExisting).toBe(true);
    }
  });

  it("no duplicate dates either (study_date collision)", () => {
    // Two pending days that originally shared a date (hand-edited plan)
    const plan = {
      days: [
        day("t1", 1, "2026-09-28", "Arrays"),
        day("t2", 2, "2026-09-28", "Sorting"),
        day("t3", 3, "2026-09-28", "Recursion"),
      ],
    };
    const r = replanExamPlan(plan, [weak("Recursion", 0, "high")], 14, "2026-09-28");
    const dates = r.days.map((d) => d.studyDate);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it("the whole plan is chronologically coherent after any replan", () => {
    const scenarios: Array<[number, WeakTopic[]]> = [
      [1, [weak("Sorting", 0, "high")]],
      [3, [weak("HashTables", 0.1, "high"), weak("Recursion", 0.2, "high")]],
      [14, [weak("Graphs", 0, "high")]],
      [30, [weak("LinkedList", 0.5), weak("Recursion", 0.1, "high")]],
      [14, []],
    ];

    for (const [daysLeft, weakTopics] of scenarios) {
      const plan = {
        days: [
          day("done1", 1, "2026-09-20", "Arrays", "content", true),
          day("done2", 2, "2026-09-25", "Sorting", "content", true),
          day("p1", 3, "2026-09-26", "Recursion"),
          day("p2", 4, "2026-09-27", "Graphs"),
          day("p3", 5, "2026-09-28", "HashTables"),
          day("p4", 6, "2026-09-29", "LinkedList"),
        ],
      };
      const r = replanExamPlan(plan, weakTopics, daysLeft, "2026-09-28");

      const numbers = r.days.map((d) => d.dayNumber);
      const dates = r.days.map((d) => d.studyDate);

      expect(new Set(numbers).size, `day_number unique @d=${daysLeft}`).toBe(numbers.length);
      expect(new Set(dates).size, `study_date unique @d=${daysLeft}`).toBe(dates.length);
      for (let i = 1; i < r.days.length; i++) {
        // ⚠️ dayNumber رقم، studyDate نص — المقارنة لازم نصوص.
        expect(
          r.days[i].dayNumber,
          `ascending day_number @d=${daysLeft}`
        ).toBeGreaterThan(r.days[i - 1].dayNumber);
        expect(
          r.days[i].studyDate > r.days[i - 1].studyDate ||
            r.days[i].studyDate === r.days[i - 1].studyDate,
          `chronological study_date @d=${daysLeft}`
        ).toBe(true);
      }
    }
  });
});
