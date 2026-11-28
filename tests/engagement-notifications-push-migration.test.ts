// tests/engagement-notifications-push-migration.test.ts
//
// G0-F — عقد الترحيل: db/65-notifications-push-rls.sql
//
// اختبار ثابت (بدون DB). التحقق الفعلي للصلاحيات على مستوى PostgreSQL يتم
// على Local/Staging فقط (scripts/g0f-notifications-push-verify.mjs يرفض الإنتاج).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const sql = readFileSync(
  join(root, "db", "65-notifications-push-rls.sql"),
  "utf8",
);

describe("G0-F migration contract (db/65)", () => {
  it("replaces every legacy user_id-IS-NULL policy with recipient ownership", () => {
    const code = sql
      .split(/\r?\n/)
      .filter((l) => !/^\s*--/.test(l)) // نستبعد التعليقات التوثيقية
      .join("\n")
      .replace(/COMMENT ON[\s\S]*?;/g, ""); // وعبارات COMMENT ON (توثيق داخل SQL)
    for (const [name, cmd] of [["read", "SELECT"], ["update", "UPDATE"], ["delete", "DELETE"]]) {
      expect(code).toContain(`DROP POLICY IF EXISTS "notifications: own ${name}"`);
      expect(code).toContain(`CREATE POLICY "notifications: own ${name} (recipient)"`);
      expect(code).toMatch(new RegExp(`FOR ${cmd}\\s*\\n?\\s*USING \\(recipient_id = auth\\.uid\\(\\)\\)`));
    }
    expect(code).not.toContain("user_id IS NULL");
    expect(code).not.toContain("user_id is null");
  });

  it("restores push_subscriptions with strict own-row policies", () => {
    for (const cmd of ["read", "insert", "update", "delete"]) {
      expect(sql).toContain(`DROP POLICY IF EXISTS "push_subscriptions: own ${cmd}"`);
      expect(sql).toContain(`"push_subscriptions: own ${cmd}"`);
    }
    // كل السياسات مشروطة بملكية user_id من الجلسة
    expect(sql.match(/user_id = auth\.uid\(\)/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it("no data or schema changes — policies only", () => {
    expect(sql).not.toMatch(/alter\s+table/i);
    expect(sql).not.toMatch(/drop\s+table/i);
    expect(sql).not.toMatch(/delete\s+from/i);
    expect(sql).not.toMatch(/insert\s+into/i);
    expect(sql).not.toMatch(/update\s+public\./i);
  });

  it("does not touch other systems (no rewards, no admin tables, no planner)", () => {
    expect(sql).not.toContain("coin_ledger");
    expect(sql).not.toContain("profiles set");
    expect(sql).not.toContain("admin_announcements");
    expect(sql).not.toContain("user_inbox");
    expect(sql).not.toContain("planner_goals");
    expect(sql).not.toContain("engagement_events");
  });

  it("keeps the standard transaction wrapper (consistent with db/59-64)", () => {
    expect(sql.match(/^BEGIN;$/gm)?.length).toBe(1);
    expect(sql.match(/^COMMIT;$/gm)?.length).toBe(1);
  });
});

describe("G0-F app-path boundary (notifications & push)", () => {
  const notifRoute = readFileSync(join(root, "app", "api", "notifications", "route.ts"), "utf8");
  const pushRoute = readFileSync(join(root, "app", "api", "push", "subscribe", "route.ts"), "utf8");
  const cronRoute = readFileSync(join(root, "app", "api", "cron", "streak-reminder", "route.ts"), "utf8");

  it("notifications API is session-scoped (never client-supplied identity)", () => {
    expect(notifRoute).not.toMatch(/export\s+async\s+function\s+POST/); // لا مسار إرسال عام
    expect(notifRoute.match(/eq\("recipient_id",\s*user\.id\)/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("push subscribe takes identity from the session only", () => {
    expect(pushRoute).toContain("requireUser");
    expect(pushRoute).toContain("user_id: user.id");
    expect(pushRoute).not.toMatch(/body\?\.user_id|body\.userId/);
    // إلغاء الاشتراك أيضًا من الجلسة
    expect(pushRoute).toMatch(/delete\(\)\.eq\("user_id",\s*user\.id\)/);
  });

  it("push sending is server-side only (cron, fail-closed secret)", () => {
    expect(cronRoute).toContain("createServiceClient");
    expect(cronRoute).toContain("isAuthorizedCronRequest");
    // لا إرسال web-push من مسار العميل (نستبعد التعليقات التوثيقية أعلى الملف)
    const code = pushRoute
      .split(/\r?\n/)
      .filter((l) => !/^\s*\/\//.test(l))
      .join("\n");
    expect(code).not.toContain("sendNotification");
    expect(code).not.toContain("setVapidDetails");
    expect(code).not.toContain("web-push");
  });

  it("subscribe is idempotent per user (bounded abuse surface)", () => {
    expect(pushRoute).toContain('onConflict: "user_id"');
  });
});
