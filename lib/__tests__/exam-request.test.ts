import { describe, it, expect } from "vitest";

import {
  buildExamAnswer,
  buildExamClarifyingAnswer,
  buildExamHref,
  detectExamRequest,
  extractSubject,
  EXAM_REQUEST_PROMPT_RULES,
} from "../exam-request";

/**
 * المساعد الشخصي — لازم ينفّذ طلب الامتحان بدل ما يسأل أسئلة توضيحية.
 * («تقصد 5 ولا مجموعتين؟» — الطالب قال 5، فالسؤال ده إهدار وقت.)
 */
describe("detectExamRequest — طلب امتحان مكتمل", () => {
  it("يطلّع المادة والعدد من جملة واحدة", () => {
    const request = detectExamRequest("اعمللي امتحان في الفيزياء من 10 أسئلة");
    expect(request).not.toBeNull();
    expect(request?.subject).toBe("الفيزياء");
    expect(request?.count).toBe(10);
    expect(request?.complete).toBe(true);
  });

  it("يقبل الأرقام الهندية", () => {
    const request = detectExamRequest("امتحان في الرياضيات من ١٢ سؤال");
    expect(request?.subject).toBe("الرياضيات");
    expect(request?.count).toBe(12);
  });

  it("يقرأ «عدد الأسئلة: 8»", () => {
    const request = detectExamRequest("كمان عايز امتحان في الكيمياء، عدد الأسئلة: 8");
    expect(request?.subject).toBe("الكيمياء");
    expect(request?.count).toBe(8);
  });

  it("يقرأ العدد الكلامي", () => {
    const request = detectExamRequest("امتحان في الأحياء من خمسة أسئلة");
    expect(request?.count).toBe(5);
  });

  it("يقرأ النمط والصعوبة", () => {
    const request = detectExamRequest("امتحان في الفيزياء من 7 أسئلة، صح وخطأ، مستوى صعب");
    expect(request?.types).toContain("true_false");
    expect(request?.difficulty).toBe("hard");
  });

  it("مش بيختلق مادة من جملة ناقصة", () => {
    const request = detectExamRequest("امتحان من 10 أسئلة");
    expect(request?.count).toBe(10);
    expect(request?.subject).toBeNull();
    expect(request?.complete).toBe(false);
  });

  it("مش بيفتعل طلب امتحان من كلام عادي", () => {
    expect(detectExamRequest("اشرحلي كود الـ SQL")).toBeNull();
    expect(detectExamRequest("امبارح عملت الامتحان")).toBeNull();
  });
});

describe("extractSubject — noises مالهاش مادة", () => {
  it("بيتجاهل «من 10» ويشوف المادة بعد «في»", () => {
    expect(extractSubject("امتحان من 10 أسئلة في الفيزياء")).toBe("الفيزياء");
  });

  it("بيتجاهل الأرقام والكلمات الوظيفية", () => {
    expect(extractSubject("امتحان")).toBeNull();
    expect(extractSubject("اختبار في")).toBeNull();
  });
});

describe("buildExamHref / buildExamAnswer", () => {
  it("الرابط بيحمل اختيار الطالب كله", () => {
    const request = detectExamRequest("امتحان في الفيزياء من 12 سؤال، مقالي، مستوى سهل");
    const href = buildExamHref(request!);
    expect(href).toContain("gen=1");
    expect(href).toContain(`subject=${encodeURIComponent("الفيزياء")}`);
    expect(href).toContain("count=12");
    expect(href).toContain("types=essay");
    expect(href).toContain("difficulty=easy");
  });

  it("الرد المكتمل مفيهوش سؤال توضيحي", () => {
    const request = detectExamRequest("امتحان في الفيزياء من 10 أسئلة");
    const answer = buildExamAnswer(request!);
    expect(answer).toContain("الفيزياء");
    expect(answer).toContain("/exams?gen=1");
    expect(answer).not.toContain("؟");
  });

  it("الرابط بيتكتب مطلق لو الـorigin متاح", () => {
    const request = detectExamRequest("امتحان في الفيزياء من 10 أسئلة");
    const answer = buildExamAnswer(request!, "https://magicly.app");
    expect(answer).toContain("https://magicly.app/exams?gen=1");
  });

  it("الرد الناقص بيسأل عن الناقص بس", () => {
    const request = detectExamRequest("امتحان من 10 أسئلة");
    const answer = buildExamClarifyingAnswer(request!);
    expect(answer).toContain("المادة");
    expect(answer).not.toContain("عدد الأسئلة");
  });
});

describe("EXAM_REQUEST_PROMPT_RULES", () => {
  it("بيمنع الموديل من يسأل أسئلة توضيحية", () => {
    expect(EXAM_REQUEST_PROMPT_RULES).toContain("متسألش أي سؤال توضيحي");
  });
});