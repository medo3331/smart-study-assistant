// ===========================================================================
// MAGICLY — Community C4: /api/community/report
// ===========================================================================

import { reportHandler } from "@/lib/community/moderation-handlers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return reportHandler(req);
}
