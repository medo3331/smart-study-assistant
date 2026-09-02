import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isOwnerEmail } from "@/lib/auth-roles";

/**
 * GET /api/admin/is-owner
 * Server-only check — does NOT expose OWNER_EMAIL.
 * Returns { isOwner: boolean } for conditional Admin link visibility.
 * Unauthenticated → { isOwner: false } (no 401 to keep link hiding silent).
 */
export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    return NextResponse.json({ isOwner: false });
  }

  const isOwner = isOwnerEmail(user.email ?? null);
  return NextResponse.json({ isOwner });
}
