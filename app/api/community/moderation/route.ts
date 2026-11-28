// ===========================================================================
// MAGICLY — Community C4: /api/community/moderation (حالتي + اعتراضي)
// ===========================================================================

import { moderationGetHandler, moderationAppealHandler } from "@/lib/community/moderation-handlers";

export const dynamic = "force-dynamic";

export async function GET() {
  return moderationGetHandler();
}

export async function POST(req: Request) {
  return moderationAppealHandler(req);
}
