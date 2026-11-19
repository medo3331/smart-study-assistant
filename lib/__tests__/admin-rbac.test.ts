import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminPermissions, getAdminRole, hasPermission } from "@/lib/auth-roles";

function mockSupabase(row: { role: string; permissions?: string[] }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row, error: null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe("admin RBAC defaults", () => {
  it("resolves support marker and limits its default permissions to support tasks", async () => {
    const supabase = mockSupabase({ role: "admin", permissions: ["support"] });

    await expect(getAdminRole(supabase, "staff-id", null)).resolves.toBe("support");
    await expect(getAdminPermissions(supabase, "staff-id", "support")).resolves.toEqual([
      "users.read",
      "files.moderate",
      "audit.read",
      "support.manage",
    ]);
    await expect(hasPermission(supabase, "staff-id", null, "support.manage")).resolves.toBe(true);
    await expect(hasPermission(supabase, "staff-id", null, "subscriptions.manage")).resolves.toBe(false);
  });

  it("does not grant owner-only credit permissions to a legacy admin", async () => {
    const supabase = mockSupabase({ role: "admin", permissions: [] });

    await expect(hasPermission(supabase, "admin-id", null, "subscriptions.manage")).resolves.toBe(true);
    await expect(hasPermission(supabase, "admin-id", null, "credits.manage")).resolves.toBe(false);
    await expect(hasPermission(supabase, "admin-id", null, "admins.manage")).resolves.toBe(false);
  });
});
