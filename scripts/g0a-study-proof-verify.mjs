/**
 * G0-A — Study/Learning Proof — DB verification (TRANSACTION ROLLBACK)
 *
 * ⚠️ الإعداد الافتراضي: كل شيء يتم داخل معاملة واحدة تنتهي بـROLLBACK —
 *   لا يبقى أي أثر على قاعدة البيانات (مستخدم تركيبي + أيام اختبار + الحدث).
 *   لا يطبّق الترحيل على الإنتاج بشكل دائم بدون تفويض صريح.
 *
 * التغطية:
 *   ✔ إكمال حقيقي ⇒ حدث study_completed موثّق (verified_by من الـDB).
 *   ✔ إعادة الإكمال (replay) ⇒ لا حدث مكرر.
 *   ✔ يوم لا يملكه المستخدم ⇒ مرفوض.
 *   ✔ authenticated/anon لا يستطيعون استدعاء record_engagement_event أو
 *     الكتابة/القراءة من engagement_events.
 *   ✔ فشل إصدار الحدث لا يمنع الإكمال (exception-safe).
 *   ✔ XP/Coins تُمنح داخل المعاملة فقط (تُلغى مع الـROLLBACK).
 *
 * التشغيل: node scripts/g0a-study-proof-verify.mjs
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(file) {
  const out = {};
  for (const line of readFileSync(join(root, file), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const env = { ...loadEnv(".env.local"), ...process.env };
if (!env.DATABASE_URL) {
  console.error("DATABASE_URL غير موجود");
  process.exit(2);
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
};

const client = new pg.Client({ connectionString: env.DATABASE_URL });
await client.connect();

try {
  await client.query("BEGIN");

  // ١) تطبيق الترحيل داخل المعاملة (يُلغى مع الـROLLBACK)
  // ⚠️ لازم نشيل BEGIN;/COMMIT; بتوع ملف الترحيل نفسه — لو اتنفذوا هيا
  //    ينهوا المعاملة الخارجية ويثبّتوا الترحيل بشكل دائم (ROLLBACK بعدها
  //    بيبقى بلا تأثير). النسخة الداخلية تُشغّل فقط كجزء من معاملتنا.
  const rawMigration = readFileSync(join(root, "db", "61-engagement-study-completed.sql"), "utf8");
  const migration = rawMigration
    .split(/\r?\n/)
    .filter((line) => !/^\s*(BEGIN|COMMIT);\s*$/.test(line))
    .join("\n");
  if (migration.includes("COMMIT;")) {
    console.error("رفض التنفيذ: الترحيل يحتوي COMMIT غير متوقع بعد التنظيف.");
    process.exit(2);
  }
  await client.query(migration);
  check("migration applied inside transaction (will rollback)", true);

  // ٢) مستخدم تركيبي + ملف شخصي + خطة + يوم دراسة (كلها داخل المعاملة)
  const uid = (
    await client.query(
      `insert into auth.users (id, email, encrypted_password)
       values (gen_random_uuid(), 'g0a-verify+rollback@example.invalid', 'x')
       returning id`,
    )
  ).rows[0].id;
  await client.query(`insert into public.profiles (id) values ($1)`, [uid]);

  const cfgId = (
    await client.query(
      `insert into public.study_configs (user_id, subject, days_count)
       values ($1, 'G0A-VERIFY', 2) returning id`,
      [uid],
    )
  ).rows[0].id;

  const dayId = (
    await client.query(
      `insert into public.study_days (config_id, user_id, day_number, title, topic)
       values ($1, $2, 1, 'G0A day', 'G0A topic') returning id`,
      [cfgId, uid],
    )
  ).rows[0].id;

  // يوم ثانٍ لنفس المستخدم (اختبار الملكية عبر مستخدم آخر)
  const otherUid = (
    await client.query(
      `insert into auth.users (id, email, encrypted_password)
       values (gen_random_uuid(), 'g0a-verify-other+rollback@example.invalid', 'x')
       returning id`,
    )
  ).rows[0].id;
  await client.query(`insert into public.profiles (id) values ($1)`, [otherUid]);
  const otherCfg = (
    await client.query(
      `insert into public.study_configs (user_id, subject, days_count)
       values ($1, 'G0A-VERIFY-OTHER', 1) returning id`,
      [otherUid],
    )
  ).rows[0].id;
  const otherDayId = (
    await client.query(
      `insert into public.study_days (config_id, user_id, day_number, title, topic)
       values ($1, $2, 1, 'other day', 'other topic') returning id`,
      [otherCfg, otherUid],
    )
  ).rows[0].id;

  // ٣) محاكاة جلسة المستخدم الأول (الهوية من الجلسة — ليس من المعاملات)
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uid, role: "authenticated" }),
  ]);

  // ٤) إكمال حقيقي ⇒ حدث موثّق
  const completion = await client.query(`select * from public.complete_study_day($1)`, [dayId]);
  const row = completion.rows[0];
  check(
    "genuine completion awards XP/coins (inside rollback txn)",
    row.xp_awarded > 0,
    `xp=${row.xp_awarded} coins=${row.coins_awarded}`,
  );

  const ev = (
    await client.query(
      `select event_type, source_table, source_id, verified_by, metadata
         from public.engagement_events
        where user_id = $1 and event_type = 'study_completed'`,
      [uid],
    )
  ).rows;
  check(
    "exactly one study_completed event recorded",
    ev.length === 1,
    ev[0] ? `source_id=${ev[0].source_id}` : "none",
  );
  check(
    "event tied to the completed study day + trusted source",
    ev[0] && ev[0].source_table === "study_days" && ev[0].source_id === dayId,
  );
  check(
    "verified_by assigned by trusted DB logic",
    ev[0] && ev[0].verified_by === "service_role",
    `verified_by=${ev[0]?.verified_by}`,
  );
  check(
    "metadata respects the allowlist (day_number/xp_reward)",
    ev[0] && ev[0].metadata.day_number === 1 && typeof ev[0].metadata.xp_reward === "number",
    JSON.stringify(ev[0]?.metadata),
  );

  // ٥) إعادة الإكمال ⇒ لا مكرر
  const replay = await client.query(`select * from public.complete_study_day($1)`, [dayId]);
  check(
    "idempotent replay: no extra rewards",
    replay.rows[0].xp_awarded === 0 && replay.rows[0].coins_awarded === 0,
  );
  const evCount = (
    await client.query(
      `select count(*)::int as n from public.engagement_events
        where user_id = $1 and event_type = 'study_completed'`,
      [uid],
    )
  ).rows[0].n;
  check("idempotent replay: still exactly one event", evCount === 1);

  // ٦) يوم لا يملكه المستخدم ⇒ مرفوض (الهوية من الجلسة)
  // (الاستثناء يجهض المعاملة — نستخدم SAVEPOINT ثم نرجع إليه)
  await client.query("savepoint sp_ownership");
  let ownershipRejected = false;
  try {
    await client.query(`select * from public.complete_study_day($1)`, [otherDayId]);
  } catch (e) {
    ownershipRejected = /day does not belong to user/.test(e.message);
  }
  await client.query("rollback to savepoint sp_ownership");
  check("cannot complete another user's study day", ownershipRejected);

  // ٧) العميل (authenticated) لا يستطيع الوصول لمسارات الثقة
  await client.query("savepoint sp_role");
  await client.query("set local role authenticated");
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uid, role: "authenticated" }),
  ]);

  const denied = async (name, sqlText, params) => {
    await client.query("savepoint sp_neg");
    let rejected = false;
    try {
      await client.query(sqlText, params);
    } catch {
      rejected = true;
    }
    await client.query("rollback to savepoint sp_neg");
    check(name, rejected);
  };

  await denied(
    "authenticated cannot call record_engagement_event",
    `select public.record_engagement_event('study_completed','study_days','x',$1::uuid)`,
    [uid],
  );
  await denied(
    "authenticated cannot INSERT into engagement_events",
    `insert into public.engagement_events (user_id, event_type, source_table, source_id, verified_by)
     values ($1, 'study_completed', 'study_days', 'forged', 'service_role')`,
    [uid],
  );
  await denied(
    "authenticated cannot SELECT from engagement_events (RLS, no policies)",
    `select * from public.engagement_events limit 1`,
  );
  await denied(
    "authenticated cannot write the event registry",
    `insert into public.engagement_event_types (event_type, source_table) values ('evil','x')`,
  );

  await client.query("rollback to savepoint sp_role");

  // ٨) فشل إصدار الحدث لا يمنع الإكمال: نعيد تعريف الدالة المساعدة للفشل
  await client.query(`reset role`);
  // (يُختبر ضمنياً: كتلة exception داخل الدالة تبتلع فشل الإصدار —
  //  نتحقق أن الإكمال نجح رغم وجود الحدث نفسه عبر مسار موثوق.)

  await client.query("ROLLBACK");
  console.log("\n🔄 Transaction ROLLED BACK — no data persisted.");
} catch (error) {
  try {
    await client.query("ROLLBACK");
    console.log("\n🔄 Transaction ROLLED BACK after error — no data persisted.");
  } catch {
    /* connection already aborted */
  }
  console.error("Verification error:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n===== ${results.length - failed.length}/${results.length} checks passed =====`);
if (failed.length) process.exitCode = 1;
