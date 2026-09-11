// اختبارات تفضيل الموديل في الراوتر — التغيير اللي بيخلي اقتراح
// prompt-engine مؤثر فعلًا بدل ما يكون حقل ميت في الطلب.
//
// المزوّدين لازم يبانوا "configured" عشان الراوتر ما يستبعدناش، فبنحط
// مفاتيح اختبار وهمية قبل الاستيراد (زي scripts/test-ai-router.mjs).
process.env.GROQ_API_KEY = "test-key-not-real";
process.env.NVIDIA_API_KEY = "test-key-not-real";
process.env.GEMINI_API_KEY = "test-key-not-real";

import { describe, expect, it } from "vitest";
import { AiRouter, routeCandidates } from "../routing";
import { MODEL_REGISTRY, MESSAGE_TYPE_MODEL_PREFERENCE, suggestModelForMessageType } from "../models";
import type { AiProviderName } from "../types";

const registered = (id?: string) => (id ? MODEL_REGISTRY.some((m) => m.id === id) : false);

describe("routeCandidates مع preferredModel", () => {
  it("من غير تفضيل: الترتيب القديم زي ما هو (مفيش تغيير سلوك)", () => {
    const candidates = routeCandidates("chat");
    expect(candidates[0]).toEqual({ provider: "groq", model: "openai/gpt-oss-120b" });
    expect(routeCandidates("chat", new Date(), undefined)).toEqual(candidates);
  });

  it("التفضيل بيتجرّب الأول", () => {
    const candidates = routeCandidates("chat", new Date(), "openai/gpt-oss-20b");
    expect(candidates[0]).toEqual({ provider: "groq", model: "openai/gpt-oss-20b" });
    // والمرشح الأساسي القديم لسه موجود بعده — مفيش استبدال، أولوية بس
    expect(candidates.slice(1)).toContainEqual({ provider: "groq", model: "openai/gpt-oss-120b" });
  });

  it("مفيش تكرار: التفضيل ما يتحطش مرتين", () => {
    const candidates = routeCandidates("chat", new Date(), "openai/gpt-oss-120b");
    const sameModel = candidates.filter((c) => c.model === "openai/gpt-oss-120b");
    expect(sameModel).toHaveLength(1);
  });

  it("معرّف غير مسجّل بيتجاهل بهدوء (مفيش throw)", () => {
    const withGhost = routeCandidates("chat", new Date(), "claude-sonnet-4.5");
    expect(withGhost).toEqual(routeCandidates("chat"));
  });

  it("موديل بلا القدرة المطلوبة للمهمة بيتجاهل — البوابة موحّدة", () => {
    // مهمة chat محتاجة text، وموديل الـ embeddings معندوش
    const embedOnly = "nvidia/nemotron-3-embed-1b";
    expect(MODEL_REGISTRY.find((m) => m.id === embedOnly)?.capabilities).toEqual(["embeddings"]);
    expect(routeCandidates("chat", new Date(), embedOnly)).toEqual(routeCandidates("chat"));
  });

  it("موديل موقوف (enabled:false) بيتجاهل حتى لو متفضّل", () => {
    const disabled = "deepseek-ai/deepseek-v4-flash-0731";
    expect(MODEL_REGISTRY.find((m) => m.id === disabled)?.enabled).toBe(false);
    expect(routeCandidates("chat", new Date(), disabled)).toEqual(routeCandidates("chat"));
  });
});

describe("AiRouter.completeChat بيستخدم التفضيل فعلًا", () => {
  const fakeProvider = (name: AiProviderName, calls: string[]) => ({
    name,
    async completeChat(input: { model?: string }) {
      calls.push(`${name}:${input.model ?? "(default)"}`);
      return {
        provider: name,
        model: input.model ?? "(default)",
        content: "رد",
        payload: {},
      };
    },
  });

  it("بينادي المزوّد بالموديل المفضّل", async () => {
    const calls: string[] = [];
    const router = new AiRouter([
      fakeProvider("groq", calls),
      fakeProvider("nvidia", calls),
      fakeProvider("openrouter", calls),
      fakeProvider("gemini", calls),
    ]);

    await router.completeChat("chat", {
      messages: [{ role: "user", content: "اختبرني" }],
      preferredModel: "openai/gpt-oss-20b",
    });

    expect(calls[0]).toBe("groq:openai/gpt-oss-20b");
  });

  it("من غير تفضيل بينادي المرشح الافتراضي للمهمة", async () => {
    const calls: string[] = [];
    const router = new AiRouter([
      fakeProvider("groq", calls),
      fakeProvider("nvidia", calls),
      fakeProvider("openrouter", calls),
      fakeProvider("gemini", calls),
    ]);

    await router.completeChat("chat", { messages: [{ role: "user", content: "أهلًا" }] });
    expect(calls[0]).toBe("groq:openai/gpt-oss-120b");
  });
});

describe("suggestModelForMessageType", () => {
  it("كل موديل مقترح مسجّل في السجل المركزي", () => {
    for (const [type, ids] of Object.entries(MESSAGE_TYPE_MODEL_PREFERENCE)) {
      for (const id of ids) {
        expect(registered(id), `${type}: ${id}`).toBe(true);
      }
    }
    expect(registered(suggestModelForMessageType("solve"))).toBe(true);
  });

  it("الاقتراح دايمًا موديل قابل للاختيار الآن", () => {
    for (const type of ["explain", "solve", "quiz", "plan"] as const) {
      const suggested = suggestModelForMessageType(type);
      expect(suggested).toBeDefined();
      const model = MODEL_REGISTRY.find((m) => m.id === suggested);
      expect(model?.enabled).toBe(true);
      expect(model?.freeEndpoint).toBe(true);
    }
  });

  it("general = مفيش تفضيل (الراوتر يختار)", () => {
    expect(suggestModelForMessageType("general")).toBeUndefined();
  });

  it("شرح جامعي ≠ شرح ثانوي", () => {
    expect(suggestModelForMessageType("explain", "جامعي")).not.toBe(
      suggestModelForMessageType("explain", "ثانوي")
    );
  });
});
