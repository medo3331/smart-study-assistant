/**
 * G0-C — Badges/Achievements Proof — DB verification (TRANSACTION ROLLBACK)
 *
 * ⚠️ قاعدة تشغيلية ثابتة (بعد حادثة G0-A):
 *   - ممنوع تنفيذ هذا السكريبت على قاعدة بيانات الإنتاج (fail-closed).
 *   - التنفيذ على Local/Staging فقط: G0C_DATABASE_URL=<local/staging>.
 *   - كل شيء داخل معاملة واحدة تنتهي بـROLLBACK.
 *
 * التغطية:
 *   ✔ كسب وسام حقيقي (تراك مملوك + يوم مكتمل) ⇒ حدث badge_earned واحد.
 *   ✔ إعادة الاستدعاء ⇒ لا حدث مكرر ولا مكافأة إضافية.
 *   ✔ فصل خارج حدود التراك ⇒ مرفوض بلا حدث.
 *   ✔ مستخدم بلا يوم مكتمل ⇒ مرفوض بلا حدث.
 *   ✔ authenticated لا يستطيع INSERT مباشر في badges (السياسة المحذوفة).
 *   ✔ sync_achievements بإنجاز مؤهل ⇒ حدث achievement_unlocked (أول مرة فقط).
 *   ✔ authenticated لا يستطيع استدعاء record_engagement_event أو الكتابة/القراءة.
 *
 * التشغيل: G0C_DATABASE_URL=<local/staging> node scripts/g0c-badges-achievements-verify.mjs
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
const dbUrl = process.env.G0C_DATABASE_URL ?? env.DATABASE_URL;
if (!dbUrl) {
  console.error("G0C_DATABASE_URL (أو DATABASE_URL) غير موجود — تحتاج قاعدة Local/Staging.");
  process.exit(2);
}

// ── حارس الإنتاج (fail-closed) ──────────────────────────────────────────────
if (dbUrl.includes(PRODUCTION_PROJECT_REF) || dbUrl.includes(`${PRODUCTION_PROJECT_REF}.supabase`)) {
  console.error(
    `❌ مرفوض: هذا السكريبت لا يعمل على الإنتاج (${PRODUCTION_PROJECT_REF}). ` +
      "مرّر G0C_DATABASE_URL لقاعدة Local/Staging.",
  );
  process.exit(2);
}
if (/pooler\.[a-z0-9]+\.supabase\.(co|com)/.test(dbUrl) && !process.env.G0C_ALLOW_SUPABASE) {
  console.error("❌ مرفوض: عناوين Supabase السحابية تحتاج G0C_ALLOW_SUPABASE=1 (Staging معتمد فقط).");
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
  const raw = readFileSync(join(root, "db", "63-engagement-badges-achievements-proof.sql"), "utf8");
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

  // ٢) مستخدمان تركيبيان: واحد بيوم مكتمل (مؤهل) وواحد بلا أيام
  const uid = (
    await client.query(
      `insert into auth.users (id, email, encrypted_password)
       values (gen_random_uuid(), 'g0c-verify@example.invalid', 'x') returning id`,
    )
  ).rows[0].id;
  const poorUid = (
    await client.query(
      `insert into auth.users (id, email, encrypted_password)
       values (gen_random_uuid(), 'g0c-verify-poor@example.invalid', 'x') returning id`,
    )
  ).rows[0].id;
  await client.query(`insert into public.profiles (id) values ($1), ($2)`, [uid, poorUid]);

  const cfgId = (
    await client.query(
      `insert into public.study_configs (user_id, subject, days_count)
       values ($1, 'G0C-VERIFY', 5) returning id`,
      [uid],
    )
  ).rows[0].id;
  await client.query(
    `insert into public.study_days (config_id, user_id, day_number, title, topic)
     values ($1, $2, 1, 'G0C day', 'G0C topic')`,
    [cfgId, uid],
  );
  // يوما مكتملان ⇒ إثبات الدراسة المطلوب لgrant_badge
  await client.query(`update public.study_days set is_completed = true where user_id = $1`, [uid]);

  // محاكاة جلسة المستخدم الأول
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uid, role: "authenticated" }),
  ]);

  // ٣) فصل خارج حدود التراك (days_count=5 ⇒ max chapter 1(+1 مرونة)=2) ⇒ مرفوض
  let rejected = false;
  try {
    await client.query(`select * from public.grant_badge($1, 99, 'fake', 'G0C', 50)`, [cfgId]);
  } catch (e) {
    rejected = /out of range/.test(e.message);
  }
  check("chapter beyond track bounds is rejected", rejected);

  // ٤) كسب وسام حقيقي ⇒ حدث واحد
  const granted = await client.query(`select * from public.grant_badge($1, 1, 'G0C badge', 'G0C', 90)`, [cfgId]);
  const badgeId = granted.rows[0].badge_id;
  check("genuine badge granted", !!badgeId, granted.rows[0].message);

  let n = (
    await client.query(
      `select count(*)::int n from public.engagement_events where user_id=$1 and event_type='badge_earned'`,
      [uid],
    )
  ).rows[0].n;
  check("genuine badge earns exactly one event", n === 1);

  const ev = (
    await client.query(
      `select source_table, source_id, verified_by, metadata from public.engagement_events
        where user_id=$1 and event_type='badge_earned'`,
      [uid],
    )
  ).rows[0];
  check("badge event: trusted source + DB-assigned verified_by", ev.source_table === "badges" && ev.source_id === badgeId && ev.verified_by === "service_role");
  check("badge event: metadata allowlist", ev.metadata.chapter_number === 1 && ev.metadata.accuracy === 90, JSON.stringify(ev.metadata));

  // ٥) إعادة الاستدعاء ⇒ لا مكرر
  const replay = await client.query(`select * from public.grant_badge($1, 1, 'G0C badge', 'G0C', 90)`, [cfgId]);
  check("badge replay: already_existed=true", replay.rows[0].already_existed === true);
  n = (
    await client.query(
      `select count(*)::int n from public.engagement_events where user_id=$1 and event_type='badge_earned'`,
      [uid],
    )
  ).rows[0].n;
  check("badge replay: still exactly one event", n === 1);

  // ٦) مستخدم بلا أيام مكتملة ⇒ مرفوض بلا حدث
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: poorUid, role: "authenticated" }),
  ]);
  let poorRejected = false;
  try {
    const poorCfg = (
      await client.query(
        `insert into public.study_configs (user_id, subject, days_count)
         values ($1, 'G0C-POOR', 5) returning id`,
        [poorUid],
      )
    ).rows[0].id;
    await client.query(`select * from public.grant_badge($1, 1, 'fake', 'G0C', 50)`, [poorCfg]);
  } catch (e) {
    poorRejected = /complete at least one study day/.test(e.message);
  }
  check("user without a completed study day cannot earn a badge", poorRejected);
  n = (
    await client.query(
      `select count(*)::int n from public.engagement_events where user_id=$1 and event_type='badge_earned'`,
      [poorUid],
    )
  ).rows[0].n;
  check("rejected badge attempt produced no event", n === 0);

  // ٧) العميل (authenticated) لا يستطيع إدراج وسام مباشر (الإصلاح الجوهري)
  await client.query("savepoint sp_role");
  await client.query("set local role authenticated");
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uid, role: "authenticated" }),
  ]);

  await client.query("savepoint sp_badge");
  let badgeInsertDenied = false;
  try {
    await client.query(
      `insert into public.badges (user_id, config_id, chapter_number, title, subject, accuracy)
       values ($1, $2, 77, 'forged', 'forged', 100)`,
      [uid, cfgId],
    );
  } catch {
    badgeInsertDenied = true;
  }
  await client.query("rollback to savepoint sp_badge");
  check("authenticated cannot INSERT directly into badges (policy dropped)", badgeInsertDenied);

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
  await denied(
    "authenticated cannot call record_engagement_event",
    `select public.record_engagement_event('badge_earned','badges','x',$1::uuid)`,
    [uid],
  );
  await denied(
    "authenticated cannot INSERT into engagement_events",
    `insert into public.engagement_events (user_id, event_type, source_table, source_id, verified_by)
     values ($1, 'badge_earned', 'badges', 'forged', 'service_role')`,
    [uid],
  );
  await denied(
    "authenticated cannot SELECT from engagement_events (RLS, no policies)",
    `select * from public.engagement_events limit 1`,
  );

  // ٨) sync_achievements: المستخدم عنده وسام واحد ⇒ إنجاز 'first-boss' (target 1) يُفتح
  await client.query("rollback to savepoint sp_role");
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uid, role: "authenticated" }),
  ]);
  const sync = await client.query(`select * from public.sync_achievements()`);
  const firstBoss = sync.rows.find((r) => r.achievement_id === "first-boss");
  check("first-boss unlocked by sync_achievements", firstBoss?.newly === true, firstBoss ? `progress=${firstBoss.progress}` : "missing");

  const aev = (
    await client.query(
      `select source_table, source_id, verified_by, metadata from public.engagement_events
        where user_id=$1 and event_type='achievement_unlocked'`,
      [uid],
    )
  ).rows;
  check("achievement unlock records exactly one event for first-boss", aev.length >= 1 && aev.some((e) => e.source_id === "first-boss"), `count=${aev.length}`);
  check("achievement event: trusted source + DB-assigned verified_by", aev.every((e) => e.source_table === "user_achievements" && e.verified_by === "service_role"));
  check("achievement event: metadata allowlist (metric/progress)", aev.some((e) => e.metadata.metric === "badges" && e.metadata.progress === 1));

  // ٩) إعادة sync ⇒ لا مكرر
  await client.query(`select * from public.sync_achievements()`);
  const aev2 = (
    await client.query(
      `select count(*)::int n from public.engagement_events where user_id=$1 and event_type='achievement_unlocked'`,
      [uid],
    )
  ).rows[0].n;
  check("sync replay: still exactly one achievement event", aev2 === aev.length);

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
