/**
 * 🔎 تشخيص أخطاء مسار الامتحان **من القاعدة الحقيقية** (read-only).
 *
 * ⚠️ **ليه**: الـconsole في المتصفح بيقول بس «404/502/503» — من غير سبب.
 *    جدول `runtime_error_events` فيه المسار + التصنيف + المزوّد + الموديل
 *    + الرسالة sanitized ⇒ نعرف بالظبط فين وباي status.
 *
 * 🔒 SELECT فقط — مافيش أي كتابة.
 *
 * التشغيل: `node scripts/diag-exam-errors.cjs [ساعات]`
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function main() {
  const hours = Number(process.argv[2]) || 48;
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

  // ① جدول أخطاء الـruntime موجود؟
  const { rows: tableRows } = await client.query(`
    select exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'runtime_error_events'
    ) as exists;
  `);
  if (!tableRows[0]?.exists) {
    console.log("⚠️ جدول runtime_error_events مش موجود (db/17 متطبّقةش) — مافيش سجل أخطاء.");
    await client.end();
    return;
  }

  // ② الأخطاء الأخيرة (كل المسارات) في النافذة الزمنية.
  const { rows } = await client.query(
    `
    select created_at::text, route, feature, error_type, category, outcome,
           provider, model, message_sanitized
    from public.runtime_error_events
    where created_at > now() - ($1 || ' hours')::interval
    order by created_at desc
    limit 60;
  `,
    [String(hours)]
  );

  console.log(`=== أخطاء الـruntime (آخر ${hours} ساعة) — ${rows.length} سطر ===\n`);
  if (rows.length === 0) {
    console.log("✅ مافيش أخطاء مسجّلة.");
  }
  for (const row of rows) {
    console.log(
      `${row.created_at} | ${row.category}/${row.error_type} | route=${row.route} | ` +
        `provider=${row.provider ?? "-"} model=${row.model ?? "-"} | ${String(row.message_sanitized ?? "").slice(0, 220)}`
    );
  }

  // ③ ملخّص بالمسار.
  const { rows: byRoute } = await client.query(
    `
    select route, category, count(*)::int as n
    from public.runtime_error_events
    where created_at > now() - ($1 || ' hours')::interval
    group by route, category
    order by n desc
    limit 20;
  `,
    [String(hours)]
  );
  console.log("\n=== ملخّص ===");
  for (const row of byRoute) {
    console.log(`  ${row.n}× ${row.category} — ${row.route}`);
  }

  // ④ جلسات الامتحان الحديثة + حالة بنودها (تشخيص الـ404: بند ناقص؟).
  const { rows: sessions } = await client.query(`
    select s.id::text, s.status, s.total_lectures, s.total_chars, s.total_chunks,
           s.created_at::text,
           (select count(*)::int from public.exam_session_items i where i.session_id = s.id) as items,
           (select count(*)::int from public.exam_session_items i where i.session_id = s.id and i.status = 'ready') as ready_items
    from public.exam_sessions s
    where s.created_at > now() - interval '7 days'
    order by s.created_at desc
    limit 12;
  `);
  console.log("\n=== آخر جلسات الامتحان ===");
  if (sessions.length === 0) {
    console.log("  (مافيش جلسات في آخر 7 أيام)");
  }
  for (const row of sessions) {
    console.log(
      `  ${row.created_at} | status=${row.status} | sources=${row.total_lectures} | ` +
        `items=${row.items} (ready=${row.ready_items}) | chars=${row.total_chars} chunks=${row.total_chunks} | ${row.id}`
    );
    if (row.items === 0) console.log("    ⚠️ جلسة من غير بنود ⇒ الـprocess هيرجّع 404!");
  }

  // ⑤ تفاصيل بنود آخر الجلسات (حالة كل بند + سبب الفشل).
  const { rows: items } = await client.query(`
    select i.id::text, i.session_id::text, i.status, i.attempt_count,
           i.lecture_id::text, i.document_id::text, i.topic,
           i.error_code, i.error_message, i.transcript_chars, i.chunk_count,
           i.claimed_at::text, i.lease_expires_at::text, i.started_at::text, i.completed_at::text
    from public.exam_session_items i
    where i.created_at > now() - interval '7 days'
    order by i.created_at desc
    limit 12;
  `);
  console.log("\n=== آخر بنود الامتحانات ===");
  if (items.length === 0) console.log("  (مافيش بنود)");
  for (const row of items) {
    const source = row.topic ? `topic("${String(row.topic).slice(0, 30)}")` : row.document_id ? "document" : "lecture";
    console.log(
      `  status=${row.status} attempts=${row.attempt_count} source=${source} chars=${row.transcript_chars ?? "-"}` +
        ` error=${row.error_code ?? "-"}${row.error_message ? ` (${String(row.error_message).slice(0, 120)})` : ""}`
    );
    console.log(
      `    session=${row.session_id} item=${row.id} lease=${row.lease_expires_at ?? "-"} completed=${row.completed_at ?? "-"}`
    );
  }

  // ⑥ محاولات المزوّد الفعلية (ai_usage_events) — مين اتعيط وباي status.
  const { rows: usage } = await client.query(`
    select created_at::text, provider, model, status,
           metadata->>'httpStatus' as http_status,
           metadata->>'reason' as reason,
           metadata->>'exam_session_id' as session_id,
           metadata->>'ai_task' as ai_task,
           latency_ms
    from public.ai_usage_events
    where feature = 'exam_review'
      and created_at > now() - interval '3 days'
    order by created_at desc
    limit 40;
  `);
  console.log("\n=== محاولات مزوّدات توليد الامتحان (آخر 3 أيام) ===");
  if (usage.length === 0) {
    console.log("  (مافيش سجلات) — يعني النداءات مابصرتش المزوّد أصلاً.");
  }
  for (const row of usage) {
    console.log(
      `  ${row.created_at} | ${row.provider}/${row.model ?? "-"} | status=${row.status}` +
        ` http=${row.http_status ?? "-"} reason=${String(row.reason ?? "-").slice(0, 80)}` +
        ` task=${row.ai_task ?? "-"} latency=${row.latency_ms ?? "-"}ms session=${String(row.session_id ?? "-").slice(0, 8)}`
    );
  }

  // ⑦ ملخّص: أي مزوّد/موديل بيفشل أكتر.
  const { rows: summary } = await client.query(`
    select provider, model, status,
           metadata->>'httpStatus' as http_status,
           count(*)::int as n
    from public.ai_usage_events
    where feature = 'exam_review'
      and created_at > now() - interval '3 days'
    group by provider, model, status, metadata->>'httpStatus'
    order by n desc
    limit 15;
  `);
  console.log("\n=== ملخّص الفشل ===");
  for (const row of summary) {
    console.log(`  ${row.n}× ${row.provider}/${row.model ?? "-"} status=${row.status} http=${row.http_status ?? "-"}`);
  }

  await client.end();
}

main().catch((err) => {
  console.error("❌ unexpected:", err.message);
  process.exit(1);
});
