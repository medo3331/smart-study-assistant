import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * /api/chat لازم يقبل `systemInstruction` — الكويزات (BossFight/CommunityQuiz)
 * بتبعته من زمان وكان بيتخطّى بصمت (0 مطابقات) ⇒ الأسئلة كانت بتتولّد من
 * غير أي system prompt. الاختبارات دي بتأكد إن الحقل اتقبل واتحقن في الرسالة.
 */
describe("/api/chat honors the optional systemInstruction", () => {
  const file = fs.readFileSync(path.resolve(process.cwd(), "app/api/chat/route.ts"), "utf8");

  it("parses systemInstruction from the request body with a clamp", () => {
    expect(file).toContain("systemInstruction?: unknown");
    expect(file).toMatch(/systemInstruction: string \}\)\.systemInstruction, 2000/);
  });

  it("appends it to the system prompt as a dedicated task section", () => {
    expect(file).toContain("--- مهمة خاصة ---");
    // بيُلحق بعد الشخصية/السياق وقبل محتوى المصدر (المصدر يفضل آخر حاجة).
    expect(file).toContain("systemWithInstruction");
  });
});
