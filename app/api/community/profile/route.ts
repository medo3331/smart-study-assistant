import { profileGetHandler, profilePatchHandler } from "@/lib/community/handlers";

export const dynamic = "force-dynamic";

export async function GET() {
  return profileGetHandler();
}

export async function PATCH(req: Request) {
  return profilePatchHandler(req);
}
