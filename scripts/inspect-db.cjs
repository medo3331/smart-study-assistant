/**
 * PART 1-4: read-only inspection of the live database via PostgREST
 * OpenAPI surface + RPC probes. No service credentials used or printed.
 */
const fs = require("fs");
const path = require("path");
const env = {};
for (const line of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
  if (m) env[m[1]] = m[2];
}
const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: ANON, Authorization: "Bearer " + ANON };

(async () => {
  console.log("=== coin_source_rules (worship rows) ===");
  const r1 = await fetch(
    BASE + "/rest/v1/coin_source_rules?id=in.(worship_prayer,worship_quran,worship_adhkar)&select=id,amount,daily_cap,is_live&order=id",
    { headers: H },
  );
  if (r1.status === 404) {
    console.log("TABLE MISSING (404):", await r1.text().then((t) => t.slice(0, 120)));
  } else {
    const rows = await r1.json();
    console.log(JSON.stringify(rows));
  }

  console.log("\n=== worship_progress readable? (RLS probe, unauthenticated) ===");
  const r2 = await fetch(BASE + "/rest/v1/worship_progress?select=*&limit=1", { headers: H });
  console.log("status:", r2.status, r2.status === 200 ? "(exists; 0 rows for anon = RLS ok)" : await r2.text().then((t) => t.slice(0, 120)));

  console.log("\n=== OpenAPI: award_coins signature ===");
  const r3 = await fetch(BASE + "/rest/v1/", { headers: { ...H, Accept: "application/openapi+json" } });
  if (r3.ok) {
    const spec = await r3.json();
    const defs = spec.definitions || {};
    for (const name of Object.keys(defs)) {
      if (/^award_coins/.test(name) || /^coin_balance/.test(name) || /upsert_worship_progress|worship_daily_summary|get_worship_settings|save_worship_settings/.test(name)) {
        const props = defs[name].properties || {};
        console.log(name, "->", Object.keys(props).map((k) => k + ":" + ((props[k].format || props[k].type) || "?")).join(", "));
      }
    }
  } else {
    console.log("openapi fetch failed:", r3.status);
  }

  console.log("\n=== anonymous signup still enabled? ===");
  const s = await fetch(BASE + "/auth/v1/settings", { headers: H }).then((r) => r.json());
  console.log("anonymous_users:", s.external?.anonymous_users);
})().catch((e) => { console.error(e.message); process.exit(1); });
