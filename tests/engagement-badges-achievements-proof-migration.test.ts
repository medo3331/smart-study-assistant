// tests/engagement-badges-achievements-proof-migration.test.ts
//
// G0-C — عقد الترحيل: db/63-engagement-badges-achievements-proof.sql
//
// اختبار ثابت (بدون DB). التحقق الفعلي على مستوى الـDB يتم على Local/Staging
// فقط (scripts/g0c-badges-achievements-verify.mjs يرفض الإنتاج بفشل مغلق).
//
// المرجع الحرفي للتعريفات الإنتاجية قبل G0-C:
// docs/artifacts/g0c-production-badge-functions.sql

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const sql = readFileSync(
  join(root, "db", "63-engagement-badges-achievements-proof.sql"),
  "utf8",
);

function section(startMarker: string, nextMarkers: string[]): string {
  const start = sql.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  const nexts = nextMarkers
    .map((m) => sql.indexOf(m, start + 1))
    .filter((i) => i > start);
  return sql.slice(start, Math.min(...nexts.length ? nexts : [sql.length]));
}

const registrySection = sql.slice(0, sql.indexOf("DROP POLICY IF EXISTS"));
const policySection = section("DROP POLICY IF EXISTS", [
  "CREATE OR REPLACE FUNCTION public.grant_badge",
]);
const grantBadgeSection = section(
  "CREATE OR REPLACE FUNCTION public.grant_badge",
  ["CREATE OR REPLACE FUNCTION public.sync_achievements"],
);
const syncSection = sql.slice(
  sql.indexOf("CREATE OR REPLACE FUNCTION public.sync_achievements"),
  sql.indexOf("revoke all on function public.grant_badge"),
);

describe("G0-C migration contract (db/63)", () => {
  it("registers badge_earned and achievement_unlocked as server-trust events", () => {
    expect(registrySection).toMatch(/\('badge_earned',\s*'badges',\s*'server'/);
    expect(registrySection).toMatch(/\('achievement_unlocked',\s*'user_achievements',\s*'server'/);
  });

  it("removes the client INSERT policy on badges (fake-badge exploit)", () => {
    expect(policySection).toContain('DROP POLICY IF EXISTS "badges: owner writes" ON public.badges');
    expect(policySection).toContain('DROP POLICY IF EXISTS "users manage their own badges" ON public.badges');
    // لا سياسة كتابة جديدة — القراءة فقط تبقى
    expect(policySection).not.toMatch(/create\s+policy/i);
  });

  it("emits through the existing trusted ingestion function only", () => {
    expect(sql).toContain("public.record_engagement_event(");
    expect(sql).not.toMatch(/insert\s+into\s+public\.engagement_events/i);
  });

  it("emits badge_earned only for a newly inserted badge (replay returns early)", () => {
    // مسار التكرار يعيد قبل الإدراج/الإصدار
    const early = grantBadgeSection.indexOf("if v_existing is not null then");
    const insertIdx = grantBadgeSection.indexOf("insert into public.badges");
    const emitIdx = grantBadgeSection.indexOf("'badge_earned'");
    expect(early).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(early);
    expect(emitIdx).toBeGreaterThan(insertIdx);
    // المصدر = معرف الوسام نفسه (فريد لكل وسام على الإطلاق)
    expect(grantBadgeSection).toContain("v_new_id::text");
  });

  it("emits achievement_unlocked only on first unlock (on conflict do nothing)", () => {
    const insertIdx = syncSection.indexOf("insert into public.user_achievements");
    expect(syncSection.slice(insertIdx, insertIdx + 200)).toContain("on conflict (user_id, achievement_id) do nothing");
    const foundCheck = syncSection.indexOf("if found then", insertIdx);
    const emitIdx = syncSection.indexOf("'achievement_unlocked'");
    expect(foundCheck).toBeGreaterThan(-1);
    expect(emitIdx).toBeGreaterThan(foundCheck);
    // المصدر = معرف الإنجاز النصي الثابت
    expect(syncSection.slice(emitIdx, emitIdx + 300)).toContain("v_row.id");
  });

  it("emission is exception-safe in both functions", () => {
    for (const sectionText of [grantBadgeSection, syncSection]) {
      expect(sectionText).toMatch(/exception when others then[\s\S]*?raise warning/);
    }
  });

  it("preserves the production reward logic byte-for-byte (no coins/XP changes)", () => {
    expect(syncSection).toContain("perform public._award_coins_variable(");
    expect(syncSection).toContain("'achievement:' || v_row.id");
    expect(syncSection).toContain("set xp = greatest(0, coalesce(xp, 0) + v_row.xp)");
    // كل مقاييس الإنجاز من الداتابيز
    expect(syncSection).toContain("where user_id = v_uid and is_completed = true");
    // لا تغييرات على الجداول/الدوال الاقتصادية
    expect(sql).not.toMatch(/alter\s+table/i);
    expect(sql).not.toMatch(/create\s+or\s+replace\s+function\s+public\.award_coins/i);
    expect(sql).not.toMatch(/create\s+or\s+replace\s+function\s+public\._award_coins_variable/i);
    expect(sql).not.toMatch(/coin_ledger\s*\(/i);
  });

  it("keeps server-only execution boundaries", () => {
    expect(grantBadgeSection).toMatch(/security\s+definer/i);
    expect(syncSection).toMatch(/security\s+definer/i);
    expect(sql).toContain("revoke all on function public.grant_badge(uuid, integer, text, text, integer) from public");
    expect(sql).toContain("grant execute on function public.grant_badge(uuid, integer, text, text, integer) to authenticated");
    expect(sql).toContain("revoke all on function public.sync_achievements() from public");
    expect(sql).toContain("grant execute on function public.sync_achievements() to authenticated");
  });

  it("identity always comes from the server session", () => {
    expect(grantBadgeSection).toContain("v_uid uuid := auth.uid()");
    expect(syncSection).toContain("v_uid      uuid := auth.uid()");
    expect(sql).not.toMatch(/p_user_id|p_uid\b/);
  });
});
