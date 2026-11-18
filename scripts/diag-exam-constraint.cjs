/**
 * 🔎 تشخيص **قيد «مصدر واحد بالظبط»** — read-only (SELECT فقط).
 *
 * ⚠️ **اللي حصل**: `db/49` فشل عند
 *    `add constraint exam_session_items_exactly_one_source`
 *    بـ`23514` ⇒ فيه صفوف مخالفة (مصدر ناقص/مزدوج).
 *
 * ℹ️ التشغيل: `node scripts/diag-exam-constraint.cjs`
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function main() {
  const envText = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  const line = envText
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith("DATABASE_URL="));
  if (!line) {
    console.error("❌ DATABASE_URL missing from .env.local");
    process.exit(2);
  }
  const url = line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // ① حالة الجدول: الأعمدة والقيود.
  const { rows: cols } = await client.query(`
    select column_name, data_type, is_nullable
    from information_schema.columns
    where table_schema = 'public' and table_name = 'exam_session_items'
    order by ordinal_position;
  `);
  console.log("=== exam_session_items — الأعمدة ===");
  for (const c of cols) console.log(`  ${c.column_name} (${c.data_type}) nullable=${c.is_nullable}`);

  const { rows: cons } = await client.query(`
    select con.conname, pg_get_constraintdef(con.oid) as def, con.convalidated
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public' and rel.relname = 'exam_session_items' and con.contype = 'c'
    order by con.conname;
  `);
  console.log("\n=== قيود الـCHECK ===");
  for (const c of cons) {
    console.log(`  ${c.conname} (validated=${c.convalidated})`);
    console.log(`    ${c.def}`);
  }

  // ② الصفوف المخالفة (لو كان فيه عمود document_id / topic).
  const hasDocument = cols.some((c) => c.column_name === "document_id");
  const hasTopic = cols.some((c) => c.column_name === "topic");
  console.log("\n=== الصفوف المخالفة للقيد «مصدر واحد بالظبط» ===");
  const sourceExpr = hasTopic
    ? "num_nonnulls(lecture_id, document_id, topic)"
    : hasDocument
      ? "num_nonnulls(lecture_id, document_id)"
      : "num_nonnulls(lecture_id)";
  const { rows: bad } = await client.query(`
    select
      i.id,
      i.session_id,
      i.ordinal,
      i.status,
      i.lecture_id,
      ${hasDocument ? "i.document_id," : "null::uuid as document_id,"}
      ${hasTopic ? "i.topic," : "null::text as topic,"}
      i.transcript_chars,
      s.status as session_status,
      s.created_at::text
    from public.exam_session_items i
    join public.exam_sessions s on s.id = i.session_id
    where (${sourceExpr}) <> 1
    order by i.created_at desc nulls last
    limit 50;
  `);
  console.log(`  عدد الصفوف المخالفة: ${bad.length}`);
  for (const r of bad) {
    console.log(
      `  • item=${r.id} session=${r.session_id} ordinal=${r.ordinal} status=${r.status} ` +
        `session_status=${r.session_status} lecture=${r.lecture_id ?? "NULL"} ` +
        `document=${r.document_id ?? "NULL"} topic=${r.topic ?? "NULL"} chars=${r.transcript_chars}`
    );
  }

  // ③ جلسات عدد بنودها مش مطابق لـtotal_lectures.
  const { rows: sessions } = await client.query(`
    select s.id, s.status, s.total_lectures, count(i.id) as items
    from public.exam_sessions s
    left join public.exam_session_items i on i.session_id = s.id
    group by s.id, s.status, s.total_lectures
    having count(i.id) = 0 or count(i.id) <> coalesce(s.total_lectures, 0)
    order by s.created_at desc
    limit 20;
  `);
  console.log("\n=== جلسات عدد بنودها مش مطابق لـtotal_lectures ===");
  for (const s of sessions) {
    console.log(`  • session=${s.id} status=${s.status} total_lectures=${s.total_lectures} items=${s.items}`);
  }

  // ④ الـRPCs بتاعت إنشاء الجلسات: موجودة؟ وarray_length ولا cardinality؟
  const { rows: fns } = await client.query(`
    select p.proname,
           position('cardinality(' in pg_get_functiondef(p.oid)) > 0 as has_cardinality,
           position('array_length(' in pg_get_functiondef(p.oid)) > 0 as has_array_length
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'create_exam_session%'
    order by p.proname;
  `);
  console.log("\n=== RPCs بتاعت إنشاء الجلسات ===");
  for (const f of fns) {
    console.log(`  - ${f.proname}: cardinality=${f.has_cardinality} array_length=${f.has_array_length}`);
  }

  // ⑤ القيود الفريدة (البند/المستند).
  const { rows: uniques } = await client.query(`
    select con.conname, pg_get_constraintdef(con.oid) as def
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public' and rel.relname = 'exam_session_items' and con.contype in ('u','p')
    order by con.conname;
  `);
  console.log("\n=== قيود الـUNIQUE ===");
  for (const u of uniques) console.log(`  ${u.conname}: ${u.def}`);

  await client.end();
}

main().catch((err) => {
  console.error("❌ unexpected:", err.message);
  process.exit(1);
});
