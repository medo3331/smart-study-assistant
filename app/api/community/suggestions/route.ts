import { suggestionsHandler } from "@/lib/community/handlers";

export const dynamic = "force-dynamic";

export async function GET() {
  return suggestionsHandler();
}
