import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * حارس runtime لامتحانات — يمنع regressions في الحاجات اللي اتصلّحت:
 *   ١) مهلة Vercel (Fluid Compute) = 300 ثانية على راوتات الامتحان.
 *   ٢) سقف المخرج + مهلة الطلب في نداءات التوليد (منع 503 «كل المزوّدات فشلوا»).
 *   ٣) المساعد ينفّذ طلب الامتحان بدل ما يسأل أسئلة توضيحية.
 *   ٤) المولّد بيعرض المحاضرات غير المصنّفة تحت مادة (مش «مفيش محاضرات»).
 */
function read(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

const CREATE_ROUTE = "app/api/exam-sessions/route.ts";
const PROCESS_ROUTE = "app/api/exam-sessions/[id]/items/[itemId]/process/route.ts";

describe("مهلات Vercel لامتحانات (Fluid Compute)", () => {
  it("راوت إنشاء الجلسة: maxDuration = 300", () => {
    expect(read(CREATE_ROUTE)).toMatch(/export const maxDuration = 300;/);
  });

  it("راوت المعالجة: maxDuration = 300", () => {
    expect(read(PROCESS_ROUTE)).toMatch(/export const maxDuration = 300;/);
  });
});

describe("نداءات التوليد — سقف المخرج ومهلة الطلب", () => {
  it("المحرك بيبعت maxTokens و timeoutMs لكل نداء", () => {
    const engine = read("lib/ai/exam-review.ts");
    expect(engine).toContain("maxTokens: examMaxTokens(aiTask, quota)");
    expect(engine).toContain("timeoutMs: EXAM_CALL_TIMEOUT_MS");
  });

  it("سقف المخرج أكبر من الصفر لكل نوع نداء", () => {
    const engine = read("lib/ai/exam-review.ts");
    expect(engine).toMatch(/export function examMaxTokens/);
    expect(engine).toContain('case "summary":');
    expect(engine).toContain('case "questions":');
  });

  it("الراووت بيمرّر الخيارين للموديل فعلاً", () => {
    const route = read(PROCESS_ROUTE);
    expect(route).toContain("maxTokens");
    expect(route).toContain("timeoutMs");
    // 429 من المزوّد (كل المفاتيح اتعيطت) ⇒ 503 «الخدمة مشغولة» مش 429 ميزانية.
    expect(route).toContain("AI_RATE_LIMITED");
  });
});

describe("المساعد — طلب امتحان مكتمل بينفّذ فورًا", () => {
  it("/api/chat: كشف الطلب + رابط المولّد + قواعد البرومبت", () => {
    const route = read("app/api/chat/route.ts");
    expect(route).toContain("detectExamRequest(latestMessage)");
    expect(route).toContain("buildExamHref(examRequest)");
    expect(route).toContain("EXAM_REQUEST_PROMPT_RULES");
  });

  it("/api/unified-ai: كشف الطلب + زر الإجراء", () => {
    const route = read("app/api/unified-ai/route.ts");
    expect(route).toContain("detectExamRequest(prompt)");
    expect(route).toContain('label: "افتح مولّد الامتحان"');
    expect(route).toContain("EXAM_REQUEST_PROMPT_RULES");
  });
});

describe("المولّد — فلترة المحاضرات", () => {
  const generator = read("components/exams/ExamGenerator.tsx");

  it("المحاضرات غير المصنّفة تحت مادة بتفضل ظاهرة", () => {
    expect(generator).toContain("if (!hasSubject) return true;");
  });

  it("شاشة «بدون تفريغ» بتتحسب من transcript_text (زي شرط الراوت)", () => {
    expect(generator).toContain('not("transcript_text", "is", null)');
    expect(generator).toContain('row.transcript_text.trim().length > 0');
  });
});
