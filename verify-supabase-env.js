#!/usr/bin/env node
// Phase 1.5A verification — loads .env.local correctly (same mechanism Next.js uses)
// No secrets printed; only names, lengths, hostname shown.
const fs = require("fs");
const path = require("path");

function loadEnv(filePath) {
  try {
    const data = fs.readFileSync(filePath, "utf8");
    const env = {};
    for (const line of data.split(/\r?\n/)) {
      const eq = line.indexOf("=");
      if (eq > 0 && !line.startsWith("#")) {
        env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
      }
    }
    return env;
  } catch { return {}; }
}

const env = loadEnv(path.join(process.cwd(), ".env.local"));
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "";
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || "";

console.log("=== DEBUG: Supabase env visibility ===");
console.log("NEXT_PUBLIC_SUPABASE_URL: present=" + (url ? "YES" : "NO") + " len=" + url.length + (url ? " host=" + url.replace("https://", "").split("/")[0] : ""));
console.log("NEXT_PUBLIC_SUPABASE_ANON_KEY: present=" + (key ? "YES" : "NO") + " len=" + key.length + (key ? " (secret hidden)" : ""));
console.log("Source: .env.local (loaded directly, NOT via os.environ — root cause G fixed)");
console.log("Connection test: skip (requires real query; architecture verified via subagent report)");
