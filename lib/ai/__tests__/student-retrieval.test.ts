/**
 * 📚 Student Retrieval — استرجاع دائم من ملفات الطالب + ذاكرة الأسئلة السابقة
 * ═══════════════════════════════════════════════════════════════════════════
 * الدوال الصافية (استخراج الكلمات / المقتطف / التنسيق) ليها عقد صريح هنا،
 * والدوال اللي بتلمس DB بتتاخد بـ fake Supabase بنفس شكل سلسلة postgrest
 * المستخدمة فعلاً (select → eq → or → limit / select → eq → eq → order → limit).
 */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extractQueryTerms,
  excerptAroundTerms,
  formatStudentSnippets,
  retrieveStudentSnippets,
  getRecentQuestions,
} from "../student-retrieval";

type Row = Record<string, unknown>;

function fakeSupabase(
  tables: Record<string, Row[]>,
  opts?: { failTables?: string[] }
) {
  const apply = (rows: Row[], filters: Array<[string, unknown]>, orCond: string | null, n: number) => {
    if (opts?.failTables?.length) return { data: null, error: { message: "boom" } };
    let out = rows.filter((r) => filters.every(([c, v]) => r[c] === v));
    if (orCond) {
      const conds = orCond.split(",").map((c) => {
        const [col, rest] = c.split(".ilike.");
        return { col, term: rest.replace(/%/g, "") };
      });
      out = out.filter((r) =>
        conds.some(({ col, term }) =>
          String(r[col] ?? "").toLowerCase().includes(term.toLowerCase())
        )
      );
    }
    return { data: out.slice(0, n), error: null };
  };
  const mk = (
    table: string,
    filters: Array<[string, unknown]>,
    orCond: string | null,
    orderSpec: { col: string; ascending: boolean } | null
  ) => ({
    select: () => mk(table, filters, orCond, orderSpec),
    eq: (col: string, val: unknown) => mk(table, [...filters, [col, val]], orCond, orderSpec),
    or: (cond: string) => mk(table, filters, cond, orderSpec),
    order: (col: string, opts?: { ascending?: boolean }) =>
      mk(table, filters, orCond, { col, ascending: opts?.ascending ?? true }),
    limit: (n: number) => {
      let rows = [...(tables[table] ?? [])];
      if (orderSpec) {
        rows.sort((a, b) => {
          const cmp = String(a[orderSpec.col]).localeCompare(String(b[orderSpec.col]));
          return orderSpec.ascending ? cmp : -cmp;
        });
      }
      return Promise.resolve(apply(rows, filters, orCond, n));
    },
  });
  // cast زي باقي اختبارات الريبو — الـ fake بيعترض سلسلة postgrest المستخدمة بس
  return {
    from: (table: string) => mk(table, [], null, null),
  } as unknown as SupabaseClient;
}

describe("extractQueryTerms", () => {
  it("بيسقط الـ stopwords والكلمات القصيرة ويحتفظ بالموضوع", () => {
    const terms = extractQueryTerms("ايه علاقة الضغط بالحرارة في الفيزياء؟");
    expect(terms).toContain("علاقة");
    expect(terms).toContain("الضغط");
    expect(terms).toContain("الفيزياء");
    expect(terms).not.toContain("في");
  });

  it("بيطبيع التشكيل والحروف الكبيرة وبيزوّج التكرار", () => {
    const terms = extractQueryTerms("White lesion — white Lesion!");
    expect(terms).toEqual(["white", "lesion"]);
  });

  it("سؤال من غير كلمات مفيدة بيرجّع فاضي", () => {
    expect(extractQueryTerms("ما هو؟")).toEqual([]);
    expect(extractQueryTerms("")).toEqual([]);
  });

  it("بيحترم الحد الأقصى للكلمات", () => {
    const terms = extractQueryTerms("كلمة1 كلمة2 كلمة3 كلمة4 كلمة5 كلمة6 كلمة7 كلمة8 كلمة9 كلمة10");
    expect(terms.length).toBeLessThanOrEqual(8);
  });
});

describe("excerptAroundTerms", () => {
  const padding = "مقدمة المحاضرة الطويلة جداً بتتكرر هنا. ";
  const text = padding.repeat(10) + "الضغط الجوي بيقيس بالبارومتر. " + padding.repeat(5) + "الحرارة بتتقاس بالترمومتر.";

  it("بيقتطع حوالين المطابقة مش من أول النص", () => {
    const out = excerptAroundTerms(text, ["بارومتر"], 80);
    expect(out).toContain("بارومتر");
    expect(out.startsWith("…")).toBe(true);
  });

  it("بيفضّل النافذة اللي بتغطي أكتر من كلمة من السؤال", () => {
    const near = "أول كلام. ";
    const both = "هنا بيظهر الضغط والحرارة مع بعض في نفس الموضع.";
    const long = near.repeat(30) + both;
    const out = excerptAroundTerms(long, ["الضغط", "الحرارة"], 120);
    expect(out).toContain("الضغط");
    expect(out).toContain("الحرارة");
  });

  it("مفيش مطابقة = أول maxChars حرف", () => {
    const out = excerptAroundTerms(text, ["غيرموجودة"], 40);
    expect(out.length).toBe(40);
    expect(out.startsWith("…")).toBe(false);
  });

  it("نص فاضي = فاضي", () => {
    expect(excerptAroundTerms("", ["الضغط"], 80)).toBe("");
  });
});

describe("formatStudentSnippets", () => {
  it("فاضي = سطر فاضي (مفيش حقن)", () => {
    expect(formatStudentSnippets([])).toBe("");
  });

  it("بيضمّن عناوين المصادر والمقتطفات", () => {
    const out = formatStudentSnippets([
      { title: "Physiology ch3", family: "material", snippet: "snippet-أ" },
      { title: "محاضرة: الدورة الدموية", family: "lecture", snippet: "snippet-ب" },
    ]);
    expect(out).toContain("«Physiology ch3»");
    expect(out).toContain("«محاضرة: الدورة الدموية»");
    expect(out).toContain("snippet-أ");
    expect(out).toContain("snippet-ب");
  });

  it("بيحترم سقف الأحرف الكلي", () => {
    const hits = Array.from({ length: 10 }, (_, i) => ({
      title: `ملف ${i}`,
      family: "material" as const,
      snippet: "x".repeat(500),
    }));
    expect(formatStudentSnippets(hits, 1000).length).toBeLessThanOrEqual(1000);
  });
});

describe("retrieveStudentSnippets", () => {
  const userId = "u1";
  const tables = {
    materials: [
      { user_id: userId, title: "Physiology ch3", content: "كلام عن الضغط والحرارة", summary: null },
      { user_id: "u2", title: "ملف حد تاني", content: "الضغط", summary: null },
      { user_id: userId, title: "ملف مفيهوش حاجة", content: " ", summary: null },
    ],
    lectures: [
      { user_id: userId, status: "completed", title: "الدورة الدموية", original_filename: "a.mp3", transcript_text: "بداية طويلة " + "x".repeat(300) + " الضغط الشرياني مهم " },
      { user_id: userId, status: "processing", title: "محاضرة لسه بتتشال", transcript_text: "الضغط" },
      { user_id: "u2", status: "completed", title: "محاضرة حد تاني", transcript_text: "الضغط" },
    ],
  };

  it("بيرجّع مقتطفات من ملفات ومحاضرات المالك فقط", async () => {
    const hits = await retrieveStudentSnippets(fakeSupabase(tables), userId, "اشرحلي الضغط والحرارة");
    const titles = hits.map((h) => h.title);
    expect(titles).toContain("Physiology ch3");
    expect(titles.some((t) => t.startsWith("محاضرة: ") && t.includes("الدورة الدموية"))).toBe(true);
    expect(hits.every((h) => !h.title.includes("حد تاني"))).toBe(true);
  });

  it("المحاضرة اللي مش مكتملة ما بتترجعش", async () => {
    const hits = await retrieveStudentSnippets(fakeSupabase(tables), userId, "الضغط");
    expect(hits.some((h) => h.title.includes("لسه بتتشال"))).toBe(false);
  });

  it("مقتطف المحاضرة حوالين المطابقة مش أول 600 حرف", async () => {
    const hits = await retrieveStudentSnippets(fakeSupabase(tables), userId, "الضغط الشرياني");
    const lecture = hits.find((h) => h.family === "lecture");
    expect(lecture).toBeDefined();
    expect(lecture?.snippet).toContain("الضغط الشرياني");
  });

  it("رسالة من غير كلمات مفيدة = مفيش استعلام خالص", async () => {
    const hits = await retrieveStudentSnippets(fakeSupabase(tables), userId, "شكرا!");
    expect(hits).toEqual([]);
  });

  it("فشل DB = fail-open بمصفوفة فاضية", async () => {
    const hits = await retrieveStudentSnippets(
      fakeSupabase(tables, { failTables: ["materials"] }),
      userId,
      "الضغط"
    );
    expect(hits).toEqual([]);
  });
});

describe("getRecentQuestions", () => {
  const userId = "u1";
  const rows = (contents: string[]) =>
    contents.map((content, i) => ({ user_id: userId, role: "user", content, created_at: String(i) }));

  it("بيرجّع أقدم→أحدث مع دمج المتكرر وسقط القصير", async () => {
    const db = fakeSupabase({
      chat_messages: rows([
        "سؤال قديم جداً عن الضغط",
        "قصير",
        "سؤال قديم جداً عن الضغط",
        "سؤال أحدث عن الحرارة",
        "سؤال أحدث عن الحرارة",
      ]),
    });
    const out = await getRecentQuestions(db, userId);
    expect(out).toEqual(["سؤال قديم جداً عن الضغط", "سؤال أحدث عن الحرارة"]);
  });

  it("بيحترم الحد الأقصى", async () => {
    const db = fakeSupabase({
      chat_messages: rows(Array.from({ length: 40 }, (_, i) => `سؤال رقم ${i} طويل كفاية`)),
    });
    const out = await getRecentQuestions(db, userId, 6);
    expect(out.length).toBe(6);
  });

  it("رسايل الـ assistant ما بتترجعش", async () => {
    const db = fakeSupabase({
      chat_messages: [
        { user_id: userId, role: "user", content: "سؤال الطالب الطويل كفاية" },
        { user_id: userId, role: "assistant", content: "رد المساعد الطويل كفاية جداً" },
      ],
    });
    const out = await getRecentQuestions(db, userId);
    expect(out).toEqual(["سؤال الطالب الطويل كفاية"]);
  });

  it("فشل DB = fail-open", async () => {
    const db = fakeSupabase({ chat_messages: [] }, { failTables: ["chat_messages"] });
    await expect(getRecentQuestions(db, userId)).resolves.toEqual([]);
  });
});
