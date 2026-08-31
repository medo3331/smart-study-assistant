import { NextResponse } from "next/server";
import { runLiveE2E } from "@/lib/ai/live_e2e_nextjs";

export async function GET() {
  try {
    const result = await runLiveE2E();
    return NextResponse.json({ ok: true, result, keys_present: (result as { keys_present?: unknown }).keys_present, secrets_shown: false }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message || String(e), secrets_shown: false }, { status: 500 });
  }
}
