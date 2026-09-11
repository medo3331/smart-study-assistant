/**
 * اختبارات خدمات المحتوى الجديدة:
 *   - مولّد الصور التعليمية (بناء الـ prompt + سلسلة الـ fallback)
 *   - مولّد المخططات (تنظيف كود Mermaid + الـ prompt)
 *   - سجل الخدمات وحدود الباقات
 *   - مولّد الملفات (Word / Excel / PowerPoint / PDF)
 *   - محرك الـ prompt (إرشادات المخططات)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildEducationalImagePrompt,
  generateEducationalImage,
} from "../image-generator";
import {
  buildDiagramPrompt,
  cleanMermaidCode,
  generateDiagram,
  diagramTypesForSubject,
} from "../diagram-generator";
import {
  SERVICE_REGISTRY,
  IMAGE_MODELS_BY_TIER,
  consumeServiceQuota,
  peekServiceQuota,
  refundServiceQuota,
  resolveServiceTier,
} from "../service-registry";
import { generateFile } from "../file-generator";
import { DIAGRAM_GUIDELINES, withDiagramGuidelines } from "../prompt-engine";

/** Supabase وهمي — بيحدد نتيجة entitlement حسب السيناريو. */
function fakeSupabase(entitlements: Array<{ kind: string; value: string }>): SupabaseClient {
  return {
    rpc: vi.fn(async (_name: string, args: { p_kind: string; p_value: string }) => {
      const hit = entitlements.some(
        (e) => e.kind === args.p_kind && e.value === args.p_value
      );
      return { data: hit, error: null };
    }),
  } as unknown as SupabaseClient;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

// ─────────────────────────────────────────────
// 1. مولّد الصور التعليمية
// ─────────────────────────────────────────────
describe("Educational Image Prompt Builder", () => {
  it("includes style instructions and Arabic text rule", () => {
    const prompt = buildEducationalImagePrompt({
      prompt: "الدورة الدموية",
      style: "educational",
      language: "ar",
    });
    expect(prompt).toContain("الدورة الدموية");
    expect(prompt).toContain("educational illustration");
    expect(prompt).toContain("Arabic script");
  });

  it("adds stage adjustment when stage known", () => {
    const prompt = buildEducationalImagePrompt({
      prompt: "الكسور",
      stage: "ابتدائي",
    });
    expect(prompt).toContain("child-friendly");
  });

  it("adds subject context", () => {
    const prompt = buildEducationalImagePrompt({ prompt: "الخلية", subject: "أحياء" });
    expect(prompt).toContain("Subject context: أحياء");
  });

  it("skips Arabic script rule for English", () => {
    const prompt = buildEducationalImagePrompt({ prompt: "cell", language: "en" });
    expect(prompt).not.toContain("Arabic script");
  });
});

describe("generateEducationalImage fallback chain", () => {
  it("fails with friendly Arabic message when every provider (incl. free Pollinations) fails", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("REPLICATE_API_TOKEN", "");
    vi.stubEnv("STABILITY_API_KEY", "");
    // مفيش نت في الساندبوكس → حتى المزوّد المجاني هيفشل → الرسالة النهائية
    await expect(generateEducationalImage({ prompt: "صورة تجريبية" })).rejects.toThrow(
      "عذراً، تعذر توليد الصورة حاليا"
    );
  }, 30000);
});

// ─────────────────────────────────────────────
// 2. مولّد المخططات
// ─────────────────────────────────────────────
describe("Diagram Generator", () => {
  it("buildDiagramPrompt carries topic, type rules and language rules", () => {
    const prompt = buildDiagramPrompt({
      topic: "الجهاز الهضمي",
      type: "mindmap",
      subject: "أحياء",
      detail: "simple",
      language: "ar",
    });
    expect(prompt).toContain("الجهاز الهضمي");
    expect(prompt).toContain("mindmap");
    expect(prompt).toContain("اكتب كل النصوص بالعربية");
    expect(prompt).toContain("بسيط (5-8 عناصر)");
  });

  it("cleanMermaidCode strips code fences", () => {
    const raw = "```mermaid\nmindmap\n  root((موضوع))\n    فرع\n```";
    const cleaned = cleanMermaidCode(raw, "mindmap");
    expect(cleaned.startsWith("mindmap")).toBe(true);
    expect(cleaned).not.toContain("```");
  });

  it("cleanMermaidCode drops explanatory preamble before keyword", () => {
    const raw = "تفضل المخطط:\n\ntimeline\n  title الجدول\n  2020 : حدث";
    const cleaned = cleanMermaidCode(raw, "timeline");
    expect(cleaned.startsWith("timeline")).toBe(true);
    expect(cleaned).not.toContain("تفضل");
  });

  it("generateDiagram cleans AI response via injected completion fn", async () => {
    const result = await generateDiagram(
      { topic: "الحرب العالمية الثانية", type: "timeline" },
      async () => "```\ntimeline\n  title الحرب العالمية الثانية\n  1939 : البداية\n```"
    );
    expect(result.type).toBe("timeline");
    expect(result.title).toBe("الحرب العالمية الثانية");
    expect(result.mermaidCode.startsWith("timeline")).toBe(true);
    expect(result.mermaidCode).not.toContain("```");
  });

  it("generateDiagram throws on empty AI response", async () => {
    await expect(
      generateDiagram({ topic: "موضوع", type: "mindmap" }, async () => "   ")
    ).rejects.toThrow();
  });

  it("diagramTypesForSubject maps subjects", () => {
    expect(diagramTypesForSubject("تاريخ")).toContain("timeline");
    expect(diagramTypesForSubject("مادة غير معروفة")).toContain("mindmap");
  });
});

// ─────────────────────────────────────────────
// 3. سجل الخدمات وحدود الباقات
// ─────────────────────────────────────────────
describe("Service Registry", () => {
  it("registry covers all six services", () => {
    expect(Object.keys(SERVICE_REGISTRY)).toEqual([
      "image",
      "diagram",
      "file_pdf",
      "file_docx",
      "file_xlsx",
      "file_pptx",
    ]);
  });

  it("plan matrix matches product spec (free tier)", () => {
    // الصور بقت متاحة مجانًا عبر Pollinations
    expect(SERVICE_REGISTRY.image.dailyLimits.free).toBe(3);
    expect(SERVICE_REGISTRY.diagram.dailyLimits.free).toBe(3);
    expect(SERVICE_REGISTRY.file_pdf.dailyLimits.free).toBeGreaterThan(0);
    expect(SERVICE_REGISTRY.file_docx.dailyLimits.free).toBe(0);
    expect(SERVICE_REGISTRY.file_xlsx.dailyLimits.free).toBe(0);
    expect(SERVICE_REGISTRY.file_pptx.dailyLimits.free).toBe(0);
  });

  it("image models gated by tier — free gets Pollinations only", () => {
    expect(IMAGE_MODELS_BY_TIER.free).toEqual(["pollinations"]);
    expect(IMAGE_MODELS_BY_TIER.free).not.toContain("dall-e-3");
    expect(IMAGE_MODELS_BY_TIER.pro).toContain("pollinations");
    expect(IMAGE_MODELS_BY_TIER.pro).toContain("stable-diffusion-xl");
    expect(IMAGE_MODELS_BY_TIER.pro).not.toContain("dall-e-3");
    expect(IMAGE_MODELS_BY_TIER.ultra).toContain("dall-e-3");
    expect(IMAGE_MODELS_BY_TIER.ultra).toContain("flux-pro");
    expect(IMAGE_MODELS_BY_TIER.ultra).toContain("pollinations");
  });

  it("resolveServiceTier maps entitlements", async () => {
    await expect(resolveServiceTier(fakeSupabase([]), "u1")).resolves.toBe("free");
    await expect(
      resolveServiceTier(fakeSupabase([{ kind: "plan", value: "premium" }]), "u1")
    ).resolves.toBe("pro");
    await expect(
      resolveServiceTier(fakeSupabase([{ kind: "plan", value: "ultra" }]), "u1")
    ).resolves.toBe("ultra");
    await expect(resolveServiceTier(fakeSupabase([]), null)).resolves.toBe("free");
  });

  it("free user gets Pollinations images (3/day) then blocked", async () => {
    const sb = fakeSupabase([]);
    for (let i = 0; i < 3; i++) {
      const q = await consumeServiceQuota(sb, "user-free-img", "image");
      expect(q.allowed).toBe(true);
      expect(q.tier).toBe("free");
    }
    const blocked = await consumeServiceQuota(sb, "user-free-img", "image");
    expect(blocked.allowed).toBe(false);
  });

  it("free user gets 3 diagrams/day then blocked", async () => {
    const sb = fakeSupabase([]);
    for (let i = 0; i < 3; i++) {
      const q = await consumeServiceQuota(sb, "user-diag-limit", "diagram");
      expect(q.allowed).toBe(true);
    }
    const blocked = await consumeServiceQuota(sb, "user-diag-limit", "diagram");
    expect(blocked.allowed).toBe(false);
  });

  it("pro user gets SDXL-only image model list via tier", async () => {
    const sb = fakeSupabase([{ kind: "plan", value: "pro" }]);
    const quota = await consumeServiceQuota(sb, "user-pro-img", "image");
    expect(quota.allowed).toBe(true);
    expect(quota.tier).toBe("pro");
  });

  it("refundServiceQuota restores a consumed slot", async () => {
    const sb = fakeSupabase([]);
    const before = await peekServiceQuota(sb, "user-refund", "diagram");
    await consumeServiceQuota(sb, "user-refund", "diagram");
    const during = await peekServiceQuota(sb, "user-refund", "diagram");
    expect(during.used).toBe(before.used + 1);
    refundServiceQuota("user-refund", "diagram");
    const after = await peekServiceQuota(sb, "user-refund", "diagram");
    expect(after.used).toBe(before.used);
  });
});

// ─────────────────────────────────────────────
// 4. مولّد الملفات
// ─────────────────────────────────────────────
describe("File Generator", () => {
  const quizData = {
    questions: [
      {
        question: "ما هو ناتج 2 + 2؟",
        options: ["3", "4", "5", "6"],
        correct_answer: "4",
        explanation: "جمع بسيط",
        difficulty: "سهل",
      },
    ],
  };

  const planData = {
    daily_schedule: [
      {
        day: "السبت",
        tasks: [{ subject: "رياضيات", topic: "الجبر", duration_minutes: 30, priority: "عالية" }],
      },
    ],
  };

  const summaryData = {
    key_points: ["النقطة الأولى", "النقطة الثانية"],
    concepts: [{ term: "الخلية", definition: "وحدة بناء الكائنات الحية" }],
  };

  it("generates DOCX (zip magic bytes)", async () => {
    const result = await generateFile({
      type: "docx",
      content: "summary",
      title: "ملخص التجربة",
      data: summaryData,
    });
    expect(result.mimeType).toContain("wordprocessingml");
    expect(result.filename).toMatch(/\.docx$/);
    expect(result.buffer.subarray(0, 2).toString()).toBe("PK");
    expect(result.size).toBe(result.buffer.length);
  });

  it("generates XLSX from quiz questions", async () => {
    const result = await generateFile({
      type: "xlsx",
      content: "quiz",
      title: "كويز رياضيات",
      data: quizData,
    });
    expect(result.mimeType).toContain("spreadsheetml");
    expect(result.buffer.subarray(0, 2).toString()).toBe("PK");
  });

  it("generates XLSX from study plan", async () => {
    const result = await generateFile({
      type: "xlsx",
      content: "study_plan",
      title: "خطة الأسبوع",
      data: planData,
    });
    expect(result.buffer.subarray(0, 2).toString()).toBe("PK");
  });

  it("generates PPTX presentation", async () => {
    const result = await generateFile({
      type: "pptx",
      content: "summary",
      title: "عرض تقديمي",
      subject: "علوم",
      data: summaryData,
    });
    expect(result.mimeType).toContain("presentationml");
    expect(result.buffer.subarray(0, 2).toString()).toBe("PK");
  });

  it("generates PDF (font fetch may fail in sandbox → Helvetica fallback)", async () => {
    const result = await generateFile({
      type: "pdf",
      content: "summary",
      title: "ملخص PDF",
      data: summaryData,
      studentName: "طالب تجريبي",
    });
    expect(result.mimeType).toBe("application/pdf");
    expect(result.buffer.subarray(0, 5).toString()).toBe("%PDF-");
  }, 30000);

  it("sanitizes filenames", async () => {
    const result = await generateFile({
      type: "docx",
      content: "summary",
      title: "ملف/باسم:غريب*فعلاً?",
      data: summaryData,
    });
    expect(result.filename).not.toMatch(/[\\/:*?"<>]/);
    expect(result.filename.endsWith(".docx")).toBe(true);
  });

  it("rejects unsupported file type", async () => {
    await expect(
      generateFile({
        type: "zip" as never,
        content: "summary",
        title: "تست",
        data: {},
      })
    ).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────
// 5. محرك الـ Prompt
// ─────────────────────────────────────────────
describe("Prompt Engine", () => {
  it("DIAGRAM_GUIDELINES covers the main mermaid diagram kinds", () => {
    expect(DIAGRAM_GUIDELINES).toContain("mindmap");
    expect(DIAGRAM_GUIDELINES).toContain("timeline");
    expect(DIAGRAM_GUIDELINES).toContain("pie");
    expect(DIAGRAM_GUIDELINES).toContain("gantt");
  });

  it("withDiagramGuidelines appends guidelines to existing prompt", () => {
    const out = withDiagramGuidelines("أنت مساعد.");
    expect(out.startsWith("أنت مساعد.")).toBe(true);
    expect(out).toContain("Mermaid");
  });
});
