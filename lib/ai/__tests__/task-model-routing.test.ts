import { describe, it, expect } from "vitest";

import {
  AI_PROVIDER_BY_TASK,
  TASK_MODEL_PREFERENCE,
  preferenceForTask,
  primaryProviderForTask,
} from "../routing";
import { MODEL_REGISTRY, getModel } from "../models";

/**
 * 🔥 **تخصيص موديل لكل ميزة (Task-Specific Models)**.
 *
 * ⚠️ **اللي بنثبته**: كل مهمة ليها موديلاتها، ومفيش مهمة واحدة بتفرض
 *    «غالبًاReasoning» على كل حاجة.
 *
 *    - `exam_generation` ⇒ **سريع** (مش استدلال) — لأن التوليد نداءات
 *      JSON طويلة متتابعة، والموديل الاستدلالي بيحرق الوقت ⇒ 502/503.
 *    - `explain` ⇒ **قوي/استدلال** (محتاج تفكير).
 *    - `chat` ⇒ **سريع** (المحادثة العادية مش محتاجة تفكير عميق).
 */
describe("خريطة توجيه الموديلات حسب المهمة", () => {
  it("مهمة جديدة موجودة في العقد", () => {
    expect(AI_PROVIDER_BY_TASK.exam_generation).toBeDefined();
    expect(TASK_MODEL_PREFERENCE.exam_generation?.length ?? 0).toBeGreaterThan(0);
  });

  it("توليد الامتحانات: الأساسي **من غير استدلال**", () => {
    const first = getModel(TASK_MODEL_PREFERENCE.exam_generation![0]);
    expect(first.provider).toBe("groq");
    // ⚠️ الموديل الأساسي ما يكونش reasoning ⇒ سرعة + توكنز أقل.
    expect(first.capabilities).not.toContain("reasoning");
    // ⚠️ لازم يدعم إخراج JSON منظّم (المحرك بيتوقع JSON).
    expect(first.capabilities).toContain("structured_output");
  });

  it("توليد الامتحانات: فيه **بديل** بعد الأساسي (fallback لكل موديل)", () => {
    const list = TASK_MODEL_PREFERENCE.exam_generation!;
    expect(list.length).toBeGreaterThanOrEqual(3);
    // ⚠️ كل معرّف في السجل (وإلا الراوتر هيتجاهله في صمت).
    for (const id of list) {
      expect(() => getModel(id)).not.toThrow();
    }
  });

  it("الشرح: القوي (استدلال) هو الأساسي", () => {
    const first = getModel(TASK_MODEL_PREFERENCE.explain![0]);
    expect(first.capabilities).toContain("reasoning");
  });

  it("الدردشة: السريع هو الأساسي والقوي بديل", () => {
    const list = TASK_MODEL_PREFERENCE.chat!;
    const first = getModel(list[0]);
    expect(first.capabilities).not.toContain("reasoning");
    // ⚠️ لازم يفضل فيه موديل استدلال كبديل (جودة أعلى لوesteronevel).
    expect(list.some((id) => getModel(id).capabilities.includes("reasoning"))).toBe(true);
  });

  it("كل معرّفات التفضيلات مسجّلة في MODEL_REGISTRY", () => {
    const ids = new Set(MODEL_REGISTRY.map((m) => m.id));
    for (const [task, list] of Object.entries(TASK_MODEL_PREFERENCE)) {
      for (const id of list ?? []) {
        expect(ids.has(id), `${task} → ${id}`).toBe(true);
      }
    }
  });

  it("الموديل الأساسي لكل مهمة مفعّل فعلاً (مش معطّل في السجل)", () => {
    // ⚠️ موديل `enabled: false` = محجوب ⇒ لو كان الأساسي، كل نداءات
    //    المهمة دي هتروح لموديل تاني (أو نتيجة فاضية).
    for (const [task, list] of Object.entries(TASK_MODEL_PREFERENCE)) {
      const primary = getModel(list![0]);
      expect(primary.enabled, `${task} → ${primary.id} must be enabled`).toBe(true);
    }
  });
});

describe("التجاوز البيئي لموديلات/مزوّد التوليد", () => {
  it("من غير متغير ⇒ التفضيل الافتراضي", () => {
    delete process.env.EXAM_GENERATION_MODELS;
    expect(preferenceForTask("exam_generation")).toEqual(
      TASK_MODEL_PREFERENCE.exam_generation
    );
    expect(primaryProviderForTask("exam_generation", false)).toBe("groq");
  });

  it("`EXAM_GENERATION_MODELS` بيسبق الافتراضي (قرار تشغيلي)", () => {
    process.env.EXAM_GENERATION_MODELS = "openai/gpt-oss-120b,nvidia/nemotron-3-super-120b-a12b";
    try {
      expect(preferenceForTask("exam_generation")).toEqual([
        "openai/gpt-oss-120b",
        "nvidia/nemotron-3-super-120b-a12b",
      ]);
    } finally {
      delete process.env.EXAM_GENERATION_MODELS;
    }
  });

  it("`EXAM_GENERATION_PROVIDER` بيغيّر المزوّد الأساسي", () => {
    process.env.EXAM_GENERATION_PROVIDER = "openrouter";
    try {
      expect(primaryProviderForTask("exam_generation", false)).toBe("openrouter");
      // ⚠️ ت等其他 المهام غير متأثرة.
      expect(primaryProviderForTask("chat", false)).toBe("groq");
    } finally {
      delete process.env.EXAM_GENERATION_PROVIDER;
    }
  });

  it("قيمة غلط ما بتغيّرش حاجة", () => {
    process.env.EXAM_GENERATION_PROVIDER = "not-a-provider";
    try {
      expect(primaryProviderForTask("exam_generation", false)).toBe("groq");
    } finally {
      delete process.env.EXAM_GENERATION_PROVIDER;
    }
  });
});
