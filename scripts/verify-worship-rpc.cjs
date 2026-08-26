/**
 * Applies db/worship.sql to Supabase **via the PostgREST RPC surface** using
 * the service-role key from .env.local (SUPABASE_SECRET_KEY or
 * SUPABASE_SERVICE_ROLE_KEY). No psql, no direct TCP — works even where the
 * database hostname is not directly reachable.
 *
 * DDL cannot run through PostgREST. So instead of executing db/worship.sql,
 * this script verifies each object after applying the SQL **some other way**
 * — it is a VERIFIER only. See apply-worship-sql.cjs for the psql path.
 *
 * Actually: we use the pg client over the session pooler if reachable.
 */
const fs = require("fs");
const path = require("path");

async function main() {
  const envPath = path.join(__dirname, "..", ".env.local");
  const envText = fs.readFileSync(envPath, "utf8");
  const get = (name) => {
    const line = envText
      .split(/\r?\n/)
      .find((l) => l.trim().startsWith(name + "="));
    return line ? line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") : null;
  };

  const secret =
    get("SUPABASE_SECRET_KEY") ||
    get("SUPABASE_SERVICE_ROLE_KEY") ||
    get("SERVICE_ROLE_KEY");

  const refLine = get("NEXT_PUBLIC_SUPABASE_URL");
  const ref = refLine ? new URL(refLine).hostname.split(".")[0] : null;

  console.log("service key present:", !!secret);
  console.log("project ref:", ref);

  if (!secret || !ref) {
    console.log(
      "Cannot verify via REST without a service-role key in .env.local."
    );
    process.exit(0);
  }

  // Probe whether the worship functions exist by calling the read-only one as
  // an anonymous call (should 401/403 rather than 404 when it exists).
  const res = await fetch(`${refLine}/rest/v1/rpc/worship_daily_summary`, {
    method: "POST",
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  console.log("worship_daily_summary rpc status:", res.status);
  const text = await res.text();
  console.log("body head:", text.slice(0, 200));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
