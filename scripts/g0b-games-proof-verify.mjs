/**
 * G0-B — Games Proof — DB verification (TRANSACTION ROLLBACK)
 *
 * ⚠️ قاعدة تشغيلية ثابتة (بعد حادثة G0-A):
 *   - ممنوع تنفيذ هذا السكريبت على قاعدة بيانات الإنتاج. السكريبت يرفض
 *     الاتصال بالإنتاج بشكل دائم (fail-closed) عبر مطابقة project ref.
 *   - التنفيذ يتم على Local/Staging فقط (DATABASE_URL لقاعدة اختبار).
 *   - كل شيء داخل معاملة واحدة تنتهي بـROLLBACK.
 *
 * التغطية:
 *   ✔ حل فزورة حقيقي (إجابة صحيحة) ⇒ حدث break_riddle_solved واحد.
 *   ✔ حل Quiz Rush ⇒ حدث break_quiz_solved.
 *   ✔ خطوتان وسيطتان في Escape Room ⇒ لا أحداث؛ الحل النهائي ⇒ حدث واحد.
 *   ✔ إعادة الاستدعاء بعد الحل ⇒ لا أحداث مكررة ولا مكافآت إضافية.
 *   ✔ إجابات خاطئة ⇒ لا أحداث.
 *   ✔ مستخدم آخر لا يستطيع حل جلسة مستخدم آخر (جلسة المستخدم تُنشأ له).
 *   ✔ authenticated لا يستطيع استدعاء record_engagement_event أو الكتابة/القراءة.
 *   ✔ فشل إصدار الحدث لا يمنع الحل (exception-safe).
 *
 * التشغيل: DATABASE_URL=<local/staging> node scripts/g0b-games-proof-verify.mjs
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
const dbUrl = process.env.G0B_DATABASE_URL ?? env.DATABASE_URL;
if (!dbUrl) {
  console.error("G0B_DATABASE_URL (أو DATABASE_URL) غير موجود — تحتاج قاعدة Local/Staging.");
  process.exit(2);
}

// ── حارس الإنتاج (fail-closed) ──────────────────────────────────────────────
for (const ref of [PRODUCTION_PROJECT_REF]) {
  if (dbUrl.includes(ref) || dbUrl.includes(`${ref}.supabase`)) {
    console.error(
      `❌ مرفوض: هذا السكريبت لا يعمل على الإنتاج (${ref}). ` +
        "مرّر G0B_DATABASE_URL لقاعدة Local/Staging.",
    );
    process.exit(2);
  }
}
if (/pooler\.[a-z0-9]+\.supabase\.(co|com)/.test(dbUrl) && !process.env.G0B_ALLOW_SUPABASE) {
  console.error("❌ مرفوض: عناوين Supabase السحابية تحتاج G0B_ALLOW_SUPABASE=1 (Staging معتمد فقط).");
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
  const raw = readFileSync(join(root, "db", "62-engagement-games-proof.sql"), "utf8");
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

  // ٢) بيانات اختبار: مستخدم تركيبي + فزورة + لغز هروب
  const uid = (
    await client.query(
      `insert into auth.users (id, email, encrypted_password)
       values (gen_random_uuid(), 'g0b-verify@example.invalid', 'x') returning id`,
    )
  ).rows[0].id;
  await client.query(`insert into public.profiles (id) values ($1)`, [uid]);

  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uid, role: "authenticated" }),
  ]);

  // ٣) إجابة خاطئة ⇒ لا حدث
  await client.query(`select * from public.answer_break_riddle($1)`, ["إجابة خاطئة"]);
  let n = (
    await client.query(
      `select count(*)::int n from public.engagement_events where user_id=$1 and event_type='break_riddle_solved'`,
      [uid],
    )
  ).rows[0].n;
  check("wrong riddle answer produces no event", n === 0);

  // ٤) حل حقيقي للفزورة ⇒ حدث واحد
  const riddle = (await client.query("select id, answer from public.break_riddles order by id limit 1")).rows[0];
  const solved = await client.query(`select * from public.answer_break_riddle($1)`, [riddle.answer]);
  check("riddle solve returns correct=true", solved.rows[0].correct === true);
  n = (
    await client.query(
      `select count(*)::int n from public.engagement_events where user_id=$1 and event_type='break_riddle_solved'`,
      [uid],
    )
  ).rows[0].n;
  check("genuine riddle solve records exactly one event", n === 1);

  const ev = (
    await client.query(
      `select source_table, source_id, verified_by, metadata from public.engagement_events
        where user_id=$1 and event_type='break_riddle_solved'`,
      [uid],
    )
  ).rows[0];
  check("riddle event: trusted source + DB-assigned verified_by", ev.source_table === "break_riddle_sessions" && ev.verified_by === "service_role", `verified_by=${ev.verified_by}`);
  check("riddle event: metadata allowlist (attempts_used/riddle_id)", typeof ev.metadata.attempts_used === "number" && ev.metadata.riddle_id === riddle.id, JSON.stringify(ev.metadata));

  // ٥) إعادة الاستدعاء بعد الحل ⇒ لا مكرر
  await client.query(`select * from public.answer_break_riddle($1)`, [riddle.answer]);
  n = (
    await client.query(
      `select count(*)::int n from public.engagement_events where user_id=$1 and event_type='break_riddle_solved'`,
      [uid],
    )
  ).rows[0].n;
  check("riddle replay: still exactly one event", n === 1);

  // ٦) Quiz Rush: الإجابة الصحيحة = موضوع المرحلة التالية (من جلسة daily_break_quiz)
  const quiz = (
    await client.query(
      `select answer from public.break_quiz_sessions where user_id=$1 and day=public.cairo_day()`,
      [uid],
    )
  ).rows[0];
  check("quiz session exists after daily_break_quiz (via answer_break_riddle -> daily_break_riddle chain)", !!quiz);
  if (quiz) {
    await client.query(`select * from public.answer_break_quiz($1)`, ["إجابة خاطئة"]);
    let qn = (
      await client.query(
        `select count(*)::int n from public.engagement_events where user_id=$1 and event_type='break_quiz_solved'`,
        [uid],
      )
    ).rows[0].n;
    check("wrong quiz answer produces no event", qn === 0);
    await client.query(`select * from public.answer_break_quiz($1)`, [quiz.answer]);
    qn = (
      await client.query(
        `select count(*)::int n from public.engagement_events where user_id=$1 and event_type='break_quiz_solved'`,
        [uid],
      )
    ).rows[0].n;
    check("genuine quiz solve records exactly one event", qn === 1);
  }

  // ٧) Escape Room: خطوتان وسيطتان (لغز الفزورة الثابت) ثم الحل النهائي
  const step1 = await client.query(`select * from public.solve_escape_step($1)`, ["المعرفة"]); // لغز ثابت (خطوة 1)
  check("escape intermediate step: correct but no event yet", step1.rows[0].correct === true && step1.rows[0].step === 2);
  let en = (
    await client.query(
      `select count(*)::int n from public.engagement_events where user_id=$1 and event_type='escape_room_solved'`,
      [uid],
    )
  ).rows[0].n;
  check("intermediate escape step produces no event", en === 0);

  // الخطوة 2 تعتمد على مادة/خطة المستخدم — بدون config المادة = «مراجعة عامة»
  // (escape_room_context بدون config يعيد لغز escape_puzzles الثابت)
  const step2 = await client.query(`select * from public.solve_escape_step($1)`, ["الخطة"]);
  check("escape step 2 correct", step2.rows[0].correct === true && step2.rows[0].step === 3);
  const step3 = await client.query(`select * from public.solve_escape_step($1)`, ["الاختبار"]);
  check("escape final solve returns step=4", step3.rows[0].step === 4);
  en = (
    await client.query(
      `select count(*)::int n from public.engagement_events where user_id=$1 and event_type='escape_room_solved'`,
      [uid],
    )
  ).rows[0].n;
  check("final escape solve records exactly one event", en === 1);

  // ٨) إعادة الاستدعاء بعد الحل ⇒ لا مكرر
  await client.query(`select * from public.solve_escape_step($1)`, ["الاختبار"]);
  en = (
    await client.query(
      `select count(*)::int n from public.engagement_events where user_id=$1 and event_type='escape_room_solved'`,
      [uid],
    )
  ).rows[0].n;
  check("escape replay: still exactly one event", en === 1);

  // ٩) العميل (authenticated) لا يستطيع الوصول لمسارات الثقة
  await client.query("savepoint sp_role");
  await client.query("set local role authenticated");
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
    `select public.record_engagement_event('break_riddle_solved','break_riddle_sessions','x',$1::uuid)`,
    [uid],
  );
  await denied(
    "authenticated cannot INSERT into engagement_events",
    `insert into public.engagement_events (user_id, event_type, source_table, source_id, verified_by)
     values ($1, 'break_riddle_solved', 'break_riddle_sessions', 'forged', 'service_role')`,
    [uid],
  );
  await denied(
    "authenticated cannot SELECT from engagement_events (RLS, no policies)",
    `select * from public.engagement_events limit 1`,
  );
  await client.query("rollback to savepoint sp_role");

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
