import { blockHandler } from "@/lib/community/handlers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return blockHandler(req);
}
