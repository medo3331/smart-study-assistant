// tests/engagement-games-proof-migration.test.ts
//
// G0-B — عقد الترحيل: db/62-engagement-games-proof.sql
//
// اختبار ثابت (بدون DB) يتأكد أن ترحيل إثبات الألعاب يلتزم الحدود الأمنية.
// التحقق الفعلي على مستوى الـDB يتم على Local/Staging فقط (ممنوع على
// الإنتاج — انظر scripts/g0b-games-proof-verify.mjs).
//
// المرجع الحرفي لأجسام الدوال الإنتاجية قبل G0-B:
// docs/artifacts/g0b-production-game-functions.sql

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const sql = readFileSync(
  join(root, "db", "62-engagement-games-proof.sql"),
  "utf8",
);

const FUNCTIONS = {
  answer_break_riddle: "CREATE OR REPLACE FUNCTION public.answer_break_riddle(p_answer text)",
  answer_break_quiz: "CREATE OR REPLACE FUNCTION public.answer_break_quiz(p_answer text)",
  solve_escape_step: "CREATE OR REPLACE FUNCTION public.solve_escape_step(p_answer text)",
};

/** يقسم الملف إلى أقسام: [registry, riddle-fn, quiz-fn, escape-fn, grants]. */
function section(startMarker: string): string {
  const start = sql.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  // القسم ينتهي عند بداية أول دالة تالية له (أو نهاية الملف).
  const others = Object.values(FUNCTIONS)
    .map((m) => sql.indexOf(m, start + 1))
    .filter((i) => i > start);
  const grantsIdx = sql.indexOf("revoke all on function public.answer_break_riddle", start + 1);
  const ends = [...others, grantsIdx > start ? grantsIdx : Infinity];
  return sql.slice(start, Math.min(...ends));
}

const registrySection = sql.slice(0, sql.indexOf(FUNCTIONS.answer_break_riddle));
const riddleSection = section(FUNCTIONS.answer_break_riddle);
const quizSection = section(FUNCTIONS.answer_break_quiz);
const escapeSection = section(FUNCTIONS.solve_escape_step);

describe("G0-B migration contract (db/62)", () => {
  it("registers only the three adopted game events with server trust", () => {
    const adopted: Array<[string, string]> = [
      ["break_riddle_solved", "break_riddle_sessions"],
      ["break_quiz_solved", "break_quiz_sessions"],
      ["escape_room_solved", "escape_sessions"],
    ];
    for (const [event, table] of adopted) {
      expect(registrySection).toMatch(new RegExp(`\\('${event}',\\s*'${table}',\\s*'server'`));
    }
    // لا أحداث لألعاب غير معتمدة
    expect(registrySection).not.toContain("'game_claimed'");
    expect(registrySection).not.toContain("'community_quiz'");
  });

  it("emits through the existing trusted ingestion function only", () => {
    expect(sql).toContain("public.record_engagement_event(");
    expect(sql).not.toMatch(/insert\s+into\s+public\.engagement_events/i);
  });

  it("emits only after the server-validated solve transition", () => {
    for (const [sectionText, updateNeedle, emitNeedle] of [
      [riddleSection, "set solved_at=now()", "'break_riddle_solved'"],
      [quizSection, "set solved_at=now()", "'break_quiz_solved'"],
      [escapeSection, "set step=4, solved_at=now()", "'escape_room_solved'"],
    ] as const) {
      const u = sectionText.indexOf(updateNeedle);
      const e = sectionText.indexOf(emitNeedle);
      expect(u).toBeGreaterThan(-1);
      expect(e).toBeGreaterThan(u);
    }
  });

  it("emits the escape event at the final solve only, not intermediate steps", () => {
    const intermediate = escapeSection.indexOf("if s.step < 3 then");
    const emit = escapeSection.indexOf("'escape_room_solved'");
    expect(intermediate).toBeGreaterThan(-1);
    // الخطوة الوسيطة تعيد مبكرًا (return) قبل كتلة الإصدار.
    const earlyReturn = escapeSection.indexOf("return query select true,s.step::int", intermediate);
    expect(earlyReturn).toBeGreaterThan(-1);
    expect(emit).toBeGreaterThan(earlyReturn);
  });

  it("never emits for an already-solved session (idempotent replay)", () => {
    for (const sectionText of [riddleSection, quizSection, escapeSection]) {
      const early = sectionText.indexOf("solved_at is not null then return query");
      const emit = sectionText.indexOf("public.record_engagement_event(");
      expect(early).toBeGreaterThan(-1);
      expect(emit).toBeGreaterThan(early);
    }
  });

  it("emission is exception-safe (never blocks the solve or its reward)", () => {
    for (const sectionText of [riddleSection, quizSection, escapeSection]) {
      expect(sectionText).toMatch(/exception when others then[\s\S]*?raise warning/);
    }
  });

  it("preserves the production reward paths byte-for-byte (no coins/XP changes)", () => {
    // مسارات المكافآت الإنتاجية الحالية (نسخة economy-truth عبر award_coins).
    expect(riddleSection).toContain("'riddle:' || v_day");
    expect(riddleSection).toContain("break_riddle_fast");
    expect(escapeSection).toContain("public.award_coins('escape_room', 'escape:' || v_day)");
    expect(riddleSection).toContain("update public.profiles set xp=coalesce(profiles.xp,0)+v_xp");
    // لا تغييرات على الجداول/الدوال الاقتصادية؛ claim_break_game لم يُلمس
    expect(sql).not.toMatch(/alter\s+table/i);
    expect(sql).not.toMatch(/create\s+or\s+replace\s+function\s+public\.award_coins/i);
    expect(sql).not.toContain("FUNCTION public.claim_break_game");
    expect(sql).not.toContain("FUNCTION public.submit_quiz_result");
  });

  it("keeps server-only execution boundaries", () => {
    for (const fn of [
      "answer_break_riddle(text)",
      "answer_break_quiz(text)",
      "solve_escape_step(text)",
    ]) {
      expect(sql).toContain(`revoke all on function public.${fn} from public`);
      expect(sql).toContain(`grant execute on function public.${fn} to authenticated`);
    }
  });

  it("identity always comes from the server session", () => {
    // auth.uid() في كل دالة من الدوال الثلاث
    for (const sectionText of [riddleSection, quizSection, escapeSection]) {
      expect(sectionText).toContain("auth.uid()");
    }
    // لا معاملات هوية
    expect(sql).not.toMatch(/p_user_id|p_uid\b/);
  });
});
