import { describe, it, expect } from "vitest";

import {
  buildExamAnswer,
  buildExamHref,
  containsExamSignal,
  detectExamRequest,
  detectExamRequestFromHistory,
  extractSubject,
  EXAM_REQUEST_PROMPT_RULES,
  isExamPlanningStatement,
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
    expect(request?.active).toBe(true);
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
    // ⚠️ الطلب لسه شغّال — لازم يوصّلنا لزر المولّد فورًا.
    expect(request?.active).toBe(true);
  });

  it("مش بيفتعل طلب امتحان من كلام عادي", () => {
    expect(detectExamRequest("اشرحلي كود الـ SQL")).toBeNull();
    expect(detectExamRequest("امبارح عملت الامتحان")).toBeNull();
  });
});

describe("detectExamRequestFromHistory — الكشف الـstateful (إصلاح الحلقة)", () => {
  it("بيجمع المادة والعدد من رسايل مختلفة", () => {
    const request = detectExamRequestFromHistory([
      { role: "user", content: "عايز امتحان في مادة اللغة العربية" },
      { role: "assistant", content: "كام عدد الأسئلة اللي هتعملها؟" },
      { role: "user", content: "5" },
    ]);
    expect(request?.active).toBe(true);
    expect(request?.count).toBe(5);
    expect(request?.subject).toContain("اللغة");
  });

  it("الرد القصير («عربي») بيتقرا كمادة", () => {
    const request = detectExamRequestFromHistory([
      { role: "user", content: "عايز امتحان" },
      { role: "assistant", content: "المادة إيه؟" },
      { role: "user", content: "عربي" },
    ]);
    expect(request?.subject).toBe("عربي");
    expect(request?.complete).toBe(false);
    expect(request?.active).toBe(true);
  });

  it("الحلقة بتتقفل: آخر رسالة مفيهاش كلمة امتحان بس الطلب لسه شغّال", () => {
    const request = detectExamRequestFromHistory([
      { role: "user", content: "عايز امتحان في مادة اللغة العربية" },
      { role: "assistant", content: "كام عدد الأسئلة اللي هتعملها؟" },
      { role: "user", content: "5" },
      { role: "assistant", content: "المادة إيه؟" },
      { role: "user", content: "عربي" },
    ]);
    expect(request?.active).toBe(true);
    expect(request?.subject).toBeTruthy();
    expect(request?.count).toBe(5);
  });

  it("مفيش طلب امتحان في الشات ⇒ مفيش اكتشاف", () => {
    expect(
      detectExamRequestFromHistory([
        { role: "user", content: "اشرحلي كود الـ SQL" },
        { role: "user", content: "تمام" },
      ])
    ).toBeNull();
  });

  it("كلام عن امتحان فات مش طلب", () => {
    expect(
      detectExamRequestFromHistory([{ role: "user", content: "امبارح عملت امتحان الفيزياء" }])
    ).toBeNull();
  });

  it("ردود زي «تمام» مش بتتقرا مادة", () => {
    const request = detectExamRequestFromHistory([
      { role: "user", content: "عايز امتحان" },
      { role: "user", content: "تمام" },
    ]);
    expect(request?.subject).toBeNull();
  });

  it("بيتكسر تكرار نفس الزر (الطالب قال «تمام» بعد ما وصله الزر)", () => {
    const request = detectExamRequestFromHistory([
      { role: "user", content: "عايز امتحان في مادة اللغة العربية" },
      {
        role: "assistant",
        content:
          "تمام — طلب امتحان (المادة: اللغة العربية).\n\nافتح مولّد الامتحان:\nhttps://magicly.app/exams?gen=1&subject=%D8%A7%D9%84%D9%84%D8%BA%D8%A9+%D8%A7%D9%84%D8%B9%D8%B1%D8%A8%D9%8A%D8%A9",
      },
      { role: "user", content: "تمام" },
    ]);
    expect(request).toBeNull();
  });

  it("بيرد تاني لو الطالب زوّد بيانات (5 بعد ما وصله الزر)", () => {
    const request = detectExamRequestFromHistory([
      { role: "user", content: "عايز امتحان في مادة اللغة العربية" },
      {
        role: "assistant",
        content:
          "تمام — طلب امتحان (المادة: اللغة العربية).\n\nافتح مولّد الامتحان:\nhttps://magicly.app/exams?gen=1&subject=%D8%A7%D9%84%D9%84%D8%BA%D8%A9+%D8%A7%D9%84%D8%B9%D8%B1%D8%A8%D9%8A%D8%A9",
      },
      { role: "user", content: "5" },
    ]);
    expect(request?.active).toBe(true);
    expect(request?.count).toBe(5);
    expect(request?.complete).toBe(true);
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

  it("«في مادة اللغة العربية» ⇒ المادة كاملة", () => {
    expect(extractSubject("عايز امتحان في مادة اللغة العربية")).toBe("اللغة العربية");
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

  it("الرابط بيتكتب مطلق لو الـorigin متاح", () => {
    const request = detectExamRequest("امتحان في الفيزياء من 10 أسئلة");
    const answer = buildExamAnswer(request!, "https://magicly.app");
    expect(answer).toContain("https://magicly.app/exams?gen=1");
  });

  it("الرد المكتمل مفيهوش سؤال توضيحي", () => {
    const request = detectExamRequest("امتحان في الفيزياء من 10 أسئلة");
    const answer = buildExamAnswer(request!);
    expect(answer).toContain("الفيزياء");
    expect(answer).toContain("/exams?gen=1");
    expect(answer).not.toContain("؟");
  });

  it("الرد الناقص مفيهوش سؤال توضيحي — بيوديه للشاشة", () => {
    const request = detectExamRequest("عايز امتحان");
    const answer = buildExamAnswer(request!);
    expect(answer).toContain("/exams?gen=1");
    expect(answer).not.toContain("؟");
  });
});

describe("containsExamSignal", () => {
  it("بيعرف نية الامتحان من غير نية forensics", () => {
    expect(containsExamSignal("عايز امتحان")).toBe(true);
    expect(containsExamSignal("اشرحلي كود")).toBe(false);
    expect(containsExamSignal("امبارح عملت امتحان")).toBe(false);
  });
});

describe("EXAM_REQUEST_PROMPT_RULES", () => {
  it("بيمنع الموديل من يسأل أسئلة توضيحية", () => {
    expect(EXAM_REQUEST_PROMPT_RULES).toContain("متسألش أسئلة توضيحية");
    expect(EXAM_REQUEST_PROMPT_RULES).toContain("افتح مولّد الامتحان");
  });
});

/**
 * 🌍 «موضوع عام» — المساعد لازم يقترح بدل ما يقول «مفيش محاضرات».
 */
describe("المساعد — اقتراح الموضوع العام", () => {
  const request = detectExamRequest("اعمللي امتحان في الفيزياء من 10 أسئلة")!;

  it("مافيش ملفات ⇒ الرابط فيه topic والمولّد يفتح على تاب الموضوع", () => {
    const href = buildExamHref(request, { topic: true });
    expect(href).toContain("/exams?");
    expect(href).toContain("topic=");
    expect(href).toContain("subject=");
  });

  it("مافيش ملفات ⇒ الرسالة بتقول «معلومات عامة» ومش «مفيش محاضرات»", () => {
    const answer = buildExamAnswer(request, "https://app.example", { hasSources: false });
    expect(answer).toContain("معلومات عامة");
    expect(answer).not.toContain("مفيش محاضرات");
    expect(answer).toContain("/exams?");
    expect(answer).toContain("topic=");
  });

  it("فيه ملفات ⇒ المسار العادي (محاضرات/مستندات) من غير topic", () => {
    const href = buildExamHref(request, { topic: false });
    expect(href).not.toContain("topic=");

    const answer = buildExamAnswer(request, "https://app.example", { hasSources: true });
    expect(answer).not.toContain("معلومات عامة");
    expect(answer).toContain("محاضراتك محفوظة جاهزة");
  });

  it("قواعد البرومبت بتقول صراحةً: متقولش «مفيش محاضرات»", () => {
    expect(EXAM_REQUEST_PROMPT_RULES).toContain("موضوع عام");
    expect(EXAM_REQUEST_PROMPT_RULES).toContain("مفيش محاضرات");
  });
});

describe("نيّة التخطيط مقابل طلب التوليد — «عندي امتحان»", () => {
  it("«عندي امتحان في الشبكات بعد يومين» مش طلب توليد — التخطيط بيرجّع للموديل", () => {
    expect(isExamPlanningStatement("عندي امتحان في الشبكات بعد يومين")).toBe(true);
    expect(detectExamRequest("عندي امتحان في الشبكات بعد يومين")).toBeNull();
    expect(containsExamSignal("عندي امتحان بعد يومين ومش مذاكر حاجة")).toBe(false);
    expect(
      detectExamRequestFromHistory([
        { role: "user", content: "عندي امتحان في الشبكات بعد يومين" },
      ])
    ).toBeNull();
  });

  it("صيغ تخطيط تانية: «امتحاني السبت» و«مش مستعد» و«رتبلي المهمات»", () => {
    expect(isExamPlanningStatement("امتحاني السبت على الشبكات")).toBe(true);
    expect(isExamPlanningStatement("مش مستعد لامتحان الرياضيات")).toBe(true);
    expect(isExamPlanningStatement("امتحان الشبكات قرب — رتبلي المهمات")).toBe(true);
    expect(detectExamRequest("باقي على الامتحان يومين")).toBeNull();
  });

  it("التوليد الصريح بيكسب لو اتقال مع حكي عن امتحان جاي", () => {
    expect(isExamPlanningStatement("عندي امتحان في الفيزياء، اختبرني")).toBe(false);
    const request = detectExamRequest("عندي امتحان، اعمل لي امتحان من 10 أسئلة");
    expect(request?.active).toBe(true);
  });

  it("حكي عن امتحان جاي بعد طلب توليد قديم مش بيرجّع زر المولّد", () => {
    expect(
      detectExamRequestFromHistory([
        { role: "user", content: "اعمل لي امتحان في الفيزياء" },
        { role: "assistant", content: "تمام — افتح مولّد الامتحان وأكمل الإعدادات." },
        { role: "user", content: "عندي امتحان شبكات بعد يومين" },
      ])
    ).toBeNull();
  });

  it("«اختبرني» طلب توليد صريح حتى من غير كلمة امتحان", () => {
    const request = detectExamRequest("اختبرني في الشبكات");
    expect(request?.active).toBe(true);
    expect(containsExamSignal("اختبرني في الشبكات")).toBe(true);
  });

  it("قواعد البرومبت بتفصل التخطيط عن التوليد", () => {
    expect(EXAM_REQUEST_PROMPT_RULES).toContain("متبعتش روابط ولا زر مولّد");
    expect(EXAM_REQUEST_PROMPT_RULES).toContain("طلب توليد صريح");
  });
});
