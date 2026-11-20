import { describe, it, expect } from "vitest";
import {
  summarizeByTopic,
  weakestTopic,
  FALLBACK_TOPIC,
  type TopicInput,
} from "../exam-topics";

/**
 * 🏷️ تقييم نقاط الضعف — «الطالب ضعيف في أنهي جزء من المحاضرة؟»
 *
 * القاعدة اللي بيقف عليها الوعد للطالب: كل سؤال مربوط بجزء، والنتيجة
 * بتتجمع عليه. أي خطأ في الترتيب معناه إننا بنقول للطالب يراجع الجزء
 * الغلط.
 */
describe("summarizeByTopic", () => {
  const mcq = (topic: string | null, correct: boolean | null): TopicInput => ({
    topic,
    type: "mcq",
    correct,
  });

  it("بيجمّع الأسئلة على نفس الجزء", () => {
    const rows = summarizeByTopic([
      mcq("القلب", true),
      mcq("القلب", true),
      mcq("القلب", false),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      topic: "القلب",
      score: 2,
      max: 3,
      questions: 3,
      percent: 67,
    });
  });

  it("بيرتّب الأضعف أولاً (ده اللي بيتعرض للطالب)", () => {
    const rows = summarizeByTopic([
      mcq("قوي", true),
      mcq("قوي", true),
      mcq("متوسط", true),
      mcq("متوسط", false),
      mcq("ضعيف", false),
      mcq("ضعيف", false),
    ]);

    expect(rows.map((row) => row.topic)).toEqual(["ضعيف", "متوسط", "قوي"]);
    expect(rows.map((row) => row.percent)).toEqual([0, 50, 100]);
  });

  it("المقالي بيتحسب من 5", () => {
    const rows = summarizeByTopic([{ topic: "تحليل", type: "essay", selfScore: 3 }]);

    expect(rows[0]).toMatchObject({ score: 3, max: 5, percent: 60 });
  });

  it("درجة المقالي مقيّدة 0..5 حتى لو العميل بعت رقم غريب", () => {
    const rows = summarizeByTopic([
      { topic: "أ", type: "essay", selfScore: 99 },
      { topic: "ب", type: "essay", selfScore: -4 },
      { topic: "ج", type: "essay", selfScore: Number.NaN },
    ]);

    const byTopic = new Map(rows.map((row) => [row.topic, row]));
    expect(byTopic.get("أ")!.score).toBe(5);
    expect(byTopic.get("ب")!.score).toBe(0);
    expect(byTopic.get("ج")!.score).toBe(0);
  });

  it("الأسئلة اللي ماتجاوبتش بتتخطّى (مش غلط)", () => {
    const rows = summarizeByTopic([
      mcq("القلب", true),
      mcq("القلب", null),
      { topic: "القلب", type: "essay", selfScore: null },
    ]);

    expect(rows[0]).toMatchObject({ score: 1, max: 1, questions: 1, percent: 100 });
  });

  it("سؤال من غير جزء بيتحط تحت «عام»", () => {
    const rows = summarizeByTopic([mcq(null, false), mcq("", true)]);

    expect(rows).toHaveLength(1);
    expect(rows[0].topic).toBe(FALLBACK_TOPIC);
    expect(rows[0]).toMatchObject({ score: 1, max: 2 });
  });

  it("امتحان من غير إجابات ⇒ مصفوفة فاضية", () => {
    expect(summarizeByTopic([])).toEqual([]);
    expect(summarizeByTopic([mcq("القلب", null)])).toEqual([]);
  });

  it("بيدمج المقالي والآلي في نفس الجزء", () => {
    const rows = summarizeByTopic([
      mcq("القلب", true),
      { topic: "القلب", type: "essay", selfScore: 2 },
    ]);

    expect(rows[0]).toMatchObject({ score: 3, max: 6, questions: 2, percent: 50 });
  });
});

describe("weakestTopic", () => {
  it("بيرجّع أول جزء (الأضعف) للملخّص", () => {
    const rows = summarizeByTopic([
      { topic: "قوي", type: "mcq", correct: true },
      { topic: "ضعيف", type: "mcq", correct: false },
    ]);
    expect(weakestTopic(rows)?.topic).toBe("ضعيف");
  });

  it("مفيش أجزاء ⇒ null", () => {
    expect(weakestTopic([])).toBeNull();
  });
});
