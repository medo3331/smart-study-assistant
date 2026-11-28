/**
 * عقد Magic Chess Platform — Phase 1 (Master Spec) — static:
 *   - AI بـ ٨ مستويات + ٥ شخصيات لعب (+ المتوازن) في lib/games/chess/ai.ts.
 *   - ٨ رقع + ٣ أطقم قطع + إعدادات محفوظة في lib/games/chess/boards.ts.
 *   - أصوات Web Audio بأنواع move/capture/check/win/lose.
 *   - صفحة الشطرنج: منتقي شخصية + إعدادات + أصوات + حفظ المباريات.
 *   - صفحة «مبارياتي» موجودة وتقرأ نفس مفتاح localStorage.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { AI_LEVELS, AI_PERSONALITIES, type Difficulty } from "@/lib/games/chess/ai";
import { BOARD_THEMES, PIECE_SETS, boardThemeById, glyphFor, DEFAULT_SETTINGS } from "@/lib/games/chess/boards";
import { initialGame } from "@/lib/games/chess/engine";

const root = join(__dirname, "..");
const ai = readFileSync(join(root, "lib", "games", "chess", "ai.ts"), "utf8").replace(/\r\n/g, "\n");
const boards = readFileSync(join(root, "lib", "games", "chess", "boards.ts"), "utf8").replace(/\r\n/g, "\n");
const sounds = readFileSync(join(root, "lib", "games", "chess", "sounds.ts"), "utf8").replace(/\r\n/g, "\n");
const chessPage = readFileSync(join(root, "app", "games", "chess", "page.tsx"), "utf8").replace(/\r\n/g, "\n");
const historyPage = readFileSync(join(root, "app", "games", "chess", "history", "page.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("Magic Chess AI — ٨ مستويات و٥ شخصيات", () => {
  it("المستويات ١..٨ كلها معرفة بعمق وميزانية وقت", () => {
    for (const d of [1, 2, 3, 4, 5, 6, 7, 8] as Difficulty[]) {
      expect(AI_LEVELS[d].depth).toBeGreaterThan(0);
      expect(AI_LEVELS[d].budget).toBeGreaterThan(0);
      expect(AI_LEVELS[d].label.length).toBeGreaterThan(0);
    }
    expect(AI_LEVELS[8].depth).toBeGreaterThanOrEqual(AI_LEVELS[1].depth);
    expect(AI_LEVELS[1].jitter).toBeGreaterThan(0); // المبتدئ بيلعب بالأخطاء
    expect(AI_LEVELS[8].jitter).toBe(0); // المحترف بدون عشوائية
  });

  it("شخصيات اللعب: متوازن + هجومي/دفاعي/استراتيجي/تكتيكي/عشوائي", () => {
    const ids = AI_PERSONALITIES.map((p) => p.id);
    for (const id of ["default", "aggressive", "defensive", "strategic", "tactical", "random"]) {
      expect(ids).toContain(id);
    }
  });

  it("شخصيات بتأثر على الاختيار — تعديلات لكل شخصية في الكود", () => {
    for (const id of ["aggressive", "defensive", "strategic", "tactical", "random"]) {
      expect(ai).toContain(`case "${id}"`);
    }
    expect(ai).toContain("personalityAdjust");
  });
});

describe("Magic Chess الرقع وأطقم القطع والإعدادات", () => {
  it("٨ رقع، كلها بألوان فاتح/غامق/إطار وأسماء", () => {
    expect(BOARD_THEMES.length).toBeGreaterThanOrEqual(8);
    for (const t of BOARD_THEMES) {
      expect(t.light).toMatch(/^#/);
      expect(t.dark).toMatch(/^#/);
      expect(t.frame).toMatch(/^#/);
      expect(t.name.length).toBeGreaterThan(0);
    }
    // العقد المعروضة في المواصفة
    for (const id of ["wooden", "walnut", "marble", "dark", "neon", "blue", "minimal", "egyptian"]) {
      expect(BOARD_THEMES.some((t) => t.id === id)).toBe(true);
    }
  });

  it("boardThemeById بيرجع افتراضي لأي id غلط", () => {
    expect(boardThemeById("not-exist").id).toBe(BOARD_THEMES[0].id);
  });

  it("٣ أطقم قطع — المينيمال بيرموز مفرغة مختلفة عن الكلاسيك", () => {
    expect(PIECE_SETS.map((s) => s.id)).toEqual(["classic", "minimal", "neon"]);
    const g = initialGame();
    const queen = g.board.find((p) => p && p.t === "q")!;
    expect(glyphFor("classic", queen)).not.toBe(glyphFor("minimal", queen));
  });

  it("الإعدادات بتتحفظ في magic-chess-settings بكل الحقول", () => {
    expect(boards).toContain('"magic-chess-settings"');
    expect(DEFAULT_SETTINGS).toMatchObject({ theme: "wooden", pieceSet: "classic", sound: true, showLegal: true, coords: true, flipped: false });
  });
});

describe("Magic Chess الأصوات", () => {
  it("playSound بأنواع move/capture/check/win/lose — Web Audio بدون ملفات", () => {
    expect(sounds).toContain("export type SoundKind");
    for (const kind of ["move", "capture", "check", "win", "lose"]) {
      expect(sounds).toContain(`case "${kind}"`);
    }
    expect(sounds).toContain("AudioContext");
    expect(sounds).not.toContain("new Audio("); // بدون assets
  });
});

describe("صفحة الشطرنج — تكامل Phase 1", () => {
  it("٨ مستويات + منتقي شخصيات + الإعدادات + الأصوات", () => {
    expect(chessPage).toContain("[1, 2, 3, 4, 5, 6, 7, 8] as Difficulty[]");
    expect(chessPage).toContain("AI_PERSONALITIES.map");
    expect(chessPage).toContain("boardThemeById");
    expect(chessPage).toContain("pieceStyleFor");
    expect(chessPage).toContain("glyphFor");
    expect(chessPage).toContain("playSound");
    expect(chessPage).toContain("updateSettings({ flipped");
  });

  it("حفظ المباراة عند النهاية في magic-chess-history + رابط مبارياتي", () => {
    expect(chessPage).toContain('"magic-chess-history"');
    expect(chessPage).toContain("saveHistory");
    expect(chessPage).toContain('href="/games/chess/history"');
  });

  it("عقد اللعب القديم لسه ثابت — إرسال النتيجة واللوحة الثابتة والالوان", () => {
    expect(chessPage).toContain('supabase.rpc("arcade_submit_score"');
    expect(chessPage).toContain('p_game: "chess"');
    expect(chessPage).toContain("h-[57px] w-[57px]");
    expect(chessPage).toContain("sm:h-16 sm:w-16");
    expect(chessPage).toContain("!bg-[#a3c98a]");
    expect(chessPage).toContain("!bg-[#d98d7c]");
    expect(chessPage).toContain("!bg-[#f2e394]");
    expect(chessPage).toContain("↩️ تراجع");
    expect(chessPage).toContain("ماجِك — مدربك");
  });
});

describe("صفحة مبارياتي", () => {
  it("موجودة وتقرأ نفس مفتاح السجل وفيها مسح", () => {
    expect(historyPage).toContain('"magic-chess-history"');
    expect(historyPage).toContain("clear");
    expect(historyPage).toContain('href="/games/chess"');
  });
});
