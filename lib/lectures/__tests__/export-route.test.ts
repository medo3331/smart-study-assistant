/**
 * 🔒 اختبار أمان راووت التصدير — Phase 4-B
 *
 * ⚠️ **ليه الراوت نفسه مش الـ helper:** المطلوب إثباته إن المستخدم
 * التاني **مش بيقدر** يصدّر محاضرة حد تاني. ده سلوكHTTP مش سلوك دالة —
 * لازم نمرّ على الراوت ونشوف Status Code.
 *
 * مافيش أي توليد ملف حقيقي هنا: الحالات المرفوضة بترجع **قبل** الوصول
 * لمرحلة التوليد، والحالة الناجحة بنعملها بـ mock للـ generator.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const USER_ID = "user-1";
const OTHER_ID = "user-2";

/**
 * ⚠️ `vi.hoisted` مش اختياري: مصانع `vi.mock` بتتشال لفوق الملف، فأي
 * متغيّر فوقي بيسيبها قبل ما يتعرّف عليه ("Cannot access before
 * initialization"). `vi.hoisted` بيخلي المتغيّر جاهز قبل رفع الـ mock.
 */
const h = vi.hoisted(() => {
  const callLog: string[] = [];
  const generator = vi.fn();
  return {
    callLog,
    generator,
    state: { user: { id: "user-1" } as { id: string } | null, lecture: null as Record<string, unknown> | null },
  };
});

vi.mock("@/lib/lectures/lecture-document", () => ({
  generateLectureDocument: h.generator,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.state.user } }) },
    from: () => {
      const builder = {
        select: () => builder,
        eq: (col: string, value: string) => {
          h.callLog.push(`eq:${col}:${value}`);
          return builder;
        },
        maybeSingle: async () => {
          // ⚠️ محاكاة سلوك RLS: لو الفلتر مش مطابق للمستخدم الحالي،
          // الصف بيختفي — بالظبط زي Postgres.
          const filter = h.callLog.filter((c) => c.startsWith("eq:user_id:")).pop();
          const requested = filter?.split(":")[2];
          const row = h.state.lecture;
          if (requested && row && row.user_id !== requested) {
            return { data: null, error: null };
          }
          return { data: row, error: null };
        },
      };
      return builder;
    },
  }),
}));

import { GET } from "@/app/api/lectures/[id]/export/route";

function callExport(format = "pdf", id = "lec-1") {
  return GET(
    new Request(`http://localhost/api/lectures/${id}/export?format=${format}`),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  h.callLog.length = 0;
  vi.clearAllMocks();
  h.state.user = { id: USER_ID };
  h.generator.mockImplementation(async () => {
    h.callLog.push("generate");
    return {
      buffer: Buffer.from("%PDF-1.4 fake"),
      filename: "Magicly-x-explanation.pdf",
      mimeType: "application/pdf",
    };
  });
  h.state.lecture = {
    id: "lec-1",
    user_id: USER_ID,
    title: "محاضرة العمليات",
    original_filename: "or.mp3",
    explanation: "## الشرح\n\nمحتوى.",
  };
});
/* ═══════════════ المصادقة ═══════════════ */

describe("الأمان — المصادقة", () => {
  it("⛔ زائر بيرجّع 401 (PDF)", async () => {
    h.state.user = null;
    const response = await callExport("pdf");
    expect(response.status).toBe(401);
    expect(h.callLog).not.toContain("generate");
  });

  it("⛔ زائر بيرجّع 401 (Word)", async () => {
    h.state.user = null;
    expect((await callExport("docx")).status).toBe(401);
    expect(h.generator).not.toHaveBeenCalled();
  });
});

/* ═══════════════ الملكية ═══════════════ */

describe("الأمان — ملكية المحاضرة", () => {
  it("⛔ محاضرة حد تاني بترجّع 404 (مش 403)", async () => {
    // 404 مش 403 عشان مانكشفش إن الـ id موجود أصلاً.
    h.state.lecture = { ...(h.state.lecture as object), user_id: OTHER_ID };
    const response = await callExport();
    expect(response.status).toBe(404);
    expect(h.generator).not.toHaveBeenCalled();
  });

  it("⛔ محاضرة مش موجودة بترجّع 404", async () => {
    h.state.lecture = null;
    expect((await callExport()).status).toBe(404);
  });

  it("✅ صاحب المحاضرة يقدر يصدّر", async () => {
    const response = await callExport();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
  });

  it("✅ الفلترة بتستخدم user_id من الجلسة", async () => {
    await callExport();
    expect(h.callLog).toContain(`eq:user_id:${USER_ID}`);
  });
});

/* ═══════════════ المدخلات ═══════════════ */

describe("التحقق من المدخلات", () => {
  it("صيغة غلط بترجّع 400", async () => {
    const response = await callExport("xlsx");
    expect(response.status).toBe(400);
    expect(h.generator).not.toHaveBeenCalled();
  });

  it("⛔ مافيش شرح بيرجّع 422 برسالة واضحة", async () => {
    h.state.lecture = { ...(h.state.lecture as object), explanation: "   " };
    const response = await callExport();
    const body = await response.json();
    expect(response.status).toBe(422);
    expect(body.error.message).toBe("لا يوجد شرح لهذه المحاضرة بعد.");
    expect(h.generator).not.toHaveBeenCalled();
  });
});

/* ═══════════════ الاستجابة ═══════════════ */

describe("الاستجابة", () => {
  it("filename في Content-Disposition", async () => {
    const response = await callExport();
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("content-disposition")).toContain(".pdf");
  });

  it("⛔ مافيش write في الراوت (read-only)", async () => {
    // ⚠️ التصدير ماينفعش يعدّل أي حاجة. الفحص على المصدر بيحمي من
    // حد يضيف update بالغلط بعد كده.
    const src = readFileSync(
      join(process.cwd(), "app/api/lectures/[id]/export/route.ts"),
      "utf8",
    );
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(code).not.toMatch(/\.update\(|\.insert\(|\.upsert\(|\.delete\(/);
  });
});
