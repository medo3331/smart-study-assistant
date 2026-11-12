/**
 * 🔥 Smoke Test شامل للـ Core Loop كله
 * ═══════════════════════════════════════════════════════════════════════
 *
 * بيختبر المسارات بالترتيب اللي المستخدم بيمشي فيه فعلياً:
 *
 *   ① Chat Assistant عادي (من غير ملفات)
 *   ② رفع مستند (PDF) ⇒ material + document + pages
 *   ③ Chat Assistant مع المستند كـ source (الـ source resolver)
 *   ④ File Analysis القديم (تلخيص/تحليل) على نفس المادة
 *   ⑤ توليد العرض التقديمي (جزء واحد)
 *   ⑥ تنزيل العرض بـ 3 صيغ
 *   ⑦ Workspace digest (المحاضرات + المواد)
 *   ⑧ cleanup كامل
 *
 * ⚠️ **بينظّف كل حاجة بيعملها** — آخر حاجة في الملف دايمًا cleanup
 *    (حتى لو حصل fail) عشان ما نلوّثش قاعدة الإنتاج.
 *
 * التشغيل: node smoke-core-loop.mjs [baseUrl]
 */

import { readFileSync } from "node:fs";
import pg from "file:///C:/Desktop/smart-study-assistant/node_modules/pg/lib/index.js";

const BASE = process.argv[2] ?? "http://localhost:3000";
const EMAIL = process.env.SMOKE_EMAIL ?? "me7960878@gmail.com";

const env = Object.fromEntries(
  readFileSync("C:/Desktop/smart-study-assistant/.env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      let v = l.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      return [l.slice(0, i).trim(), v];
    }),
);

/* ─────────────── helpers ─────────────── */
const results = [];
let failures = 0;
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function jfetch(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
  return { status: res.status, body, res };
}

/* ─────────────── session ─────────────── */
console.log(`\n🎯 Smoke Test — Core Loop @ ${BASE}\n${"═".repeat(60)}`);

const U = env.NEXT_PUBLIC_SUPABASE_URL;
const S = env.SUPABASE_SERVICE_ROLE_KEY;
const gen = await fetch(`${U}/auth/v1/admin/generate_link`, {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: S, Authorization: `Bearer ${S}` },
  body: JSON.stringify({ type: "magiclink", email: EMAIL }),
});
const g = await gen.json();
const ver = await fetch(`${U}/auth/v1/verify`, {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: S, Authorization: `Bearer ${S}` },
  body: JSON.stringify({ type: "magiclink", token_hash: g.hashed_token ?? g.properties?.hashed_token }),
});
const session = await ver.json();
if (!session.access_token) {
  console.error("✗ فشل تسجيل الجلسة:", JSON.stringify(session).slice(0, 300));
  process.exit(1);
}
const H = { Authorization: `Bearer ${session.access_token}` };
const UID = session.user.id;
console.log(`  session: ${UID}\n`);

const db = new pg.Client({ connectionString: env.DATABASE_URL });
await db.connect();

/** تنظيف أي بقايا من اختبارات سابقة (نفس الـ email) */
await db.query(
  `delete from public.knowledge_base
   where user_id = $1 and source_type = 'user' and source_kind = 'material'
     and source_id in (select id from public.documents where material_id is not null)`,
  [UID],
);
await db.query(
  `delete from public.documents where user_id = $1 and material_id is not null`,
  [UID],
);
await db.query(`delete from public.materials where user_id = $1 and title like 'smoke-%'`, [UID]);

let materialId = null;
let documentId = null;

/* ═════════════ ① Chat Assistant عادي ═════════════ */
console.log("① Chat Assistant (من غير ملفات)");
const chat1 = await jfetch("/api/chat", {
  method: "POST",
  headers: { ...H, "Content-Type": "application/json" },
  body: JSON.stringify({ messages: [{ role: "user", content: "سلام، جاوب بكلمة واحدة بس: تمام؟" }] }),
});
// ⚠️ الرد شكله: `{ ...provider payload }` ⇒ `choices[0].message.content`
const chatText = (b) => b?.choices?.[0]?.message?.content ?? "";
check(
  "chat يردّ",
  chat1.status === 200 && typeof chatText(chat1.body) === "string" && chatText(chat1.body).length > 0,
  chat1.status === 200 ? `reply=${String(chatText(chat1.body)).slice(0, 60)}` : `status=${chat1.status} ${JSON.stringify(chat1.body).slice(0, 200)}`,
);

/* ═════════════ ② رفع مستند ═════════════ */
console.log("\n② رفع مستند PDF (materials + documents + pages)");
const pdf = readFileSync("C:/Desktop/smart-study-assistant/workspace/cufe-cce-en.pdf");
const fd = new FormData();
fd.append("file", new Blob([pdf], { type: "application/pdf" }), "smoke-test.pdf");
const up = await jfetch("/api/documents", { method: "POST", headers: H, body: fd });
check("الرفع نجح", up.status === 200 && up.body?.ok === true, `status=${up.status} ${JSON.stringify(up.body).slice(0, 200)}`);

if (up.status === 200) {
  materialId = up.body.material.id;
  documentId = up.body.document.id;
  check("material اتعمل", Boolean(materialId), materialId);
  check("document اتعمل", Boolean(documentId), documentId);
  check("صفحات اتقرت", (up.body.page_count ?? 0) > 0, `page_count=${up.body.page_count}`);

  const kb = await db.query(
    `select count(*)::int as n, min(source_page) as first, max(source_page) as last
     from public.knowledge_base where source_id = $1`,
    [documentId],
  );
  check("صفحات في knowledge_base", kb.rows[0].n > 0, JSON.stringify(kb.rows[0]));

  // ⚠️ شكل الـ material: الـ UI بيقرأ camelCase — لازم يتأكد
  const m = up.body.material;
  check(
    "⚠️ shape الـ material: createdAt موجود؟",
    typeof m.createdAt === "string",
    `createdAt=${m.createdAt} | created_at=${m.created_at}`,
  );
  check(
    "⚠️ shape الـ material: fileType موجود؟",
    typeof m.fileType === "string",
    `fileType=${m.fileType} | file_type=${m.file_type}`,
  );
}

/* ═════════════ ③ Chat مع المستند كـ source ═════════════ */
if (materialId) {
  console.log("\n③ Chat Assistant مع المستند كـ source");
  // ⚠️ الـ source resolver بيشتغل **بالنص** («افتح الملف رقم 1») — مش
  //    بمعرف الـ material. ده نفس اللي بتعمله الواجهة.
  const chat2 = await jfetch("/api/chat", {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "افتح الملف رقم 1" }],
    }),
  });
  check(
    "chat مع source يردّ",
    chat2.status === 200 && typeof chatText(chat2.body) === "string" && chatText(chat2.body).length > 0,
    chat2.status === 200 ? `reply=${String(chatText(chat2.body)).slice(0, 80)}` : `status=${chat2.status} ${JSON.stringify(chat2.body).slice(0, 250)}`,
  );

  // ⚠️ **الصراع الحقيقي**: هل الـ source resolver بيشوف المادة الجديدة؟
  //    (بيقرأ `materials` — لازم يتأكد إن الرفع الجديد عمل صف صح)
  const matRow = await db.query(
    `select id, title, length(content) as len, created_at from public.materials where id = $1`,
    [materialId],
  );
  check(
    "المادة الجديدة قابلة للقراءة (الـ resolver هيشوفها)",
    matRow.rows.length === 1 && (matRow.rows[0].len ?? 0) > 0,
    JSON.stringify(matRow.rows[0] ?? {}),
  );
}

/* ═════════════ ④ File Analysis القديم ═════════════ */
if (materialId) {
  console.log("\n④ File Analysis القديم (تلخيص) — بيمشي على Gemini");
  const fa = await jfetch("/api/ai/file-analysis", {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ materialId, action: "summarize" }),
  });
  check(
    "file-analysis بيشتغل",
    fa.status === 200 && typeof fa.body?.result === "string" && fa.body.result.length > 0,
    fa.status === 200 ? `result=${String(fa.body?.result).slice(0, 70)}` : `status=${fa.status} ${JSON.stringify(fa.body).slice(0, 250)}`,
  );
}

/* ═════════════ ⑤ توليد العرض التقديمي ═════════════ */
if (documentId) {
  console.log("\n⑤ توليد العرض التقديمي (جزء واحد)");
  const gen1 = await jfetch(`/api/documents/${documentId}/slides`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const slides = gen1.body?.slides ?? [];
  const bullets = slides.flatMap((s) => s.bullets ?? []);
  const withRef = bullets.filter((b) => b.page !== null && b.page !== undefined).length;
  check(
    "العرض اتولّد",
    gen1.status === 200 && slides.length > 0,
    `status=${gen1.status} شرائح=${slides.length} ${gen1.status !== 200 ? JSON.stringify(gen1.body).slice(0, 200) : ""}`,
  );
  check(
    "كل النقpts عندها مرجع صفحة",
    bullets.length > 0 && withRef === bullets.length,
    `${withRef}/${bullets.length}`,
  );

  /* ═════════════ ⑥ تنزيل الـ 3 صيغ ═════════════ */
  console.log("\n⑥ تنزيل العرض بـ 3 صيغ");
  for (const fmt of ["pptx", "pdf", "docx"]) {
    const dl = await fetch(`${BASE}/api/documents/${documentId}/slides`, {
      method: "POST",
      headers: { ...H, "Content-Type": "application/json" },
      body: JSON.stringify({ format: fmt }),
    });
    const buf = Buffer.from(await dl.arrayBuffer());
    const sig = buf.subarray(0, 4).toString("hex");
    const expect = { pptx: "504b", pdf: "25504446", docx: "504b" }[fmt];
    check(
      `تنزيل ${fmt}`,
      dl.status === 200 && buf.length > 1000 && sig.startsWith(expect),
      `status=${dl.status} حجم=${buf.length} signature=${sig}`,
    );
  }
}

/* ═════════════ ⑦ GET /api/documents?materialId= ═════════════ */
if (materialId) {
  console.log("\n⑦ lookup المستند من الـ material");
  const look = await jfetch(`/api/documents?materialId=${materialId}`, { headers: H });
  check(
    "lookup شغّال",
    look.status === 200 && look.body?.document?.id === documentId,
    `status=${look.status} ${JSON.stringify(look.body).slice(0, 150)}`,
  );
}

/* ═════════════ ⑧ cleanup ═════════════ */
console.log("\n⑧ cleanup");
if (documentId) await db.query(`delete from public.knowledge_base where source_id = $1`, [documentId]);
if (documentId) await db.query(`delete from public.documents where id = $1`, [documentId]);
if (materialId) await db.query(`delete from public.materials where id = $1`, [materialId]);
const left = await db.query(
  `select
     (select count(*)::int from public.materials where id = $1) as m,
     (select count(*)::int from public.documents where id = $2) as d,
     (select count(*)::int from public.knowledge_base where source_id = $2) as k`,
  [materialId, documentId],
);
check("اتمسح كله", left.rows[0].m === 0 && left.rows[0].d === 0 && left.rows[0].k === 0, JSON.stringify(left.rows[0]));
await db.end();

/* ═════════════ الملخص ═════════════ */
console.log(`\n${"═".repeat(60)}`);
console.log(`النتيجة: ${results.length - failures}/${results.length} نجح${failures ? ` — ${failures} فشل` : " — كله أخضر ✅"}`);
for (const r of results.filter((x) => !x.ok)) console.log(`  ❌ ${r.name}: ${r.detail}`);
process.exit(failures ? 1 : 0);
