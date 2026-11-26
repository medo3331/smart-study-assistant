// tests/engagement-study-proof-migration.test.ts
//
// G0-A — عقد الترحيل: db/61-engagement-study-completed.sql
//
// اختبار ثابت (بدون DB) يتأكد أن ترحيل إثبات إكمال الدراسة يلتزم الحدود
// الأمنية المطلوبة. التحقق الفعلي على مستوى الـDB يتم في معاملة rollback
// منفصلة (لا يُطبّق الترحيل على الإنتاج بدون تفويض صريح).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const sql = readFileSync(
  join(root, "db", "61-engagement-study-completed.sql"),
  "utf8",
);

describe("G0-A migration contract (db/61)", () => {
  it("registers study_completed as a server-trust event sourced from study_days", () => {
    expect(sql).toContain("'study_completed'");
    // الصف في سجل الأنواع: المصدر + مستوى الثقة + نشط.
    expect(sql).toMatch(/\('study_completed',\s*'study_days',\s*'server'/);
    expect(sql).toMatch(/jsonb_build_object/);
  });

  it("emits the event through the existing trusted ingestion function only", () => {
    // يُصدر عبر record_engagement_event — لا INSERT مباشر في engagement_events.
    expect(sql).toContain("public.record_engagement_event(");
    expect(sql).not.toMatch(/insert\s+into\s+public\.engagement_events/i);
  });

  it("emits after completion is confirmed and is exception-safe", () => {
    // الإكمال (update is_completed = true) يحدث قبل إصدار الحدث.
    const updateIdx = sql.indexOf("update public.study_days set is_completed = true");
    const emitIdx = sql.indexOf("public.record_engagement_event(");
    expect(updateIdx).toBeGreaterThan(-1);
    expect(emitIdx).toBeGreaterThan(updateIdx);
    // فشل الحدث لا يلغي إكمال الطالب (exception-safe).
    expect(sql).toMatch(/exception when others then[\s\S]*?raise warning/);
  });

  it("never emits for an already-completed day (idempotent replay)", () => {
    // المسار الـidempotent يعيد مبكرًا قبل كتلة إصدار الحدث.
    const earlyReturnIdx = sql.indexOf("return query select 0::int, 0::int");
    const emitIdx = sql.indexOf("public.record_engagement_event(");
    expect(earlyReturnIdx).toBeGreaterThan(-1);
    expect(earlyReturnIdx).toBeLessThan(emitIdx);
    // المصدر معرّف اليوم نفسه — فريد لكل (user, event_type, source_table).
    expect(sql).toContain("p_day_id::text");
  });

  it("preserves the existing reward path byte-for-byte (no coins/XP changes)", () => {
    // مسار المكافآت المحفوظ كما هو من db/43.
    expect(sql).toContain("public.award_coins('day_done', p_day_id::text)");
    expect(sql).toContain("perform public._streak_apply(v_uid);");
    // لا تغييرات على الجداول/الدوال الاقتصادية.
    expect(sql).not.toMatch(/alter\s+table/i);
    expect(sql).not.toMatch(/coin_ledger\s*\(/i); // لا تعريف أو استدعاء جديد
    expect(sql).not.toMatch(/create\s+or\s+replace\s+function\s+public\.award_coins/i);
    expect(sql).not.toMatch(/create\s+or\s+replace\s+function\s+public\.increment_xp/i);
    // مسار XP يظهر مرة واحدة فقط — النسخة الأصلية المحفوظة داخل دالة
    // الإكمال، بدون أي إضافة جديدة (لا trigger ولا دالة XP جديدة).
    expect(sql.match(/set\s+xp\s*=\s*greatest/g) ?? []).toHaveLength(1);
  });

  it("keeps the function's server-only execution boundary", () => {
    expect(sql).toMatch(/security\s+definer/i);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.complete_study_day\(uuid\)\s+to\s+authenticated/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.complete_study_day\(uuid\)\s+from\s+public/i);
  });

  it("identity always comes from the server session, never from arguments", () => {
    // v_uid من auth.uid() فقط — لا معامل هوية للدالة.
    expect(sql).toContain("v_uid uuid := auth.uid();");
    expect(sql).toMatch(/complete_study_day\(p_day_id uuid\)/);
  });
});
