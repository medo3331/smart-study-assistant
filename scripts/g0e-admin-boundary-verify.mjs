/**
 * G0-E — Admin / Announcements boundary — DB verification (TRANSACTION ROLLBACK)
 *
 * ⚠️ قاعدة تشغيلية ثابتة (بعد حادثة G0-A):
 *   - ممنوع تنفيذ هذا السكريبت على قاعدة بيانات الإنتاج (fail-closed).
 *   - التنفيذ على Local/Staging فقط: G0E_DATABASE_URL=<local/staging>.
 *   - كل شيء داخل معاملة واحدة تنتهي بـROLLBACK.
 *
 * التغطية:
 *   ✔ anon/authenticated لا يستطيعون قراءة admin_announcements (إغلاق P0).
 *   ✔ anon/authenticated لا يستطيعون الكتابة في admin_announcements.
 *   ✔ مالك user_inbox يقرأ صفوفه فقط، ولا يرى صفوف مستخدم آخر.
 *   ✔ مالك user_inbox يحدّث is_read/read_at (التجربة المشروعة محفوظة).
 *   ✔ مالك user_inbox لا يستطيع تعديل subject/body/user_id (تقييد الأعمدة).
 *   ✔ لا يستطيع أي عميل INSERT/DELETE في user_inbox.
 *   ✔ email_deliveries محجوبة تمامًا عن العملاء.
 *   ✔ الكتابة عبر service_role تعمل (مسار البث الإداري غير مكسور).
 *
 * التشغيل: G0E_DATABASE_URL=<local/staging> node scripts/g0e-admin-boundary-verify.mjs
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
const dbUrl = process.env.G0E_DATABASE_URL ?? env.DATABASE_URL;
if (!dbUrl) {
  console.error("G0E_DATABASE_URL (أو DATABASE_URL) غير موجود — تحتاج قاعدة Local/Staging.");
  process.exit(2);
}

// ── حارس الإنتاج (fail-closed) ──────────────────────────────────────────────
if (dbUrl.includes(PRODUCTION_PROJECT_REF) || dbUrl.includes(`${PRODUCTION_PROJECT_REF}.supabase`)) {
  console.error(
    `❌ مرفوض: هذا السكريبت لا يعمل على الإنتاج (${PRODUCTION_PROJECT_REF}). ` +
      "مرّر G0E_DATABASE_URL لقاعدة Local/Staging.",
  );
  process.exit(2);
}
if (/pooler\.[a-z0-9]+\.supabase\.(co|com)/.test(dbUrl) && !process.env.G0E_ALLOW_SUPABASE) {
  console.error("❌ مرفوض: عناوين Supabase السحابية تحتاج G0E_ALLOW_SUPABASE=1 (Staging معتمد فقط).");
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
  const raw = readFileSync(join(root, "db", "64-admin-messaging-rls.sql"), "utf8");
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

  // ٢) مستخدمان تركيبيان + بيانات إدارية وبريد داخل المعاملة
  const uidA = (
    await client.query(
      `insert into auth.users (id, email, encrypted_password)
       values (gen_random_uuid(), 'g0e-userA@example.invalid', 'x') returning id`,
    )
  ).rows[0].id;
  const uidB = (
    await client.query(
      `insert into auth.users (id, email, encrypted_password)
       values (gen_random_uuid(), 'g0e-userB@example.invalid', 'x') returning id`,
    )
  ).rows[0].id;

  // إعلان إداري موجّه (كتابة postgres داخل المعاملة = محاكاة service write)
  const ann = (
    await client.query(
      `insert into public.admin_announcements (author_id, subject, body, audience, target_user_id)
       values (null, 'G0E secret subject', 'G0E secret body', 'user', $1) returning id`,
      [uidA],
    )
  ).rows[0].id;
  await client.query(
    `insert into public.user_inbox (user_id, announcement_id, subject, body)
     values ($1, $2, 'G0E msg A', 'body A'), ($3, $2, 'G0E msg B', 'body B')`,
    [uidA, ann, uidB],
  );
  await client.query(
    `insert into public.email_deliveries (announcement_id, user_id, status)
     values ($1, $2, 'pending')`,
    [ann, uidA],
  );

  // ٣) جلسة المستخدم A (authenticated)
  await client.query("savepoint sp_role");
  await client.query("set local role authenticated");
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uidA, role: "authenticated" }),
  ]);

  const denied = async (name, sqlText, params) => {
    await client.query("savepoint sp_neg");
    let rej = false;
    try {
      await client.query(sqlText, params);
    } catch {
      rej = true;
    }
    await client.query("rollback to savepoint sp_neg");
    check(name, rej);
  };
  const allowed = async (name, sqlText, params) => {
    try {
      await client.query(sqlText, params);
      check(name, true);
    } catch (e) {
      check(name, false, e.message.slice(0, 120));
    }
  };

  // admin_announcements: ممنوع تمامًا على العملاء (إغلاق P0)
  await denied(
    "anon/authenticated cannot SELECT admin_announcements (P0 closed)",
    `select subject from public.admin_announcements`,
  );
  await denied(
    "authenticated cannot INSERT admin_announcements",
    `insert into public.admin_announcements (subject, body) values ('x','y')`,
  );
  await denied(
    "authenticated cannot UPDATE admin_announcements",
    `update public.admin_announcements set subject='tampered' where id=$1`,
    [ann],
  );
  await denied(
    "authenticated cannot DELETE admin_announcements",
    `delete from public.admin_announcements where id=$1`,
    [ann],
  );

  // user_inbox: المالك يقرأ صفوفه فقط
  const own = await client.query(`select subject from public.user_inbox`);
  check(
    "owner reads only own inbox rows",
    own.rows.length === 1 && own.rows[0].subject === "G0E msg A",
    `got=${own.rows.length}`,
  );

  // التجربة المشروعة محفوظة: تعليم مقروء
  const ownRow = (await client.query(`select id from public.user_inbox limit 1`)).rows[0];
  await allowed(
    "owner CAN update is_read/read_at (legitimate action preserved)",
    `update public.user_inbox set is_read = true, read_at = now() where id = $1`,
    [ownRow.id],
  );

  // التلاعب بالأعمدة الأخرى ممنوع (تقييد الأعمدة)
  await denied(
    "owner CANNOT tamper with inbox body/subject (column-limited UPDATE)",
    `update public.user_inbox set subject = 'hacked', body = 'hacked' where id = $1`,
    [ownRow.id],
  );
  await denied(
    "owner CANNOT reassign inbox row to another user",
    `update public.user_inbox set user_id = $1 where id = $2`,
    [uidB, ownRow.id],
  );

  // لا إضافة/حذف من العميل
  await denied(
    "authenticated cannot INSERT into user_inbox",
    `insert into public.user_inbox (user_id, subject, body) values ($1, 'x', 'y')`,
    [uidA],
  );
  await denied(
    "authenticated cannot DELETE from user_inbox",
    `delete from public.user_inbox where id = $1`,
    [ownRow.id],
  );

  // email_deliveries: محجوبة تمامًا
  await denied(
    "authenticated cannot SELECT email_deliveries",
    `select status from public.email_deliveries`,
  );

  await client.query("rollback to savepoint sp_role");

  // ٤) مسار البث الإداري (service) غير مكسور
  const svc = await client.query(`select subject from public.admin_announcements where id = $1`, [ann]);
  check("service client (admin path) can still read admin_announcements", svc.rows.length === 1 && svc.rows[0].subject === "G0E secret subject");
  await allowed(
    "service client can still INSERT into user_inbox (broadcast path preserved)",
    `insert into public.user_inbox (user_id, subject, body) values ($1, 'svc', 'svc')`,
    [uidB],
  );

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
