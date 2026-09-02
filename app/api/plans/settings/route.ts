import { NextResponse } from "next/server";

export async function GET() {
  // Safe defaults — never accidentally enable payments on failure
  const freePeriodEnabled = true;
  const paymentsEnabled = false;
  return NextResponse.json({
    ok: true,
    settings: { freePeriodEnabled, paymentsEnabled },
    source: "fallback-safe",
    note: "DB settings not yet available — using safe defaults (free ON, payments OFF). Apply /tmp/phase49_sql.md migration when approved.",
  });
}
