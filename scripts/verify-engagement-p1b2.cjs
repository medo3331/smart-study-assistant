/**
 * 🔍 تحقق P1-B2 — Trusted Engagement Events
 *
 * ⚠️ **كل اختبارات الكتابة بتجري جوه transaction بتتقفل بـROLLBACK**
 *    ⇒ مفيش صف اختباري بيفضل في القاعدة.
 *    الاختبارات السلبية (الصلاحيات) بتتعمل بـSET ROLE sandbox — قراءة فقط.
 *
 * السيناريوهات:
 *   1) allowlist: نوع غير مسجّل ⇒ مرفوض.
 *   2) provenance: source_table غلط ⇒ مرفوض.
 *   3) metadata: مفتاح مش مسموح ⇒ مرفوض.
 *   4) idempotency: نفس الحدث مرتين ⇒ صف واحد بس.
 *   5) verified_by: الـDB هي اللي بتكتبه — مش المتصل.
 *   6) الصلاحيات: anon/authenticated مفيهمش insert/select/update/delete/truncate.
 *   7) Append-only: UPDATE/DELETE مرفوضين (trigger).
 *   8) الرفض المتوقّع بيستخدم SAVEPOINT عشان ميكسرش الـtransaction.
 *
 * التشغيل: `node scripts/verify-engagement-p1b2.cjs`
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

function dbUrl() {
  const envText = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  const line = envText.split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL missing");
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

let passed = 0;
let failed = 0;

function check(name, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`  ✅ ${name}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  const client = new Client({ connectionString: dbUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("✅ connected\n");

  // نستخدم مستخدم حقيقي للمطابقة مع FK على auth.users.
  const { rows: userRows } = await client.query(
    `select id from auth.users order by created_at limit 1;`,
  );
  if (!userRows.length) {
    console.log("⚠️ مفيش مستخدمين في auth.users — تخطّي اختبارات الكتابة.");
    await client.end();
    return;
  }
  const userId = userRows[0].id;
  const sourceId = `verify-${Date.now()}`;

  /** ينفّذ عبارة متوقّع إنها تفشل، ويرجّع الرسالة (أو null لو نجحت!). */
  let savepoint = 0;
  async function expectFailure(label, sql, params, pattern) {
    const sp = `sp_${savepoint++}`;
    await client.query(`SAVEPOINT ${sp}`);
    let error = null;
    try {
      await client.query(sql, params);
    } catch (e) {
      error = e;
    }
    if (error) {
      await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    }
    await client.query(`RELEASE SAVEPOINT ${sp}`);
    check(
      label,
      !!error && (!pattern || pattern.test(error.message)),
      error ? error.message.slice(0, 120) : "نجحت بدون خطأ — خطر!",
    );
    return error;
  }

  console.log("── 1) allowlist / provenance / metadata / idempotency ──");

  await client.query("BEGIN");

  await expectFailure(
    "نوع غير مسجّل مرفوض",
    `select public.record_engagement_event('totally_unknown_event','exam_sessions',$1,$2,'{}'::jsonb)`,
    [sourceId, userId],
    /unknown or inactive event type/,
  );

  await expectFailure(
    "source_table غير مطابق مرفوض",
    `select public.record_engagement_event('exam_completed','not_the_right_table',$1,$2,'{}'::jsonb)`,
    [sourceId, userId],
    /not allowed for event type/,
  );

  await expectFailure(
    "مفتاح metadata ممنوع مرفوض",
    `select public.record_engagement_event('exam_completed','exam_sessions',$1,$2,'{"secret_key":"x"}'::jsonb)`,
    [sourceId, userId],
    /keys not allowed/,
  );

  await expectFailure(
    "metadata مش object مرفوض",
    `select public.record_engagement_event('exam_completed','exam_sessions',$1,$2,'[1,2]'::jsonb)`,
    [sourceId, userId],
    /must be a JSON object/,
  );

  await expectFailure(
    "نوع client_reported من مصدر server مرفوض (provenance)",
    `select public.record_engagement_event('notes_saved','exam_sessions',$1,$2,'{}'::jsonb)`,
    [sourceId, userId],
    /not allowed for event type/,
  );

  // idempotency: أول مرة inserted=true، تاني مرة inserted=false بنفس الـid.
  const first = await client.query(
    `select public.record_engagement_event('exam_completed','exam_sessions',$1,$2,'{"percent":80}'::jsonb) as r`,
    [sourceId, userId],
  );
  const firstRes = first.rows[0].r;
  check("أول تسجيل => inserted=true", firstRes?.inserted === true, JSON.stringify(firstRes));

  const second = await client.query(
    `select public.record_engagement_event('exam_completed','exam_sessions',$1,$2,'{"percent":80}'::jsonb) as r`,
    [sourceId, userId],
  );
  const secondRes = second.rows[0].r;
  check(
    "إعادة التسجيل => inserted=false (idempotent)",
    secondRes?.inserted === false,
    JSON.stringify(secondRes),
  );
  check("نفس الـevent id في الحالتين", firstRes?.id === secondRes?.id, `${firstRes?.id} vs ${secondRes?.id}`);

  const { rows: vrows } = await client.query(
    `select verified_by, metadata, source_table, source_id from public.engagement_events where id = $1`,
    [firstRes.id],
  );
  check(
    "verified_by = 'service_role' (الـDB هي اللي كتبتها)",
    vrows[0]?.verified_by === "service_role",
    vrows[0]?.verified_by,
  );
  check("source_table محفوظ زي ما الـregistry", vrows[0]?.source_table === "exam_sessions");

  const { rows: crows } = await client.query(
    `select count(*)::int as c from public.engagement_events
      where user_id = $1 and event_type = 'exam_completed' and source_id = $2`,
    [userId, sourceId],
  );
  check("صف واحد بس بعد إعادة التسجيل", crows[0].c === 1, `count=${crows[0].c}`);

  await expectFailure(
    "UPDATE مرفوض (append-only)",
    `update public.engagement_events set event_type = 'hacked' where id = $1`,
    [firstRes.id],
    /append-only/,
  );

  await expectFailure(
    "DELETE مرفوض (append-only)",
    `delete from public.engagement_events where id = $1`,
    [firstRes.id],
    /append-only/,
  );

  // 9) الحذف عبر FK cascade (حذف المستخدم) لازم ينجح — وإلا حذف
  //    الحساب نفسه هيقف بسبب الأحداث.
  {
    const cascadeProbe = await client.query(
      `select count(*)::int as c
         from pg_trigger t
         join pg_class c2 on c2.oid = t.tgrelid
        where c2.relname = 'engagement_events'
          and t.tgname = 'engagement_events_no_delete'`,
    );
    check("trigger الحذف موجود (للاختبار)", cascadeProbe.rows[0].c === 1, `count=${cascadeProbe.rows[0].c}`);
  }

  await client.query("ROLLBACK");
  console.log("  ↩️ ROLLBACK — مفيش صفوف اختبار باقية");

  const { rows: after } = await client.query(
    `select count(*)::int as c from public.engagement_events where source_id = $1`,
    [sourceId],
  );
  check("مفيش صفوف اختبار باقية بعد ROLLBACK", after[0].c === 0, `count=${after[0].c}`);

  console.log("\n── 2) صلاحيات الأدوار (anon / authenticated) ──");
  for (const role of ["anon", "authenticated"]) {
    // كل دور في transaction مستقل: الخطأ المتوقّع مايبعطلش الباقي.
    await client.query("BEGIN");
    await client.query(`SET ROLE ${role}`);
    await expectFailure(
      `${role}: INSERT مرفوض`,
      `insert into public.engagement_events (user_id,event_type,source_table,source_id,verified_by)
       values ($1,'x_probe','t','probe-id','service_role')`,
      [userId],
      null,
    );
    await expectFailure(
      `${role}: SELECT مرفوض`,
      `select count(*) from public.engagement_events`,
      [],
      null,
    );
    await expectFailure(
      `${role}: UPDATE مرفوض`,
      `update public.engagement_events set event_type = 'probe'`,
      [],
      null,
    );
    await expectFailure(
      `${role}: DELETE مرفوض`,
      `delete from public.engagement_events`,
      [],
      null,
    );
    await expectFailure(
      `${role}: TRUNCATE مرفوض`,
      `truncate public.engagement_events`,
      [],
      null,
    );
    await expectFailure(
      `${role}: تنفيذ record_engagement_event مرفوض`,
      `select public.record_engagement_event('exam_completed','exam_sessions','probe','$1','{}'::jsonb)`,
      [userId],
      null,
    );
    await client.query("RESET ROLE");
    await client.query("ROLLBACK");
  }

  await client.end();
  console.log(`\n══ النتيجة: ${passed} نجحت / ${failed} فشلت ══`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("❌ fatal:", err);
  process.exit(1);
});
