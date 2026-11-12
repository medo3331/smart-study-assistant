/**
 * 🖼️ اختبار عميل صور OpenRouter — 2026-11-12
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 🎯 **الادعاءات اللي الملف ده بياثبتها:**
 *
 *   ① الطلب بيبقى على **الواجهة الصح** (`/api/v1/images` مش `/chat/completions`)
 *      وبالشكل اللي الـ API بطلبه:
 *      `{ model, prompt, resolution, aspect_ratio }`.
 *   ② الرد `data[0].b64_json` بيتحوّل لـ base64 + **mime type صح**.
 *   ③ **402 (رصيد خلص)** ⇒ خطأ مميّز + **مش بنعمل نداء تاني** لحد ما
 *      الكاش يخلص (عشان كل صورة متأخّرةش بنداء بيلفّ 402).
 *   ④ `aspectRatioForSize` بيحوّل المقاس لنسبة OpenRouter.
 *
 * كل النداءات متعملة بـ mock — مافيش نداء شبكي.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  aspectRatioForSize,
  detectImageMime,
  generateWithOpenRouterImages,
  markOpenRouterCreditsExhausted,
  OPENROUTER_IMAGE_MODELS,
  OPENROUTER_IMAGES_URL,
  openRouterCreditsExhausted,
  resetOpenRouterCreditsState,
} from "../openrouter-image";

/** base64 لصورة PNG 1×1 حقيقية. */
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** JPEG صغير (SOI + FFD8FF). */
const JPEG_TINY = "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBD";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.OPENROUTER_API_KEY = "sk-or-test-key";
  resetOpenRouterCreditsState();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetOpenRouterCreditsState();
});

/* ═══════════════════════════ ① الطلب ═══════════════════════════ */

describe("generateWithOpenRouterImages — الطلب", () => {
  it("✅ بيبعت على /api/v1/images بالشكل المطلوب", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ b64_json: PNG_1X1 }], usage: { cost: 0.04 } }),
      text: async () => "",
    });

    await generateWithOpenRouterImages({
      prompt: "مخطط تعليمي",
      model: "openrouter-flux",
      resolution: "1K",
      aspectRatio: "16:9",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];

    // ⚠️ **الواجهة الصح** — مش chat/completions.
    expect(url).toBe(OPENROUTER_IMAGES_URL);
    expect(url).toBe("https://openrouter.ai/api/v1/images");

    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer sk-or-test-key");

    const body = JSON.parse(init.body);
    // ⚠️ الشكل المطلوب بالظبط.
    expect(body).toEqual({
      model: "black-forest-labs/flux.2-pro",
      prompt: "مخطط تعليمي",
      resolution: "1K",
      aspect_ratio: "16:9",
    });
    // ⚠️ `model` + `prompt` هم الإجباريين بس (من الـ openapi.json).
    expect(body.model).toBeTruthy();
    expect(body.prompt).toBeTruthy();
  });

  it("✅ الموديل الافتراضي = flux.2-pro، والبديل = seedream", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ b64_json: PNG_1X1 }] }),
      text: async () => "",
    });

    await generateWithOpenRouterImages({ prompt: "x", model: "openrouter-flux" });
    await generateWithOpenRouterImages({ prompt: "x", model: "openrouter-seedream" });

    const first = JSON.parse(fetchMock.mock.calls[0][1].body);
    const second = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(first.model).toBe("black-forest-labs/flux.2-pro");
    expect(second.model).toBe("bytedance-seed/seedream-4.5");
    // ⚠️ الافتراضي (لما `model` مش متظبط) لازم يبقى 1K + 1:1.
    expect(first.resolution).toBe("1K");
    expect(first.aspect_ratio).toBe("1:1");
  });

  it("✅ المفتاح بيروح في الـ header (مش في الـ body)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ b64_json: PNG_1X1 }] }),
      text: async () => "",
    });

    await generateWithOpenRouterImages({ prompt: "x", model: "openrouter-flux" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.api_key).toBeUndefined();
    expect(body.key).toBeUndefined();
  });

  it("⛔ مفيش مفتاح ⇒ خطأ واضح من غير نداء شبكة", async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(
      generateWithOpenRouterImages({ prompt: "x", model: "openrouter-flux" }),
    ).rejects.toThrow(/OPENROUTER_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/* ═══════════════════════════ ② الرد ═══════════════════════════ */

describe("generateWithOpenRouterImages — الرد", () => {
  it("✅ b64_json بيتحوّل لـ base64 + mime PNG", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ b64_json: PNG_1X1 }], usage: { cost: 0.04 } }),
      text: async () => "",
    });

    const out = await generateWithOpenRouterImages({
      prompt: "x",
      model: "openrouter-flux",
    });

    expect(out.base64).toBe(PNG_1X1);
    expect(out.mimeType).toBe("image/png");
    expect(out.model).toBe("black-forest-labs/flux.2-pro");
    expect(out.cost).toBe(0.04);
  });

  it("⛔ رد فاضي ⇒ خطأ (مش صورة مكسورة)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
      text: async () => "",
    });

    await expect(
      generateWithOpenRouterImages({ prompt: "x", model: "openrouter-flux" }),
    ).rejects.toThrow(/b64_json/);
  });

  it("⛔ خطأ HTTP (مش 402) ⇒ خطأ فيه الـ status", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({}),
      text: async () => '{"error":{"message":"Invalid request parameters"}}',
    });

    await expect(
      generateWithOpenRouterImages({ prompt: "x", model: "openrouter-flux" }),
    ).rejects.toThrow(/400/);
  });
});

/* ═══════════════════════════ ③ الرصيد ═══════════════════════════ */

describe("generateWithOpenRouterImages — الرصيد", () => {
  it("✅ 402 ⇒ خطأ مميّز (OpenRouterCreditsExhaustedError)", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({}),
      text: async () => '{"error":{"code":402,"message":"Insufficient credits."}}',
    });

    const { OpenRouterCreditsExhaustedError } = await import("../openrouter-image");
    await expect(
      generateWithOpenRouterImages({ prompt: "x", model: "openrouter-flux" }),
    ).rejects.toBeInstanceOf(OpenRouterCreditsExhaustedError);
  });

  it("✅ بعد 402 ⇒ الطلب الجاي مبيعملش نداء شبكة (كاش الرصيد)", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({}),
      text: async () => '{"error":{"code":402,"message":"Insufficient credits."}}',
    });

    await expect(
      generateWithOpenRouterImages({ prompt: "x", model: "openrouter-flux" }),
    ).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(openRouterCreditsExhausted()).toBe(true);

    // ⚠️ **المهم**: مافيش نداء تاني — عشان كل صورة متأخّرةش بنداء
    //    بيلفّ 402 قبل ما يكمّل لـ Pollinations.
    await expect(
      generateWithOpenRouterImages({ prompt: "x", model: "openrouter-flux" }),
    ).rejects.toThrow(/رصيد/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("✅ الكاش بيتمسح يدوي (بعد إضافة رصيد)", () => {
    markOpenRouterCreditsExhausted();
    expect(openRouterCreditsExhausted()).toBe(true);
    resetOpenRouterCreditsState();
    expect(openRouterCreditsExhausted()).toBe(false);
  });
});

/* ═══════════════════════════ ④ الأدوات ═══════════════════════════ */

describe("aspectRatioForSize — المقاس ← النسبة", () => {
  it("✅ 1024x1024 ⇒ 1:1", () => {
    expect(aspectRatioForSize("1024x1024")).toBe("1:1");
  });

  it("✅ 1792x1024 ⇒ 16:9", () => {
    expect(aspectRatioForSize("1792x1024")).toBe("16:9");
  });

  it("✅ 1024x1792 ⇒ 9:16", () => {
    expect(aspectRatioForSize("1024x1792")).toBe("9:16");
  });
});

describe("detectImageMime — نوع الصورة من البايتات", () => {
  it("✅ PNG", () => {
    expect(detectImageMime(PNG_1X1)).toBe("image/png");
  });

  it("✅ JPEG", () => {
    expect(detectImageMime(JPEG_TINY)).toBe("image/jpeg");
  });

  it("✅ WEBP", () => {
    const webp = Buffer.from("RIFF____WEBPVP8 ").toString("base64");
    expect(detectImageMime(webp)).toBe("image/webp");
  });

  it("✅ مدخل غريب ⇒ PNG (fallback آمن)", () => {
    expect(detectImageMime("")).toBe("image/png");
  });
});

/* ═══════════════════════════ الموديلات ═══════════════════════════ */

describe("OPENROUTER_IMAGE_MODELS — الموديلات", () => {
  it("✅ الافتراضي flux.2-pro والبديل seedream-4.5", () => {
    expect(OPENROUTER_IMAGE_MODELS["flux-2-pro"]).toBe(
      "black-forest-labs/flux.2-pro",
    );
    expect(OPENROUTER_IMAGE_MODELS["seedream-4.5"]).toBe(
      "bytedance-seed/seedream-4.5",
    );
  });
});
