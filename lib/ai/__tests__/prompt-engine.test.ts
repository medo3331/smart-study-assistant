// اختبارات محرك البرومبت — بتشتغل على النص الفعلي اللي بيتبعت للموديل.
import { describe, expect, it } from "vitest";
import {
  buildSystemPrompt,
  detectMessageType,
  getTemperature,
  normalizeStage,
  normalizeStyle,
  normalizeSubjectKey,
  resolveMessageType,
  type StudentProfile,
} from "../prompt-engine";

const profile = (overrides: Partial<StudentProfile> = {}): StudentProfile => ({
  full_name: "أحمد",
  stage: "ثانوي",
  grade: "Grade 2",
  subjects: ["الرياضيات", "فيزياء"],
  goal: "الالتحاق بكلية الهندسة",
  preferred_style: "تفصيلي",
  daily_study_hours: 3,
  ...overrides,
});

describe("normalizeStage — أسماء المراحل الحقيقية في الداتابيز", () => {
  it("يوحّد أسماء education_stages الإنجليزية", () => {
    // الأسماء دي مقيدة بـ CHECK في db/education-taxonomy-1.2c.5.sql
    expect(normalizeStage("Primary")).toBe("ابتدائي");
    expect(normalizeStage("Preparatory")).toBe("متوسط");
    expect(normalizeStage("Secondary")).toBe("ثانوي");
    expect(normalizeStage("Baccalaureate")).toBe("ثانوي");
    expect(normalizeStage("University")).toBe("جامعي");
  });

  it("يوحّد profiles.student_level (db/profile-persona.sql)", () => {
    expect(normalizeStage("prep")).toBe("متوسط");
    expect(normalizeStage("high")).toBe("ثانوي");
    expect(normalizeStage("uni")).toBe("جامعي");
    expect(normalizeStage("masters")).toBe("جامعي");
  });

  it("يقبل الاسم العربي باللفظ المصري والخليجي", () => {
    expect(normalizeStage("إعدادي")).toBe("متوسط");
    expect(normalizeStage("متوسط")).toBe("متوسط");
    expect(normalizeStage("ثانوية عامة")).toBe("ثانوي");
  });

  it("أي قيمة مجهولة أو ناقصة = أخرى (مفيش crash)", () => {
    expect(normalizeStage("حاجة غريبة")).toBe("أخرى");
    expect(normalizeStage(null)).toBe("أخرى");
    expect(normalizeStage(undefined)).toBe("أخرى");
    expect(normalizeStage(42)).toBe("أخرى");
  });
});

describe("normalizeStyle — أساليب التعلّم المخزّنة إنجليزية", () => {
  it("يوحّد practical/visual/academic المستخدمة في study_days", () => {
    expect(normalizeStyle("practical")).toBe("مبسّط");
    expect(normalizeStyle("visual")).toBe("خرائط ذهنية");
    expect(normalizeStyle("academic")).toBe("تفصيلي");
  });

  it("يقبل الأسماء العربية زي ما هي", () => {
    expect(normalizeStyle("أسئلة وأجوبة")).toBe("أسئلة وأجوبة");
    expect(normalizeStyle("خرائط ذهنية")).toBe("خرائط ذهنية");
  });

  it("قيمة مجهولة = null (ما نححقنش قسم أسلوب)", () => {
    expect(normalizeStyle("")).toBeNull();
    expect(normalizeStyle("random")).toBeNull();
    expect(normalizeStyle(undefined)).toBeNull();
  });
});

describe("normalizeSubjectKey — أسماء المواد مش موحّدة في الداتا", () => {
  it("يطابق الاسم العربي بالتعريف والاسم الإنجليزي", () => {
    expect(normalizeSubjectKey("الرياضيات")).toBe("رياضيات");
    expect(normalizeSubjectKey("رياضيات")).toBe("رياضيات");
    expect(normalizeSubjectKey("Mathematics")).toBe("رياضيات");
    expect(normalizeSubjectKey("الفيزياء")).toBe("فيزياء");
    expect(normalizeSubjectKey("Chemistry")).toBe("كيمياء");
    expect(normalizeSubjectKey("اللغة الإنجليزية")).toBe("لغة إنجليزية");
  });

  it("مادة برا القائمة المدعومة = null", () => {
    expect(normalizeSubjectKey("Computer Science")).toBeNull();
    expect(normalizeSubjectKey("")).toBeNull();
    expect(normalizeSubjectKey(null)).toBeNull();
  });
});

describe("detectMessageType", () => {
  it("يصنّف أسئلة الاختبار الخمسة في خطة الاختبار", () => {
    expect(detectMessageType("اشرح لي قانون نيوتن الثاني")).toBe("explain");
    expect(detectMessageType("حل: 2x + 5 = 15")).toBe("solve");
    expect(detectMessageType("اختبرني في الأحياء")).toBe("quiz");
    expect(detectMessageType("أبي خطة مذاكرة للأسبوع الجاي")).toBe("plan");
    expect(detectMessageType("وش الفرق بين الميتوسس والميوسس")).toBe("general");
  });

  it("طلبات الـ JSON تفضل general عشان ما تكسرش الواجهات", () => {
    // صفحات الكويز بتبعت النص ده حرفيًا وتعتمد على JSON.parse للرد
    const prompt =
      'اكتب 4 أسئلة اختيار من متعدد. رجّع الإجابة بصيغة JSON فقط بدون أي نص إضافي';
    expect(detectMessageType(prompt)).toBe("general");
  });

  it("رسالة فاضية = general", () => {
    expect(detectMessageType("")).toBe("general");
  });
});

describe("resolveMessageType — الوضع الصريح يسبق الكشف من النص", () => {
  it("زر اختبار في الواجهة = quiz حتى لو النص ما يقولش", () => {
    expect(resolveMessageType("quiz", "يلا بينا")).toBe("quiz");
  });

  it("وضع ملف/تلخيص = explain حتى لو النص فيه كلمة «حل»", () => {
    expect(resolveMessageType("file", "حل الملف ده")).toBe("explain");
    expect(resolveMessageType("summarize", "لخّصلي")).toBe("explain");
  });

  it("وضع explain أو غياب الوضع = الكشف من النص", () => {
    expect(resolveMessageType("explain", "حل: 2x + 5 = 15")).toBe("solve");
    expect(resolveMessageType(undefined, "اعمل خطة مذاكرة")).toBe("plan");
  });
});

describe("getTemperature", () => {
  it("أصغر = إبداع أعلى، وأكبر = دقة أعلى", () => {
    expect(getTemperature("Primary")).toBe(0.8);
    expect(getTemperature("Preparatory")).toBe(0.7);
    expect(getTemperature("Secondary")).toBe(0.5);
    expect(getTemperature("University")).toBe(0.4);
    expect(getTemperature(null)).toBe(0.7);
  });
});

describe("buildSystemPrompt", () => {
  it("بدون بروفايل: قواعد الأمان + الهوية + دعوة لإكمال التسجيل", () => {
    const prompt = buildSystemPrompt({ profile: null });
    expect(prompt).toContain("قواعد الأمان");
    expect(prompt).toContain("ماجيكلي");
    expect(prompt).toContain("لم يكمل التسجيل");
    // مفيش تسريب لأقسام التخصيص
    expect(prompt).not.toContain("تخصيص المرحلة");
  });

  it("قواعد الأمان دايمًا قبل الهوية والتخصيص", () => {
    const prompt = buildSystemPrompt({ profile: profile() });
    expect(prompt.indexOf("قواعد الأمان")).toBeLessThan(prompt.indexOf("ماجيكلي"));
    expect(prompt.indexOf("ماجيكلي")).toBeLessThan(prompt.indexOf("تخصيص المرحلة"));
  });

  it("بيحقن بيانات الطالب كاملة", () => {
    const prompt = buildSystemPrompt({ profile: profile() });
    expect(prompt).toContain("الاسم: أحمد");
    expect(prompt).toContain("المرحلة: ثانوي | الصف: Grade 2");
    expect(prompt).toContain("الهدف: الالتحاق بكلية الهندسة");
    expect(prompt).toContain("الرياضيات، فيزياء");
    expect(prompt).toContain("ساعات المذاكرة: 3 ساعة/يوم");
  });

  it("بيخصّص حسب المرحلة: ثانوي ياخد قواعد الامتحانات مش قواعد الطفل", () => {
    const secondary = buildSystemPrompt({ profile: profile({ stage: "ثانوي" }) });
    const primary = buildSystemPrompt({ profile: profile({ stage: "Primary" }) });
    expect(secondary).toContain("هذه نقطة مهمة جداً في الامتحان");
    expect(secondary).not.toContain("برافو! أنت بطل!");
    expect(primary).toContain("برافو! أنت بطل!");
    expect(primary).not.toContain("هذه نقطة مهمة جداً في الامتحان");
  });

  it("أسلوب مجهول ما يحقنش قسم أسلوب", () => {
    const prompt = buildSystemPrompt({ profile: profile({ preferred_style: "random" }) });
    expect(prompt).not.toContain("أسلوب الشرح المطلوب");
    const known = buildSystemPrompt({ profile: profile({ preferred_style: "visual" }) });
    expect(known).toContain("خرائط ذهنية وهيكلية");
  });

  it("بيحقن تعليمات المادة والموضوع الحالي", () => {
    const prompt = buildSystemPrompt({
      profile: profile(),
      currentSubject: "الرياضيات",
      currentTopic: "المعادلات التربيعية",
    });
    expect(prompt).toContain("تعليمات مادة الرياضيات");
    expect(prompt).toContain("الموضوع: المعادلات التربيعية");
  });

  it("نوع الرسالة بيغيّر القسم المحقون", () => {
    const solve = buildSystemPrompt({ profile: profile(), messageType: "solve" });
    const quiz = buildSystemPrompt({ profile: profile(), messageType: "quiz" });
    expect(solve).toContain("لا تحل مباشرة");
    expect(solve).not.toContain("جاهز للتحدي؟");
    expect(quiz).toContain("جاهز للتحدي؟");
  });

  it("بيحقن تعليمات الوضع الصريح فوق نوع الرسالة", () => {
    const prompt = buildSystemPrompt({
      profile: profile(),
      messageType: "explain",
      modeInstruction: "أنشئ فلاش كاردز قصيرة من المحتوى",
    });
    expect(prompt).toContain("تعليمات الوضع الحالي");
    expect(prompt).toContain("أنشئ فلاش كاردز قصيرة من المحتوى");
  });

  it("بيحقن الحقائق الموثوقة ونقاط الضعف", () => {
    const prompt = buildSystemPrompt({
      profile: profile(),
      extraFacts: ["التقدم: 4/10 دروس مكتملة"],
      weakTopics: [
        { subject: "الرياضيات", topic: "التفاضل", error_count: 3 },
        { subject: "الرياضيات", topic: "المتتابعات", error_count: 0 },
      ],
    });
    expect(prompt).toContain("سياق موثوق من حساب الطالب");
    expect(prompt).toContain("التقدم: 4/10 دروس مكتملة");
    expect(prompt).toContain("نقاط الضعف");
    expect(prompt).toContain("التفاضل (أخطأ 3 مرات)");
    // error_count = 0 معناها «مذكور» مش إحصائية — مفيش رقم مضلِّل
    expect(prompt).toContain("المتتابعات");
    expect(prompt).not.toContain("أخطأ 0 مرات");
  });

  it("حقول ناقصة (زي الداتا الحقيقية) ما تطلّعش نص مكسور", () => {
    const prompt = buildSystemPrompt({
      profile: profile({
        full_name: null,
        grade: null,
        goal: null,
        subjects: [],
        daily_study_hours: null,
      }),
    });
    expect(prompt).not.toContain("الاسم:");
    expect(prompt).not.toContain("الصف:");
    expect(prompt).not.toContain("الهدف:");
    expect(prompt).not.toContain("ساعات المذاكرة:");
    expect(prompt).toContain("المواد: غير محدد");
  });
});
