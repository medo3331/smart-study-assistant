/**
 * Authenticated (anon-session) DB inspection: the anon key alone gets 401 on
 * the OpenAPI root, but a real session sees it. Also probes RPC presence via
 * direct invocation and reads coin_source_rules with a signed-in role.
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
const H = { apikey: ANON, Authorization: "Bearer " + ANON, "Content-Type": "application/json" };

(async () => {
  // 1. anonymous session
  const s = await fetch(BASE + "/auth/v1/signup", { method: "POST", headers: H, body: "{}" }).then((r) => r.json());
  if (!s.access_token) { console.log("no anon session:", JSON.stringify(s).slice(0, 100)); return; }
  const T = s.access_token;
  const AH = { apikey: ANON, Authorization: "Bearer " + T, "Content-Type": "application/json" };

  console.log("=== coin_source_rules (worship rows) as authenticated reader ===");
  const r1 = await fetch(
    BASE + "/rest/v1/coin_source_rules?id=in.(worship_prayer,worship_quran,worship_adhkar)&select=id,amount,daily_cap,is_live&order=id",
    { headers: AH },
  ).then((r) => r.json()).catch((e) => String(e));
  console.log(JSON.stringify(r1));

  console.log("\n=== all live rules (context) ===");
  const all = await fetch(BASE + "/rest/v1/coin_source_rules?select=id,amount,daily_cap,is_live&order=id", { headers: AH })
    .then((r) => r.json()).catch(() => null);
  if (Array.isArray(all)) console.log(all.map((r) => `${r.id}:${r.amount}x${r.daily_cap}${r.is_live ? "" : "(off)"}`).join("  "));
  else console.log("unreadable:", JSON.stringify(all).slice(0, 80));

  console.log("\n=== worship_progress table ===");
  const r2 = await fetch(BASE + "/rest/v1/worship_progress?select=*&limit=1", { headers: AH });
  console.log("status:", r2.status);

  console.log("\n=== award_coins signature probe (wrong arg name => PGRST202 lists expected) ===");
  const p1 = await fetch(BASE + "/rest/v1/rpc/award_coins", {
    method: "POST", headers: AH, body: JSON.stringify({ nonexistent_param: 1 }),
  });
  const p1b = await p1.text();
  console.log(p1.status, p1b.slice(0, 220));

  console.log("\n=== upsert_worship_progress present? ===");
  const p2 = await fetch(BASE + "/rest/v1/rpc/upsert_worship_progress", {
    method: "POST", headers: AH, body: JSON.stringify({}),
  });
  console.log(p2.status, (await p2.text()).slice(0, 200));

  console.log("\n=== OpenAPI definitions (authenticated) ===");
  const r3 = await fetch(BASE + "/rest/v1/", { headers: { ...AH, Accept: "application/openapi+json" } });
  if (r3.ok) {
    const spec = await r3.json();
    const defs = spec.definitions || {};
    for (const name of Object.keys(defs)) {
      if (/^(award_coins|coin_balance)/.test(name) || /worship/.test(name)) {
        const props = defs[name].properties || {};
        console.log(name, "->", Object.keys(props).map((k) => k).join(", "));
      }
    }
  } else console.log("openapi failed:", r3.status);
})().catch((e) => { console.error(e.message); process.exit(1); });
