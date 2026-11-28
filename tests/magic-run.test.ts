/**
 * عقد Magicly Run 🏃‍♂️ + بنك الأسئلة العامة + تطوير الذاكرة — static:
 *   - اللعبة بتسجل عبر arcade_submit_score('run') مرة واحدة (عقد db/124).
 *   - ٣ حارات + نط + انزلاق + Power-ups (عناصر اللعب الأساسية).
 *   - بنك الأسئلة العامة: أسئلة واقعية بصيغة سليمة (بدون مكافأة).
 *   - Memory Match: أسهل — ٨ كروت + تمييز سؤال/إجابة + مكافأة onWin.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { GENERAL_QUIZ_BANK, drawQuizRound } from "@/lib/games/quiz-bank";

const root = join(__dirname, "..");
const run = readFileSync(join(root, "app", "games", "run", "page.tsx"), "utf8").replace(/\r\n/g, "\n");
const memory = readFileSync(join(root, "app", "dashboard", "components", "games", "MemoryGame.tsx"), "utf8").replace(/\r\n/g, "\n");
const hub = readFileSync(join(root, "app", "games", "page.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("Magicly Run 🏃‍♂️", () => {
  it("بتسجل النتيجة عبر arcade_submit_score مرة واحدة — عقد db/124", () => {
    expect(run).toContain('supabase.rpc("arcade_submit_score"');
    expect(run).toContain('p_game: "run"');
    expect(run).toContain("submitted");
    expect(run).toContain("p_won: false");
  });

  it("٣ حارات + نط + انزلاق + تغيير حارة", () => {
    expect(run).toContain("LANE_X = [110, 210, 310]");
    expect(run).toContain('"barrier" | "overhead" | "block"');
    expect(run).toMatch(/sliding/);
    expect(run).toMatch(/vy = -13/); // قفزة
  });

  it("كوينز الجولة + Power-ups (درع ومغناطيس)", () => {
    expect(run).toContain('"shield" | "magnet"');
    expect(run).toContain("s.coins * 10");
    expect(run).toContain("MAGNET_RANGE");
  });

  it("السرعة بتزيد تدريجيًا بسقف", () => {
    expect(run).toMatch(/Math\.min\(11, s\.speed \+ 0\.0016\)/);
  });

  it("الشخصية مرسومة Canvas بشخصية Magicly (كاب + جسم بتدرّج)", () => {
    expect(run).toContain("drawRunner");
    expect(run).toContain("كاب Magicly");
    expect(run).toContain("createLinearGradient");
  });
});

describe("بنك الأسئلة العامة (Quiz Rush)", () => {
  it("أسئلة واقعية كفاية (٢٠+)", () => {
    expect(GENERAL_QUIZ_BANK.length).toBeGreaterThanOrEqual(20);
  });

  it("كل سؤال له ٤ اختيارات وإجابة صحيحة داخل النطاق", () => {
    for (const q of GENERAL_QUIZ_BANK) {
      expect(q.choices).toHaveLength(4);
      expect(q.correct).toBeGreaterThanOrEqual(0);
      expect(q.correct).toBeLessThan(4);
      expect(q.subject.length).toBeGreaterThan(0);
    }
  });

  it("الجولات بتتسحب بدون تكرار وبعدد محدود", () => {
    const round = drawQuizRound(6);
    expect(round).toHaveLength(6);
    expect(new Set(round.map((q) => q.q)).size).toBe(6);
    expect(drawQuizRound(999)).toHaveLength(GENERAL_QUIZ_BANK.length);
  });

  it("البنك بدون مكافأة كوينز عمدًا — الإجابة بيتحقق في الواجهة", () => {
    expect(hub).toContain('claimBreakGame("memory")');
    // الـ fallback في QuizRush مابيناديش claim_break_game
    const quiz = readFileSync(join(root, "app", "games", "components", "QuizRush.tsx"), "utf8").replace(/\r\n/g, "\n");
    expect(quiz).toContain("claim_break_game"); // في مسار أسئلة الخطة (سيرفري)
    expect(quiz).toMatch(/للتدريب فقط/); // الـ fallback معلن إنه بدون مكافأة
  });
});

describe("Memory Match أسهل", () => {
  it("٤ أزواج (٨ كروت) — مضمونة من الـ API", () => {
    const api = readFileSync(join(root, "app", "api", "generate-game-questions", "route.ts"), "utf8").replace(/\r\n/g, "\n");
    expect(api).toContain("4 أزواج");
  });

  it("تمييز بصري سؤال/إجابة + رجوع أسرع (٧٠٠ms) + مكافأة onWin", () => {
    expect(memory).toContain('side: "q" | "a"');
    expect(memory).toContain("700");
    expect(memory).toContain("onWin");
  });
});
