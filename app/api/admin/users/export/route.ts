import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { exportUsersCsv } from "@/app/admin/actions/users-export";

/**
 * GET /api/admin/users/export?q=&plan=&status=&code=&after=&before=
 * تصدير CSV حقيقي — محكوم بـ users.read على السيرفر (فحص حقيقي، مش إخفاء).
 */
export async function GET(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const res = await exportUsersCsv(
    {
      q: url.searchParams.get("q") || "",
      plan: url.searchParams.get("plan") || "all",
      status: url.searchParams.get("status") || "all",
      code: url.searchParams.get("code") || "all",
      after: url.searchParams.get("after"),
      before: url.searchParams.get("before"),
    },
    user.id,
    user.email ?? null
  );

  if (!res.ok) {
    return NextResponse.json({ error: res.message || "forbidden" }, { status: 403 });
  }

  return new NextResponse(res.csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="users-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
