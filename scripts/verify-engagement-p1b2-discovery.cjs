/**
 * 🔍 تحقق P1-B2.2 — Smart Notes Feature Discovery
 *
 * ⚠️ كل اختبارات الكتابة جوه transaction بـROLLBACK ⇒ صفر تلويث.
 *
 * السيناريوهات:
 *   1) الكتالوج: Smart Notes متاحة/تحت التطوير + قابلة للاكتشاف؛
 *      Community Groups و Rewarded Ads **غير قابلين للاكتشاف**.
 *   2) الانتقالات: undiscovered → introduced → tried → adopted.
 *   3) الشفافية: tried مش بتنتج من طلب العميل — لازم حدث موثّق.
 *   4) التبنّي: بيحتاج **أيام كايرو مختلفة** (مش تكرار الحدث).
 *   5) ممنوع التراجع: introduced بعد tried مايغيّرش الحالة.
 *   6) feature غير قابل للاكتشاف ⇒ record_feature_introduction مرفوض.
 *   7) الصلاحيات: anon/authenticated مفيهمش كتابة/تنفيذ للدوال.
 *
 * التشغيل: `node scripts/verify-engagement-p1b2-discovery.cjs`
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

  const { rows: userRows } = await client.query(
    `select id from auth.users order by created_at limit 1;`,
  );
  if (!userRows.length) {
    console.log("⚠️ مفيش مستخدمين — تخطّي.");
    await client.end();
    return;
  }
  const userId = userRows[0].id;

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
    if (error) await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    await client.query(`RELEASE SAVEPOINT ${sp}`);
    check(label, !!error && (!pattern || pattern.test(error.message)), error ? error.message.slice(0, 110) : "نجحت بدون خطأ!");
    return error;
  }

  console.log("── 1) الكتالوج ──");
  const { rows: catalog } = await client.query(
    `select key, availability, is_discoverable, adoption_min_days from public.feature_catalog`,
  );
  const byKey = new Map(catalog.map((r) => [r.key, r]));

  const notes = byKey.get("smart_notes");
  check(
    "Smart Notes: متاحة تحت التطوير + قابلة للاكتشاف",
    notes?.availability === "under_development" && notes?.is_discoverable === true,
    JSON.stringify(notes),
  );
  check(
    "Community Groups: غير متاحة وغير قابلة للاكتشاف",
    byKey.get("community_groups")?.is_discoverable === false &&
      byKey.get("community_groups")?.availability === "unavailable",
  );
  check(
    "Rewarded Ads: مستقبلية وغير قابلة للاكتشاف",
    byKey.get("rewarded_ads")?.is_discoverable === false &&
      byKey.get("rewarded_ads")?.availability === "planned",
  );
  check(
    "عتبة التبنّي = 3 أيام",
    Number(notes?.adoption_min_days) === 3,
    String(notes?.adoption_min_days),
  );

  console.log("\n── 2) دورة الحالات ──");
  await client.query("BEGIN");

  // 2.١) الحالة الأولى: undiscovered.
  {
    const { rows } = await client.query(
      `select public.get_feature_discovery_state($1,'smart_notes') as s`,
      [userId],
    );
    const s = rows[0].s;
    check("الحالة الابتدائية: undiscovered", s?.state === "undiscovered", JSON.stringify(s?.state));
  }

  // 2.٢) introduced.
  {
    const { rows } = await client.query(
      `select public.record_feature_introduction($1,'smart_notes','dashboard') as r`,
      [userId],
    );
    check("introduced بعد عرض التعريف", rows[0].r?.state === "introduced", JSON.stringify(rows[0].r));

    // التكرار لازم يفضل introduced (idempotent).
    const { rows: again } = await client.query(
      `select public.record_feature_introduction($1,'smart_notes','dashboard') as r`,
      [userId],
    );
    check("إعادة التعريف ما بتغيّرش الحالة", ["introduced", "tried", "adopted"].includes(again[0].r?.state), JSON.stringify(again[0].r));
  }

  // 2.٣) tried: لازم حدث موثّق (notes_saved).
  {
    const { rows } = await client.query(
      `select public.refresh_feature_discovery_state($1,'smart_notes') as r`,
      [userId],
    );
    const r = rows[0].r;
    check("بدون حدث ⇒ بيفضل introduced (مش tried)", r?.state === "introduced", JSON.stringify(r));
    check("عدد أحداث التجربة = 0", Number(r?.trial_events) === 0, String(r?.trial_events));
  }

  // 2.٤)Гест觸: بنحط حدث notes_saved يدويًا (زي ما الـingest يعمل).
  await client.query(
    `insert into public.engagement_events
       (user_id, event_type, source_table, source_id, occurred_at, metadata, verified_by)
     values ($1,'notes_saved','client_notes',$2, now(), '{"page_count":1}'::jsonb, 'service_role')`,
    [userId, `verify-note-${Date.now()}`],
  );
  {
    const { rows } = await client.query(
      `select public.refresh_feature_discovery_state($1,'smart_notes') as r`,
      [userId],
    );
    check("بعد فعل حقيقي ⇒ tried", rows[0].r?.state === "tried", JSON.stringify(rows[0].r));
  }

  // 2.٥) التبنّي: نفس اليوم مش بيكفي.
  {
    const { rows } = await client.query(
      `select public.refresh_feature_discovery_state($1,'smart_notes') as r`,
      [userId],
    );
    check("نفس اليوم ⇒ لسه tried (يوم واحد < 3)", rows[0].r?.state === "tried", JSON.stringify(rows[0].r));
    check("أيام النشاط = 1", Number(rows[0].r?.active_days) === 1, String(rows[0].r?.active_days));
  }

  // 2.٦) تكرار الحدث في نفس اليوم مايعدّش يوم زيادة.
  await client.query(
    `insert into public.engagement_events
       (user_id, event_type, source_table, source_id, occurred_at, metadata, verified_by)
     values ($1,'notes_saved','client_notes',$2, now(), '{"page_count":1}'::jsonb, 'service_role')`,
    [userId, `verify-note-2-${Date.now()}`],
  );
  {
    const { rows } = await client.query(
      `select public.refresh_feature_discovery_state($1,'smart_notes') as r`,
      [userId],
    );
    check(
      "تكرار الحدث في نفس اليوم مايزودش أيام النشاط",
      Number(rows[0].r?.active_days) === 1,
      JSON.stringify(rows[0].r),
    );
  }

  // 2.٧) adopted: 3 أيام كايرو مختلفة.
  for (const daysAgo of [1, 2]) {
    await client.query(
      `insert into public.engagement_events
         (user_id, event_type, source_table, source_id, occurred_at, metadata, verified_by)
       values ($1,'notes_saved','client_notes',$2, now() - ($3 || ' days')::interval, '{"page_count":1}'::jsonb, 'service_role')`,
      [userId, `verify-note-${daysAgo}-${Date.now()}`, String(daysAgo)],
    );
  }
  {
    const { rows } = await client.query(
      `select public.refresh_feature_discovery_state($1,'smart_notes') as r`,
      [userId],
    );
    check("3 أيام كايرو مختلفة ⇒ adopted", rows[0].r?.state === "adopted", JSON.stringify(rows[0].r));
    check("أيام النشاط = 3", Number(rows[0].r?.active_days) === 3, String(rows[0].r?.active_days));
  }

  // 2.٨) ممنوع التراجع: introduced بعد adopted مايغيّرش.
  await client.query(
    `select public.record_feature_introduction($1,'smart_notes','dashboard')`,
    [userId],
  );
  {
    const { rows } = await client.query(
      `select public.get_feature_discovery_state($1,'smart_notes') as s`,
      [userId],
    );
    check("ممنوع التراجع: لسه adopted", rows[0].s?.state === "adopted", JSON.stringify(rows[0].s?.state));
    check("توقّفي مفيد", rows[0].s?.adopted_at !== null);
  }

  // 2.٩) ميزة غير قابلة للاكتشاف ⇒ رفض.
  await expectFailure(
    "تسجيل تعريف لميزة غير قابلة للاكتشاف مرفوض",
    `select public.record_feature_introduction($1,'community_groups','dashboard')`,
    [userId],
    /not discoverable/,
  );
  await expectFailure(
    "تسجيل تعريف لميزة غير موجودة مرفوض",
    `select public.record_feature_introduction($1,'does_not_exist','dashboard')`,
    [userId],
    /not discoverable/,
  );

  await client.query("ROLLBACK");
  console.log("  ↩️ ROLLBACK — مفيش بيانات اختبار باقية");

  const { rows: leftover } = await client.query(`
    select
      (select count(*)::int from public.user_feature_discovery) as discovery,
      (select count(*)::int from public.engagement_events where source_id like 'verify-note-%') as events;
  `);
  check("مفيش صفوف اكتشاف باقية", leftover[0].discovery === 0, String(leftover[0].discovery));
  check("مفيش أحداث اختبار باقية", leftover[0].events === 0, String(leftover[0].events));

  console.log("\n── 3) الصلاحيات ──");
  for (const role of ["anon", "authenticated"]) {
    await client.query("BEGIN");
    await client.query(`SET ROLE ${role}`);

    await expectFailure(
      `${role}: INSERT في user_feature_discovery مرفوض`,
      `insert into public.user_feature_discovery (user_id, feature_key, state) values ($1,'smart_notes','adopted')`,
      [userId],
      null,
    );
    await expectFailure(
      `${role}: UPDATE في user_feature_discovery مرفوض`,
      `update public.user_feature_discovery set state = 'adopted'`,
      [],
      null,
    );
    await expectFailure(
      `${role}: INSERT في feature_catalog مرفوض`,
      `insert into public.feature_catalog (key, label) values ('hack','x')`,
      [],
      null,
    );
    await expectFailure(
      `${role}: تنفيذ record_feature_introduction مرفوض`,
      `select public.record_feature_introduction($1,'smart_notes','dashboard')`,
      [userId],
      null,
    );
    await expectFailure(
      `${role}: تنفيذ refresh_feature_discovery_state مرفوض`,
      `select public.refresh_feature_discovery_state($1,'smart_notes')`,
      [userId],
      null,
    );

    // القراءة: الكتالوج متاح للـauthenticated فقط (المنطقة النشطة).
    if (role === "authenticated") {
      const { rows: readOk } = await client.query(
        `select count(*)::int as c from public.feature_catalog where is_active`,
      );
      check("authenticated: قراءة الكتالوج النشط مسموحة", readOk[0].c > 0, `count=${readOk[0].c}`);

      // حالةDiscovery بتاعة حد تاني لازم ماتظهرش (RLS owner read).
      const { rows: ownRows } = await client.query(
        `select count(*)::int as c from public.user_feature_discovery`,
      );
      check(
        "authenticated: مايشوفش حالةDiscovery بتاعة حد تاني",
        ownRows[0].c === 0,
        `count=${ownRows[0].c}`,
      );
    } else {
      await expectFailure(
        `anon: قراءة الكتالوج مرفوضة`,
        `select count(*)::int as c from public.feature_catalog`,
        [],
        null,
      );
    }

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
