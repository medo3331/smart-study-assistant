/**
 * 🔎 تشخيص مخطط امتحانات — read-only تماماً، ومفيش أي secret بيتطبع.
 *
 * الهدف: نعرف **ليه** مسار الامتحان بيرجع 500/503 بالظبط:
 *   - هل عمود `exam_session_items.document_id` موجود؟ (migration 49)
 *   - هل الـRPC `create_exam_session_with_sources_reserve` موجود؟
 *   - هل جداول `documents` / `knowledge_base` موجودة؟
 *
 * ❌ **مفيش writes** — الفحص بالاستعلام فقط (GET/HEAD).
 *
 * التشغيل: `node scripts/check-exam-schema.cjs`
 */
const fs = require("fs");
const path = require("path");

const env = {};
for (const line of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
  if (m) env[m[1]] = m[2];
}

const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!BASE || !KEY) {
  console.error("❌ مفقود NEXT_PUBLIC_SUPABASE_URL / SERVICE_ROLE_KEY في .env.local");
  process.exit(1);
}
const H = { apikey: KEY, Authorization: "Bearer " + KEY };

/** نتيجة فحص واحدة: موجود / ناقص + سبب PostgREST. */
async function probe(label, pathAndQuery) {
  const res = await fetch(BASE + "/rest/v1/" + pathAndQuery, { headers: H });
  const text = await res.text();
  let code = "";
  let message = "";
  try {
    const parsed = JSON.parse(text);
    code = parsed.code || parsed.error || "";
    message = parsed.message || parsed.hint || "";
  } catch {
    message = text.slice(0, 200);
  }
  const ok = res.ok;
  console.log(`${ok ? "✅" : "❌"} ${label}`);
  console.log(`   status=${res.status}${code ? ` code=${code}` : ""}`);
  if (!ok) {
    console.log(`   ${String(message).replace(/\s+/g, " ").slice(0, 220)}`);
  }
  return { ok, status: res.status, code, message };
}

(async () => {
  console.log("=== 1) جدول exam_session_items ===");
  await probe("exam_session_items (base)", "exam_session_items?select=id&limit=1");

  console.log("\n=== 2) عمود document_id (migration 49) ===");
  const docColumn = await probe(
    "exam_session_items.document_id",
    "exam_session_items?select=id,document_id&limit=1"
  );

  console.log("\n=== 3) جداول المستندات ===");
  await probe("documents", "documents?select=id&limit=1");
  await probe("knowledge_base", "knowledge_base?select=id&limit=1");

  console.log("\n=== 4) جدول المحاضرات ===");
  await probe("lectures", "lectures?select=id,transcript_text&limit=1");

  console.log("\n=== 5) الـRPCs (من OpenAPI schema) ===");
  const specRes = await fetch(BASE + "/rest/v1/", {
    headers: { ...H, Accept: "application/openapi+json" },
  });
  if (specRes.ok) {
    const spec = await specRes.json();
    const defs = spec.definitions || {};
    const names = Object.keys(defs);
    const has = (name) => names.includes(name);
    console.log(
      `${has("create_exam_session_with_sources_reserve") ? "✅" : "❌"} create_exam_session_with_sources_reserve`
    );
    console.log(
      `${has("create_exam_session_with_reserve") ? "✅" : "❌"} create_exam_session_with_reserve`
    );
    // 🧾 كل الـRPCs الظاهرة في الكاش — عشان نعرف هل فيه دوال أصلاً.
    const rpcLike = names.filter((n) => !/^Iris/.test(n) && n.includes("_"));
    console.log(`\nℹ️ عدد الـdefinitions: ${names.length} · دوال مشاكلها: ${rpcLike.length}`);
    console.log("ℹ️ أمثلة:", rpcLike.slice(0, 25).join(", ") || "(مفيش)");
    const examDefs = names.filter((n) => /exam/i.test(n));
    console.log("ℹ️ الـexam-related:", examDefs.join(", ") || "(مفيش)");
  } else {
    console.log("❌ تعذّر قراءة OpenAPI:", specRes.status);
  }

  console.log("\n=== 6) استدعاء الـRPC (بـuuid وهمي ⇒ مفيش كتابة) ===");
  const fakeId = "00000000-0000-4000-8000-000000000000";
  for (const fn of ["create_exam_session_with_reserve", "create_exam_session_with_sources_reserve"]) {
    const body =
      fn === "create_exam_session_with_reserve"
        ? { p_mode: "last_minute_review", p_lecture_ids: [fakeId] }
        : { p_mode: "last_minute_review", p_lecture_ids: [], p_document_ids: [fakeId] };
    const res = await fetch(BASE + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: { ...H, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let code = "";
    let message = text;
    try {
      const parsed = JSON.parse(text);
      code = parsed.code || "";
      message = parsed.message || parsed.hint || text;
    } catch {}
    console.log(`── ${fn} → status=${res.status}${code ? ` code=${code}` : ""}`);
    console.log(`   ${String(message).replace(/\s+/g, " ").slice(0, 240)}`);
    if (code === "PGRST202" || /could not find the function/i.test(String(message))) {
      console.log(
        "   ⚠️ الـfunction مش في schema cache بتاع PostgREST ⇒ يا إما ناقصة في القاعدة، يا الكاش قديم."
      );
      console.log("   🔧 الحل: في Supabase SQL Editor شغّل:");
      console.log("      select pg_notify('pgrst', 'reload schema');");
    }
  }

  console.log("\n=== الخلاصة ===");
  const problems = [];
  if (!docColumn.ok) {
    problems.push(
      "عمود exam_session_items.document_id ناقص ⇒ طبّق db/49-exam-documents.sql (وده سبب 500 في المسارات الجديدة)"
    );
  }
  if (problems.length === 0) {
    console.log("✅ الجداول سليمة — لو لسه فيه 500 ⇒ شوف قسم 5/6 (الـRPC) ولوج المزوّد.");
  } else {
    for (const p of problems) console.log("❌ " + p);
  }
})();
