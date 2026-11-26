// tests/engagement-planner-proof-boundary.test.ts
//
// G0-D — Planner / Goals: عقد الحدود (boundary contract).
//
// القرار المعتمد (G0-D): إكمال أهداف المخطط لا يملك أي مصدر سيرفري قابل
// للتحقق — الحالة (is_done + done_at) يكتبها العميل مباشرة عبر RLS owner
// (Tier C)، و"تحقق" award_coins('goal_done') دائري (يفحص نفس الحالة التي
// كتبها العميل). لذلك:
//   ✔ لا يُسجَّل أي حدث engagement مشتق من حالة planner_goals.
//   ✔ لا يُسجَّل حدث 'goal_completed' بثقة 'server' — إصداره من trigger على
//     is_done سيضع حالة قابلة للتزوير تحت تصنيف موثوق (مخالف لنموذج الثقة).
//   ✔ الأهداف تبقى متاحة للطالب في الـPlanner كالمعتاد — لكنها خارج منظومة
//     إثبات المهمات/المكافآت حتى وجود مسار إكمال سيرفري (قرار منتج منفصل).
//
// الاختبارات دي حارس ضد التبني العرضي مستقبلًا: أي محاولة لإضافة حدث
// planner إلى الـregistry بدون مصدر سيرفري هتفشل هنا صراحةً.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ENGAGEMENT_EVENT_SPECS,
  ENGAGEMENT_EVENT_TYPES,
  SERVER_VERIFIED_EVENT_TYPES,
} from "@/lib/engagement/event-contract";

const root = process.cwd();

describe("planner/goals proof boundary (G0-D)", () => {
  it("registers NO engagement event sourced from planner state", () => {
    const plannerSourced = Object.entries(ENGAGEMENT_EVENT_SPECS)
      .filter(([, spec]) => spec.sourceTable === "planner_goals")
      .map(([type]) => type);
    expect(plannerSourced).toEqual([]);
  });

  it("does not treat goal completion as server-verified proof", () => {
    for (const [key, type] of Object.entries(ENGAGEMENT_EVENT_TYPES)) {
      // لا نوع إثبات مشتق من إكمال الأهداف (client-writable is_done)
      expect(key.toLowerCase()).not.toContain("goal");
      expect(type).not.toMatch(/goal/);
      expect(SERVER_VERIFIED_EVENT_TYPES).not.toContain("goal_completed" as never);
    }
  });

  it("G0 migrations 61-63 emit nothing derived from planner_goals", () => {
    for (const file of [
      "db/61-engagement-study-completed.sql",
      "db/62-engagement-games-proof.sql",
      "db/63-engagement-badges-achievements-proof.sql",
    ]) {
      const sql = readFileSync(join(root, file), "utf8");
      expect(sql).not.toContain("planner_goals");
      expect(sql).not.toContain("'goal_completed'");
    }
  });

  it("P1-B2 registry (db/59) contains no planner event", () => {
    const sql = readFileSync(join(root, "db", "59-engagement-events-ingest.sql"), "utf8");
    expect(sql).not.toContain("planner_goals");
    expect(sql).not.toContain("'goal_completed'");
  });

  it("documents the exact blocker for future adoption (server-side completion required)", () => {
    // الاعتماد المستقبلي لهدف كمصدر إثبات يتطلب كل ما يلي (قرار منتج + تنفيذ):
    //   1. مسار إكمال سيرفري (endpoint/definer) يتحقق من معنى "تحقيق الهدف"
    //      — لأن is_done/done_at حالياً client-writable عبر سياسات owner ALL
    //      (planner: owner writes/updates/deletes — بلا guard triggers).
    //   2. إصلاح التحقق الدائري: award_coins('goal_done') يفحص g.is_done=true
    //      — نفس الحالة التي كتبها العميل — فيلزم مصدر تحقق مستقل.
    //   3. تسجيل النوع في الـregistry بـtrust_level='server' + مرآة العقد
    //      + اختبارات التزوير (حالة مزيفة، تاريخ مزيف، مستخدم آخر).
    //   هذا تغيير سلوكي في الـPlanner (UX + مسار المكافأة) — خارج نطاق G0-D
    //   بقرار صريح: الأهداف غير المؤهلة تبقى خارج منظومة الإثبات.
    expect(true).toBe(true);
  });
});
