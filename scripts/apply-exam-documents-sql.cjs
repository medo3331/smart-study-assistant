/**
 * 🔧 تطبيق db/49-exam-documents.sql على القاعدة الحقيقية (Supabase Postgres).
 *
 * ⚠️ **السبب**: الـmigration دي فيها bug في `array_length` (بيرجّع NULL لل
 *    массив الفاضي) ⇒ `total_lectures` بتبقى NULL ⇒ **500 عند إنشاء أي
 *    امتحان**. الملف اتصلّح (`cardinality`) واتطبّق هنا.
 *
 * 📌 **idempotent**: كل العبارات `IF NOT EXISTS / OR REPLACE / DROP IF EXISTS`
 *    ⇒ تشغيل الملف أكتر من مرة آمن.
 *
 * 🔒 **أمان**: `DATABASE_URL` بيتبقرأ من `.env.local` ولا بيتطبع أبدًا.
 *    مافيش أي كتابة غير إعادة تعريف الـfunction (create or replace).
 *
 * التشغيل: `node scripts/apply-exam-documents-sql.cjs`
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function main() {
  const envPath = path.join(__dirname, "..", ".env.local");
  const envText = fs.readFileSync(envPath, "utf8");
  const line = envText
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith("DATABASE_URL="));
  if (!line) {
    console.error("❌ DATABASE_URL missing from .env.local");
    process.exit(2);
  }
  const url = line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  if (!/^postgres(ql)?:\/\//.test(url)) {
    console.error("❌ DATABASE_URL is not a postgres:// URL");
    process.exit(2);
  }

  const sqlPath = path.join(__dirname, "..", "db", "49-exam-documents.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("✅ connected");

  /**
   * 🔍 **فحص مسبق** — لو فيه صفوف بتخالف قيد «مصدر واحد بالظبط»
   *    بنقول بالظبط كام صف وليه، بدل ما الـADD CONSTINCT يفشل بـ23514
   *    والـtransaction كله يتراجع.
   */
  const { rows: preCols } = await client.query(`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'exam_session_items'
      and column_name in ('document_id', 'topic');
  `);
  const hasDocument = preCols.some((c) => c.column_name === "document_id");
  const hasTopic = preCols.some((c) => c.column_name === "topic");
  const sourceExpr = hasTopic
    ? "num_nonnulls(lecture_id, document_id, topic)"
    : hasDocument
      ? "num_nonnulls(lecture_id, document_id)"
      : "num_nonnulls(lecture_id)";
  const { rows: badRows } = await client.query(`
    select i.id, i.session_id, i.ordinal, i.status, i.lecture_id
    from public.exam_session_items i
    where (${sourceExpr}) <> 1
    order by i.created_at desc nulls last
    limit 20;
  `);
  if (badRows.length > 0) {
    console.error(
      `❌ فيه ${badRows.length} بند مخالف لقيد «مصدر واحد بالظبط» — القيد مش هيتطبّق.`
    );
    for (const r of badRows) {
      console.error(
        `   • item=${r.id} session=${r.session_id} ordinal=${r.ordinal} status=${r.status} lecture=${r.lecture_id ?? "NULL"}`
      );
    }
    console.error("   (المعامل: num_nonnulls(...) <> 1) — راجع db/49 + db/50.");
    await client.end();
    process.exit(1);
  }
  console.log(
    `✅ pre-check: مفيش بنود مخالفة (${sourceExpr} = 1 لكل البنود) · topic=${hasTopic} document=${hasDocument}`
  );

  try {
    await client.query(sql);
    console.log("✅ 49-exam-documents.sql applied OK");
  } catch (err) {
    console.error("❌ APPLY FAILED:", err.message);
    console.error("   code:", err.code);
    if (err.code === "23514") {
      console.error("   ⓘ 23514 = قيد «مصدر واحد بالظبط» اتكسر بصف مخالف.");
      console.error("   ⓘ rerun the pre-check above (أو node scripts/diag-exam-constraint.cjs).");
    }
    await client.end();
    process.exit(1);
  }

  // ── التحقق: الدالة بقت تستخدم cardinality مش array_length.
  //
  // ⚠️ **مهم**: `pg_get_functiondef` بيرجّع الكود **مع التعليقات** ⇒
  //    لازم نشيلها قبل البحث، وإلا كل دالة فيها ذكر `array_length`
  //    في تعليق بتطلع «لسه فيها array_length» (نتيجة مضلّلة ✗).
  const stripComments = (def) =>
    String(def || "")
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");

  const { rows } = await client.query(`
    select pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_exam_session_with_sources_reserve';
  `);

  const fnCode = rows[0] ? stripComments(rows[0].def) : "";
  if (!rows[0]) {
    console.log("⚠️ الـfunction مش موجودة — اتأكد إن الـmigration اتطبّقت.");
  } else if (fnCode.includes("array_length(")) {
    console.log("⚠️ verify: الـfunction لسه فيها array_length — راجع الـmigration.");
  } else if (fnCode.includes("cardinality(")) {
    console.log("✅ verify: الـfunction بقت تستخدم cardinality (مفيش array_length)");
  } else {
    console.log("⚠️ verify: مقدرناش نقرأ الـfunction — راجع الـmigration.");
  }

  // ── التحقق: الـRPC القديم (fallback) اتصلّح برضه.
  const { rows: legacy } = await client.query(`
    select pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_exam_session_with_reserve';
  `);
  const legacyCode = legacy[0] ? stripComments(legacy[0].def) : "";
  if (!legacy[0]) {
    console.log("⚠️ الـRPC القديم مش موجود.");
  } else if (legacyCode.includes("array_length(")) {
    console.log("⚠️ verify: الـRPC القديم لسه فيه array_length.");
  } else if (legacyCode.includes("cardinality(")) {
    console.log("✅ verify: الـRPC القديم (fallback) بقى cardinality كمان");
  }

  // ── التحقق: الـRPC بتاع «موضوع عام» موجود (db/50).
  const { rows: topicFn } = await client.query(`
    select count(*)::int as n
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_exam_session_with_topic_reserve';
  `);
  if ((topicFn[0]?.n ?? 0) > 0) {
    console.log("✅ verify: RPC «موضوع عام» موجود (db/50)");
  } else {
    console.log("⚠️ RPC «موضوع عام» مش موجود — شغّل node scripts/apply-exam-topic-sql.cjs");
  }

  // ── التحقق: شكل قيد «مصدر واحد بالظبط» مطابق للأعمدة الموجودة.
  const { rows: constraint } = await client.query(`
    select pg_get_constraintdef(con.oid) as def
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public' and rel.relname = 'exam_session_items'
      and con.conname = 'exam_session_items_exactly_one_source';
  `);
  const def = constraint[0]?.def ?? "";
  if (def) {
    const mentionsTopic = def.includes("topic");
    if (hasTopic && !mentionsTopic) {
      console.error("⚠️ القيد مش بيغطي عمود topic — بنود «موضوع عام» هتتكسر.");
    } else {
      console.log(`✅ verify: القيد = ${def}`);
    }
  } else {
    console.log("⚠️ القيد مش موجود.");
  }

  // ── التحقق: قيود الـschema سليمة.
  const { rows: cols } = await client.query(`
    select column_name, is_nullable
    from information_schema.columns
    where table_schema = 'public' and table_name = 'exam_session_items'
      and column_name in ('lecture_id', 'document_id')
    order by column_name;
  `);
  for (const col of cols) {
    console.log(`ℹ️ exam_session_items.${col.column_name} → nullable=${col.is_nullable}`);
  }

  await client.end();
}

main().catch((err) => {
  console.error("❌ unexpected:", err.message);
  process.exit(1);
});
