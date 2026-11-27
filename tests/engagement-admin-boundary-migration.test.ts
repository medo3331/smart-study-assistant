// tests/engagement-admin-boundary-migration.test.ts
//
// G0-E — عقد الترحيل: db/64-admin-messaging-rls.sql
//
// اختبار ثابت (بدون DB). التحقق الفعلي للصلاحيات على مستوى PostgreSQL يتم
// على Local/Staging فقط (scripts/g0e-admin-boundary-verify.mjs يرفض الإنتاج).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const sql = readFileSync(
  join(root, "db", "64-admin-messaging-rls.sql"),
  "utf8",
);

describe("G0-E migration contract (db/64)", () => {
  it("closes the public SELECT on admin_announcements (P0 data exposure)", () => {
    expect(sql).toContain('DROP POLICY IF EXISTS "admin_announcements service read" ON public.admin_announcements');
    // لا سياسة عميل جديدة تُنشأ (السطور غير التعليقية فقط — الـROLLBACK موثّق كتعليق)
    expect(sql).not.toMatch(/^\s*create\s+policy/im);
    // سحب منح العملاء (تعميق دفاعي) مع بقاء الـservice role
    expect(sql).toMatch(/revoke\s+all\s+on\s+table\s+public\.admin_announcements\s+from\s+anon/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+table\s+public\.admin_announcements\s+from\s+authenticated/i);
  });

  it("restricts user_inbox owner UPDATE to the legitimate columns only", () => {
    expect(sql).toContain("GRANT SELECT ON TABLE public.user_inbox TO authenticated");
    expect(sql).toContain("GRANT UPDATE (is_read, read_at) ON TABLE public.user_inbox TO authenticated");
    // لا كتابة/حذف من العميل — الإضافة عبر service client فقط (بلا سياسة INSERT)
    expect(sql).toMatch(/revoke\s+insert\s+on\s+table\s+public\.user_inbox\s+from\s+authenticated/i);
    expect(sql).toMatch(/revoke\s+delete\s+on\s+table\s+public\.user_inbox\s+from\s+authenticated/i);
  });

  it("keeps email_deliveries client-denied (defense in depth)", () => {
    expect(sql).toMatch(/revoke\s+all\s+on\s+table\s+public\.email_deliveries\s+from\s+anon/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+table\s+public\.email_deliveries\s+from\s+authenticated/i);
  });

  it("touches nothing else — no tables dropped, no announcements changes, no rewards", () => {
    expect(sql).not.toMatch(/drop\s+table/i);
    expect(sql).not.toMatch(/delete\s+from/i);
    expect(sql).not.toContain("coin_ledger");
    expect(sql).not.toContain("profiles");
    expect(sql).not.toContain("planner_goals");
    // announcements (الإعلانات العامة) و announcement_reads سليمان — لم يُمسّا (لا عبارات SQL ضدهما)
    expect(sql).not.toContain("ON public.announcements");
    expect(sql).not.toContain("ON public.announcement_reads");
  });

  it("keeps the standard transaction wrapper (consistent with db/59-63)", () => {
    expect(sql).toMatch(/^BEGIN;$/m);
    expect(sql).toMatch(/^COMMIT;$/m);
    // مرة واحدة لكل منهما — سكريبت التحقق يزيلهما قبل التنفيذ داخل معاملة خارجية
    expect(sql.match(/^BEGIN;$/gm)?.length).toBe(1);
    expect(sql.match(/^COMMIT;$/gm)?.length).toBe(1);
  });

  it("admin announcement access in app code is service-client only", () => {
    // الملف الوحيد في app/ الذي يلمس admin_announcements هو مسار البث الإداري
    const messaging = readFileSync(
      join(root, "app", "admin", "actions", "messaging.ts"),
      "utf8",
    );
    expect(messaging).toContain("admin_announcements");
    expect(messaging).toContain("createServiceClient()");
    expect(messaging).toContain('requireAdminPermission("announcements.manage")');
    // لا ملفات عميل أخرى تقرأه (البحث في app/ كله)
    const hits = walk(join(root, "app"), []).filter(
      (f) => /admin_announcements/.test(readFileSync(f, "utf8")),
    );
    expect(hits.length).toBe(1);
  });

  it("inbox page updates only is_read/read_at (legitimate owner action preserved)", () => {
    const inbox = readFileSync(join(root, "app", "inbox", "page.tsx"), "utf8");
    expect(inbox).toMatch(/update\(\{\s*is_read:\s*true,\s*read_at:/);
  });
});

/* helpers */

function walk(dir: string, acc: string[]): string[] {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const e of entries) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(e)) acc.push(p);
  }
  return acc;
}
