import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { hasPermission } from "@/lib/auth-roles";

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    const service = createServiceClient();
    if (!(await hasPermission(service, user.id, user.email ?? null, "announcements.manage"))) {
      return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
    }

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const audience = url.searchParams.get("audience") || "all";

    const { data: usersData, error: usersErr } = await service.auth.admin.listUsers({ perPage: 1000 });
    if (usersErr) return NextResponse.json({ success: false, error: "Failed to load users." }, { status: 500 });
    const users = usersData?.users ?? [];

    // profiles for display names + persona
    const ids = users.map((u) => u.id);
    const { data: profiles } = await service.from("profiles").select("id,display_name,persona").in("id", ids);
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    const candidates = users
      .filter((u) => u.email && u.email_confirmed_at)
      .map((u) => {
        const p = profileMap.get(u.id);
        return {
          id: u.id,
          email: u.email!,
          name: p?.display_name || u.email!,
          persona: p?.persona || null,
        };
      })
      .filter((c) => {
        if (audience !== "all") {
          // optional shortcut filter; admin still chooses manually
          if (audience === "student" && c.persona !== "student") return false;
          if (audience === "graduate" && c.persona !== "grad") return false;
          if (audience === "freelancer" && c.persona !== "freelancer") return false;
        }
        if (!q) return true;
        return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
      })
      .slice(0, 200);

    return NextResponse.json({ success: true, recipients: candidates, total: candidates.length });
  } catch (e) {
    console.error("[announcement-email-recipients] GET", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
