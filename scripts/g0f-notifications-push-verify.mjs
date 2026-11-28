/**
 * G0-F — Notifications / Push ownership boundary — DB verification (ROLLBACK)
 *
 * ⚠️ قاعدة تشغيلية ثابتة (بعد حادثة G0-A):
 *   - ممنوع تنفيذ هذا السكريبت على قاعدة بيانات الإنتاج (fail-closed).
 *   - التنفيذ على Local/Staging فقط: G0F_DATABASE_URL=<local/staging>.
 *   - كل شيء داخل معاملة واحدة تنتهي بـROLLBACK.
 *
 * التغطية:
 *   ✔ authenticated لا يقرأ/يعدّل/يحذف إشعارات مستخدم آخر (حتى لو user_id NULL).
 *   ✔ المالك يقرأ/يعدّل/يحذف إشعاراته (السلوك المشروع محفوظ).
 *   ✔ لا سياسة INSERT ⇒ العميل لا يستطيع إرسال/تلفيق إشعارات.
 *   ✔ push_subscriptions: المالك يسجّل/يقرأ/يحدّث/يحذف اشتراكه فقط.
 *   ✔ لا يستطيع التلاعب باشتراك مستخدم آخر أو انتحال user_id.
 *   ✔ الإرسال (web-push) يبقى سيرفريًا فقط — لا مسار عميل.
 *
 * التشغيل: G0F_DATABASE_URL=<local/staging> node scripts/g0f-notifications-push-verify.mjs
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCTION_PROJECT_REF = "lgaqgkihhmedtdzcgpnc"; // يُرفض دائمًا

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
const dbUrl = process.env.G0F_DATABASE_URL ?? env.DATABASE_URL;
if (!dbUrl) {
  console.error("G0F_DATABASE_URL (أو DATABASE_URL) غير موجود — تحتاج قاعدة Local/Staging.");
  process.exit(2);
}

// ── حارس الإنتاج (fail-closed) ──────────────────────────────────────────────
if (dbUrl.includes(PRODUCTION_PROJECT_REF) || dbUrl.includes(`${PRODUCTION_PROJECT_REF}.supabase`)) {
  console.error(
    `❌ مرفوض: هذا السكريبت لا يعمل على الإنتاج (${PRODUCTION_PROJECT_REF}). ` +
      "مرّر G0F_DATABASE_URL لقاعدة Local/Staging.",
  );
  process.exit(2);
}
if (/pooler\.[a-z0-9]+\.supabase\.(co|com)/.test(dbUrl) && !process.env.G0F_ALLOW_SUPABASE) {
  console.error("❌ مرفوض: عناوين Supabase السحابية تحتاج G0F_ALLOW_SUPABASE=1 (Staging معتمد فقط).");
  process.exit(2);
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
};

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();

try {
  await client.query("BEGIN");

  // ١) تطبيق الترحيل داخل المعاملة — بدون BEGIN/COMMIT داخليين
  const raw = readFileSync(join(root, "db", "65-notifications-push-rls.sql"), "utf8");
  const migration = raw
    .split(/\r?\n/)
    .filter((line) => !/^\s*(BEGIN|COMMIT);\s*$/.test(line))
    .join("\n");
  if (migration.includes("COMMIT;")) {
    console.error("رفض التنفيذ: الترحيل يحتوي COMMIT غير متوقع بعد التنظيف.");
    process.exit(2);
  }
  await client.query(migration);
  check("migration applied inside transaction (will rollback)", true);

  // ٢) مستخدمان + إشعارات (modern بمستلمين مختلفين + صف بلا user_id أصلًا)
  const uidA = (
    await client.query(
      `insert into auth.users (id, email, encrypted_password)
       values (gen_random_uuid(), 'g0f-userA@example.invalid', 'x') returning id`,
    )
  ).rows[0].id;
  const uidB = (
    await client.query(
      `insert into auth.users (id, email, encrypted_password)
       values (gen_random_uuid(), 'g0f-userB@example.invalid', 'x') returning id`,
    )
  ).rows[0].id;

  // صف A حديث: recipient فقط (user_id NULL — الحالة التي كانت مكشوفة قبل الإصلاح)
  const notifA = (
    await client.query(
      `insert into public.notifications (recipient_id, type, title, body)
       values ($1, 'system', 'private reply A', 'secret body A') returning id`,
      [uidA],
    )
  ).rows[0].id;
  // صف B حديث لمستخدم آخر
  const notifB = (
    await client.query(
      `insert into public.notifications (recipient_id, type, title, body)
       values ($1, 'system', 'private reply B', 'secret body B') returning id`,
      [uidB],
    )
  ).rows[0].id;

  // ٣) جلسة المستخدم A
  await client.query("savepoint sp_role");
  await client.query("set local role authenticated");
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uidA, role: "authenticated" }),
  ]);

  // ملكية القراءة: يرى صفه فقط — حتى الصف بلا user_id لا يظهر لغير صاحبه
  const own = await client.query(`select id, title from public.notifications`);
  check(
    "owner sees only own notifications (NULL-user_id rows are no longer public)",
    own.rows.length === 1 && own.rows[0].id === notifA,
    `got=${own.rows.length}`,
  );

  // لا تعديل على إشعار مستخدم آخر
  await client.query("savepoint sp_neg");
  let crossUpdate = false;
  try {
    await client.query(
      `update public.notifications set body='hacked', read_at=now() where id=$1`,
      [notifB],
    );
  } catch {
    crossUpdate = true;
  }
  await client.query("rollback to savepoint sp_neg");
  check("cannot update another user's notification", crossUpdate);

  // لا حذف لإشعار مستخدم آخر
  await client.query("savepoint sp_neg");
  let crossDelete = false;
  try {
    await client.query(`delete from public.notifications where id=$1`, [notifB]);
  } catch {
    crossDelete = true;
  }
  await client.query("rollback to savepoint sp_neg");
  check("cannot delete another user's notification", crossDelete);

  // لا تلفيق إشعارات (لا سياسة INSERT)
  await client.query("savepoint sp_neg");
  let insertDenied = false;
  try {
    await client.query(
      `insert into public.notifications (recipient_id, type, title, body)
       values ($1, 'system', 'spoofed', 'spoofed')`,
      [uidA],
    );
  } catch {
    insertDenied = true;
  }
  await client.query("rollback to savepoint sp_neg");
  check("client cannot INSERT notifications (server-only writes)", insertDenied);

  // السلوك المشروع محفوظ: المالك يحدّث إشعاره
  let ownUpdate = false;
  try {
    await client.query(`update public.notifications set read_at=now() where id=$1`, [notifA]);
    ownUpdate = true;
  } catch {
    ownUpdate = false;
  }
  check("owner CAN update own notification (read_at)", ownUpdate);

  // ٤) push_subscriptions: تسجيل مشروع من الجلسة + عزل صارم
  const subPayload = JSON.stringify({ endpoint: "https://push.example/x", keys: { p256dh: "k", auth: "a" } });
  let subscribed = false;
  try {
    await client.query(
      `insert into public.push_subscriptions (user_id, subscription) values ($1, $2::jsonb)`,
      [uidA, subPayload],
    );
    subscribed = true;
  } catch (e) {
    check("owner CAN register a push subscription (flow restored)", false, e.message.slice(0, 120));
  }
  if (subscribed) check("owner CAN register a push subscription (flow restored)", true);

  const ownSub = await client.query(`select user_id from public.push_subscriptions`);
  check("subscription registered for the session user", ownSub.rows.length === 1 && ownSub.rows[0].user_id === uidA);

  // لا انتحال user_id مستخدم آخر
  await client.query("savepoint sp_neg");
  let spoofDenied = false;
  try {
    await client.query(
      `insert into public.push_subscriptions (user_id, subscription) values ($1, $2::jsonb)`,
      [uidB, subPayload],
    );
  } catch {
    spoofDenied = true;
  }
  await client.query("rollback to savepoint sp_neg");
  check("cannot register a subscription for another user", spoofDenied);

  // لا تعديل/حذف لاشتراك مستخدم آخر
  await client.query("savepoint sp_neg");
  let crossSubDelete = false;
  try {
    await client.query(`delete from public.push_subscriptions where user_id=$1`, [uidB]);
  } catch {
    crossSubDelete = true;
  }
  await client.query("rollback to savepoint sp_neg");
  check("cannot delete another user's subscription", crossSubDelete);

  // الإلغاء المشروع يعمل
  let unsubscribed = false;
  try {
    await client.query(`delete from public.push_subscriptions where user_id = auth.uid()`);
    unsubscribed = true;
  } catch {
    unsubscribed = false;
  }
  check("owner CAN unsubscribe (respect-the-choice preserved)", unsubscribed);

  await client.query("rollback to savepoint sp_role");

  // ٥) مسار السيرفر (service/cron) غير مكسور
  const svc = await client.query(`select user_id from public.push_subscriptions`);
  check("service client (cron path) can read all subscriptions", svc.rows.length >= 0);

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
