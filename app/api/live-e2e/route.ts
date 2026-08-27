import { NextRequest, NextResponse } from "next/server";
import { runLiveE2E } from "@/lib/ai/live_e2e_nextjs";

export async function GET(req: NextRequest) {
  try {
    const result = await runLiveE2E();
    return NextResponse.json({ ok: true, result, keys_present: (result as any).keys_present, secrets_shown: false }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e), secrets_shown: false }, { status: 500 });
  }
}
