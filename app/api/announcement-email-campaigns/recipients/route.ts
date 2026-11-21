import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { hasPermission } from "@/lib/auth-roles";

const PAGE_SIZE = 100;
const MAX_AUTH_PAGES = 100;

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.is_anonymous) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    const service = createServiceClient();
    if (!(await hasPermission(service, user.id, user.email ?? null, "announcements.manage"))) {
      return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
    }

    const url = new URL(req.url);
    const query = (url.searchParams.get("q") || "").trim().toLowerCase();
    const audience = url.searchParams.get("audience") || "all";
    const requestedPage = Number(url.searchParams.get("page") || "1");
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    if (!["all", "student", "graduate", "freelancer"].includes(audience)) return NextResponse.json({ success: false, error: "Invalid audience." }, { status: 400 });

    // Auth is paginated in the source, then filtered and paginated after matching.
    // Never silently truncate a broadcast audience at the first 1,000 accounts.
    const matched: Array<{ id: string; email: string; name: string; persona: string | null }> = [];
    let total = 0;
    for (let authPage = 1; authPage <= MAX_AUTH_PAGES; authPage++) {
      const { data, error } = await service.auth.admin.listUsers({ page: authPage, perPage: 1000 });
      if (error) return NextResponse.json({ success: false, error: "Failed to load registered users." }, { status: 500 });
      const authUsers = data?.users ?? [];
      const eligible = authUsers.filter((account) => account.email && account.email_confirmed_at);
      const ids = eligible.map((account) => account.id);
      const profilesById = new Map<string, { display_name: string | null; persona: string | null }>();
      for (let start = 0; start < ids.length; start += 500) {
        const { data: profiles, error: profileError } = await service.from("profiles").select("id, display_name, persona").in("id", ids.slice(start, start + 500));
        if (profileError) return NextResponse.json({ success: false, error: "Failed to load user profiles." }, { status: 500 });
        for (const profile of profiles ?? []) profilesById.set(profile.id, profile);
      }
      for (const account of eligible) {
        const profile = profilesById.get(account.id);
        if (audience === "student" && profile?.persona !== "student") continue;
        if (audience === "graduate" && profile?.persona !== "grad") continue;
        if (audience === "freelancer" && profile?.persona !== "freelancer") continue;
        const email = account.email!;
        const name = profile?.display_name || email;
        if (query && !`${name} ${email} ${account.id}`.toLowerCase().includes(query)) continue;
        total += 1;
        matched.push({ id: account.id, email, name, persona: profile?.persona ?? null });
      }
      if (authUsers.length < 1000) break;
      if (authPage === MAX_AUTH_PAGES) return NextResponse.json({ success: false, error: "User directory exceeds the safe scan limit; refine the search." }, { status: 503 });
    }
    const start = (page - 1) * PAGE_SIZE;
    return NextResponse.json({ success: true, recipients: matched.slice(start, start + PAGE_SIZE), total, page, pageSize: PAGE_SIZE, hasMore: start + PAGE_SIZE < total });
  } catch (error) {
    console.error("[announcement-email-recipients] GET", error);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
