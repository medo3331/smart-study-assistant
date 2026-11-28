// اختبار بوابة الصلة (P2 مطلب 3) — ممنوع فيديو ملوش علاقة بالموضوع/المادة.
import { describe, it, expect } from "vitest";
import {
  relevanceVerdict,
  filterRelevantVideos,
  coreTopicToken,
} from "@/lib/lesson/video-relevance";
import { buildYouTubeQuery } from "@/lib/lesson/youtube-types";

const CTX = { topic: "تكامل بالأجزاء", subject: "رياضيات" };

describe("relevanceVerdict — بوابة الصلة", () => {
  it("بيرفض فيديو ملوش أي علاقة بالموضوع أو المادة", () => {
    const verdict = relevanceVerdict(
      { title: "أسرع وصفة كيك في ٥ دقائق", description: "طريقة عمل الكيك السفنجي في البيت" },
      CTX
    );
    expect(verdict.pass).toBe(false);
  });

  it("بيقبل فيديو فيه المفردة الأساسية للموضوع", () => {
    const verdict = relevanceVerdict(
      { title: "شرح التكامل بالأجزاء — أمثلة محلولة", description: "درس في مادة الرياضيات" },
      CTX
    );
    expect(verdict.pass).toBe(true);
    expect(verdict.reason).toContain("تكامل");
  });

  it("التطبيع العربي: الهمزات والتاء المربوطة مش بتمنع المطابقة", () => {
    const verdict = relevanceVerdict(
      { title: "شرح الإتكامل بالأجزاء — أقوى طريقة", description: "مادة الرياضيات" },
      CTX
    );
    expect(verdict.pass).toBe(true);
  });

  it("المادة لوحدها مش كفاية — فيديو في المادة بس مش في الموضوع بيرفض لو الموضوع دال", () => {
    const verdict = relevanceVerdict(
      { title: "ملخص منهج الرياضيات كامل", description: "مراجعة الرياضيات النهائية" },
      CTX
    );
    expect(verdict.pass).toBe(false);
  });

  it("الموضوع فاضي ⇒ كلمة واحدة من المادة تكفي", () => {
    const verdict = relevanceVerdict(
      { title: "شرح قوانين الحركة", description: "الفيزياء للثانوية" },
      { topic: "", subject: "فيزياء" }
    );
    expect(verdict.pass).toBe(true);
    const miss = relevanceVerdict(
      { title: "كورل درو من الصفر", description: "تعلم التصميم" },
      { topic: "", subject: "فيزياء" }
    );
    expect(miss.pass).toBe(false);
  });

  it("مفيش موضوع ولا مادة ⇒ بيمرّر (مش بنقدر نحكم)", () => {
    const verdict = relevanceVerdict({ title: "أي فيديو", description: "" }, {});
    expect(verdict.pass).toBe(true);
  });

  it("الوصف بيساهم في المطابقة — العنوان لوحده ضعيف بس الوصف فيه الموضوع", () => {
    const verdict = relevanceVerdict(
      { title: "دورة كاملة في التفاضل والتكامل", description: "الوحدة الرابعة: التكامل بالأجزاء خطوة بخطوة" },
      CTX
    );
    expect(verdict.pass).toBe(true);
  });
});

describe("coreTopicToken", () => {
  it("بيرجّع أطول كلمة دالة مجرّدة من السوابق (مش كلمة ركيكة)", () => {
    expect(coreTopicToken("تكامل بالأجزاء")).toBe("تكامل");
  });

  it("موضوع فاضي أو كله كلمات ركيكة ⇒ نص فاضي", () => {
    expect(coreTopicToken("")).toBe("");
    expect(coreTopicToken("درس شرح")).toBe("");
  });
});

describe("filterRelevantVideos — الترشيح والفرز", () => {
  const videos = [
    { id: "irrelevant", title: "أغنية جديدة ٢٠٢٥", description: "فيديو كليب" },
    { id: "relevant-weak", title: "مراجعة رياضيات", description: "تكامل بالأجزاء والتفاضل سوا" },
    { id: "relevant-strong", title: "شرح التكامل بالأجزاء بالتفصيل", description: "رياضيات — أمثلة محلولة" },
  ];

  it("اللي فشل بيتشال من العرض", () => {
    const passed = filterRelevantVideos(videos, CTX);
    expect(passed.map((v) => v.id)).not.toContain("irrelevant");
    expect(passed).toHaveLength(2);
  });

  it("الترتيب بالدرجة — الأقوى صلة أولًا", () => {
    const passed = filterRelevantVideos(
      [
        { id: "core-only", title: "التكامل خطوة بخطوة", description: "" },
        { id: "clear-overlap", title: "تكامل بالأجزاء — رياضيات", description: "شرح تكامل بالأجزاء بأمثلة" },
      ],
      CTX
    );
    // الأوضح صلة (كلمتين من الموضوع + المادة) قبل المفردة الأساسية لوحدها.
    expect(passed[0].id).toBe("clear-overlap");
    expect(passed[1].id).toBe("core-only");
  });

  it("لو كله مش مناسب ⇒ قايمة فاضية (أفضل من ترشيح ملوش علاقة)", () => {
    const passed = filterRelevantVideos(
      [{ id: "x", title: "مهارات التواصل", description: "تطوير الذات" }],
      CTX
    );
    expect(passed).toEqual([]);
  });
});

describe("buildYouTubeQuery — الاستعلام يشمل المادة والموضوع الاتنين", () => {
  it("الموضوع والمادة معًا (مش واحدة بدل التانية)", () => {
    const query = buildYouTubeQuery({ subject: "رياضيات", topic: "تكامل بالأجزاء", lesson: "تكامل بالأجزاء" });
    expect(query).toContain("رياضيات");
    expect(query).toContain("تكامل بالأجزاء");
  });

  it("مفيش تكرار — والمادة لوحدها لما الموضوع ناقص", () => {
    expect(buildYouTubeQuery({ subject: "فيزياء", topic: "فيزياء" })).toBe("فيزياء");
  });
});
