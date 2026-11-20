import type { SupabaseClient } from "@supabase/supabase-js";

export type CampaignRecipient = { id: string; email: string; name: string; persona: string | null };
export type RecipientAudience = "all" | "student" | "graduate" | "freelancer";

export async function loadCampaignRecipients(
  service: SupabaseClient,
  options: { audience: RecipientAudience; query?: string; ids?: Set<string> }
): Promise<CampaignRecipient[]> {
  const q = options.query?.trim().toLowerCase() ?? "";
  const recipients: CampaignRecipient[] = [];
  const maxPages = 100;
  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("Failed to load registered users.");
    const accounts = (data?.users ?? []).filter((account) => account.email && account.email_confirmed_at && (!options.ids || options.ids.has(account.id)));
    const ids = accounts.map((account) => account.id);
    const profilesById = new Map<string, { display_name: string | null; persona: string | null }>();
    for (let start = 0; start < ids.length; start += 500) {
      const { data: profiles, error: profileError } = await service.from("profiles").select("id, display_name, persona").in("id", ids.slice(start, start + 500));
      if (profileError) throw new Error("Failed to load user profiles.");
      for (const profile of profiles ?? []) profilesById.set(profile.id, profile);
    }
    for (const account of accounts) {
      const profile = profilesById.get(account.id);
      if (options.audience === "student" && profile?.persona !== "student") continue;
      if (options.audience === "graduate" && profile?.persona !== "grad") continue;
      if (options.audience === "freelancer" && profile?.persona !== "freelancer") continue;
      const email = account.email!;
      const name = profile?.display_name || email;
      if (q && !`${name} ${email} ${account.id}`.toLowerCase().includes(q)) continue;
      recipients.push({ id: account.id, email, name, persona: profile?.persona ?? null });
    }
    const users = data?.users ?? [];
    if (users.length < 1000) return recipients;
  }
  throw new Error("User directory exceeds the safe scan limit; refine the search.");
}
