/**
 * 🚫 Gemini اتشال من سلسلة الـ fallback — 2026-11-12
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 🎯 **الادعاء اللي الملف ده بياثبته:**
 *
 *   `routeCandidates` **ما بيرجّعش** أي مرشّح من مزوّد `gemini` لو
 *   المهمة نصّية (أو أي مهمة مش محتكرة لـ Gemini).
 *
 *   ليه؟ المفتاح في `.env.local` **باطل**:
 *     `400 API_KEY_INVALID` (وفعلاً هو مفتاح NVIDIA متحط في المكان الغلط).
 *   وبما إن `GEMINI_API_KEY` **موجود** ⇒ `isConfigured("gemini")` =
 *   true ⇒ كان Gemini آخر مرشّح في **كل** نداء نصّي ⇒ نداء ضايع + 400.
 *
 *   (قرار المستخدم: «شيل Gemini من سلسلة الـ fallback لو مفيش مفتاح
 *   جديد» — ومفيش مفتاح جديد.)
 *
 * ⚠️ **اللي ماتغيّرش**: Gemini لسه مزوّد **أساسي** للمهام اللي هو
 *    محتكر فيها (`file_analysis` · `image_analysis` · `image_generation` ·
 *    `image_edit` · `video_generation`) — دي بتفشل نضيفة بدل ما يبقى
 *    مفيش مرشّح خالص.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { routeCandidates, AI_PROVIDER_BY_TASK } from "../routing";

/** المفتاح "موجود" بس باطل — ده اللي كان بيخلّي Gemini مرشّح. */
const FAKE_BROKEN_KEY = "nvapi-broken-key-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

/** مفاتيح وهمية للمزوّدات السليمة — عشان المرشّحين يبقى فيهم ناس. */
const FAKE_KEYS: Record<string, string> = {
  GROQ_API_KEY: "gsk-fake-key-for-routing-test",
  NVIDIA_API_KEY: "nvapi-fake-key-for-routing-test",
  OPENROUTER_API_KEY: "sk-or-fake-key-for-routing-test",
};

let originalEnv: Record<string, string | undefined>;

beforeEach(() => {
  originalEnv = { GEMINI_API_KEY: process.env.GEMINI_API_KEY };
  process.env.GEMINI_API_KEY = FAKE_BROKEN_KEY;
  for (const [key, value] of Object.entries(FAKE_KEYS)) {
    originalEnv[key] = process.env[key];
    process.env[key] = value;
  }
});

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

/** المهام اللي Gemini محتكر فيها — دي استثناء مقصود. */
const GEMINI_EXCLUSIVE_TASKS = [
  "file_analysis",
  "image_analysis",
  "image_generation",
  "image_edit",
  "video_generation",
] as const;

describe("routeCandidates — Gemini مش fallback", () => {
  it("⛔ مفيش مرشّح Gemini في مهمة النصوص (chat)", () => {
    const candidates = routeCandidates("chat");

    expect(candidates.length).toBeGreaterThan(0); // الراوتر لسه شغّال
    expect(
      candidates.filter((c) => c.provider === "gemini"),
    ).toHaveLength(0);
  });

  it("⛔ مفيش مرشّح Gemini في أي مهمة نصّية تانية", () => {
    const textTasks = [
      "chat",
      "explain",
      "summarize",
      "content",
      "marketing_copy",
      "tutor",
      "agent",
      "coding",
      "quiz",
      "flashcards",
      "study_plan",
      "lesson_analysis",
      "mind_map",
      "data_analysis",
      "planning",
      "business_plan",
      "marketing_plan",
      "roadmap",
      "rag_embeddings",
    ] as const;

    for (const task of textTasks) {
      const candidates = routeCandidates(task);
      expect(
        candidates.filter((c) => c.provider === "gemini"),
        `المهمة ${task} رجّعت مرشّح Gemini`,
      ).toHaveLength(0);
    }
  });

  it("⛔ مفيش مرشّح Gemini حتى لو الطلب فيه صورة", () => {
    // ⚠️ مسار الـ vision: كان فيه شرط `hasImage && p === "gemini"` يمنع
    //    Gemini من الـ fallback أصلاً — لازم نأكد إن الفحص الجديد مزال
    //    شغّال ومفيش تسريب.
    const candidates = routeCandidates("chat", new Date(), { hasImage: true });
    expect(candidates.filter((c) => c.provider === "gemini")).toHaveLength(0);
  });

  it("✅ Gemini لسه مزوّد أساسي للمهام المحتكر فيها", () => {
    // ⚠️ **مينفعش نشيله بالكامل**: المهام دي مفيش بديل تاني مسجّل،
    //    وشيله يخلّي الـ router يرمي «مفيش مرشّح» بدل رسالة واضحة.
    for (const task of GEMINI_EXCLUSIVE_TASKS) {
      expect(AI_PROVIDER_BY_TASK[task]).toBe("gemini");
    }
  });
});
