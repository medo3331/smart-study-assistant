/**
 * Applies db/40-fix-consume-service-quota.sql to the Supabase Postgres
 * instance via DATABASE_URL.
 *
 * Idempotent. Verifies by actually CALLING the RPC (that's the real test —
 * it was broken and only a real call proves the fix).
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
    console.error("DATABASE_URL missing from .env.local");
    process.exit(2);
  }
  const url = line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  if (!/^postgres(ql)?:\/\//.test(url)) {
    console.error("DATABASE_URL is not a postgres:// URL");
    process.exit(2);
  }
  const sqlPath = path.join(
    __dirname,
    "..",
    "db",
    "40-fix-consume-service-quota.sql",
  );
  const sql = fs.readFileSync(sqlPath, "utf8");

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log("connected");

  try {
    await client.query(sql);
    console.log("40-fix-consume-service-quota.sql applied OK");
  } catch (err) {
    console.error("APPLY FAILED:", err.message);
    await client.end();
    process.exit(1);
  }

  // Verify — بنندعو الـ RPC فعلاً (هي اللي كانت مكسورة).
  const probeUser = "00000000-0000-0000-0000-000000000001";
  try {
    const r = await client.query(
      "select * from public.consume_service_quota($1::uuid, $2::text, $3::int)",
      [probeUser, "__apply_probe__", 5],
    );
    console.log("probe row:", JSON.stringify(r.rows[0]));
    const r2 = await client.query(
      "select * from public.consume_service_quota($1::uuid, $2::text, $3::int)",
      [probeUser, "__apply_probe__", 5],
    );
    console.log("probe row 2:", JSON.stringify(r2.rows[0]));
    // تنظيف صفّ العدّاد
    await client.query(
      "delete from public.ai_service_usage_daily where user_id = $1::uuid and service = $2",
      [probeUser, "__apply_probe__"],
    );
    console.log("probe row cleaned");
  } catch (err) {
    console.error("VERIFY FAILED — the RPC still errors:", err.message);
    await client.end();
    process.exit(1);
  }

  await client.end();
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
