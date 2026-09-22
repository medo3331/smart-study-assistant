import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAdminRole } from "@/lib/auth-roles";

/**
 * GET /api/admin/is-owner
 * Server-only check — does NOT expose OWNER_EMAIL.
 * Returns { isOwner, canAccessAdmin } for conditional Admin link visibility.
 * Phase 1.5: canAccessAdmin = Owner (env) أو أي دور صالح من site_admins —
 * قبل كده كان بيرجع الـOwner بس، فالأدمنز المسجلين في site_admins مكانوش
 * بيشوفوا لينك اللوحة أصلًا رغم إنهم مصرّح لهم بالدخول.
 * Unauthenticated → { isOwner: false, canAccessAdmin: false } (no 401 to keep link hiding silent).
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
    return NextResponse.json({ isOwner: false, canAccessAdmin: false });
  }

  const role = await getAdminRole(supabase, user.id, user.email ?? null);
  return NextResponse.json({ isOwner: role === "owner", canAccessAdmin: role !== null });
}
