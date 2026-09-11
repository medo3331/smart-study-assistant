import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";
import { runLiveE2E } from "@/lib/ai/live_e2e_nextjs";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Disabled in production" }, { status: 404 });
  }

  const { user, response: authError } = await requireUser("flat");
  if (!user) {
    return authError ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runLiveE2E();
    const { keys_present: _keys, ...safe } = (result as { keys_present?: unknown }) ?? {};
    void _keys;
    return NextResponse.json({ ok: true, result: safe, secrets_shown: false }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message || String(e), secrets_shown: false }, { status: 500 });
  }
}
