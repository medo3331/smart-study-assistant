"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export async function addAdminByEmail(email: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("غير مصرح");

  // Owner-only
  const ownerEmail = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
  const { data: profileRes } = await supabase.from("profiles").select("email").eq("id", user.id).single().catch(() => ({ data: null }));
  const isOwner = (profileRes as any)?.email?.trim().toLowerCase() === ownerEmail;
  if (!isOwner) {
    const { data: entData } = await supabase.rpc("has_entitlement", { p_user_id: user.id, p_kind: "plan", p_value: "premium" }).catch(() => ({ data: false }));
    if (!entData) throw new Error("غير مصرح — فقط Owner");
  }

  if (!email || !email.includes("@")) throw new Error("بريد غير صالح");

  // Find target by email securely (service-role for user lookup only — not exposing to client)
  const privileged = createServiceClient();
  const { data: users, error: lookupError } = await privileged.from("profiles").select("id, email, persona").eq("email", email.trim().toLowerCase()).limit(1);
  if (lookupError) throw new Error("فشل البحث");
  if (!users || users.length === 0) throw new Error("المستخدم غير موجود");
  const target = users[0] as { id: string; email: string; persona?: string };

  // Prevent duplicate
  const { data: existing } = await privileged.from("site_admins").select("user_id, role").eq("user_id", target.id).maybeSingle();
  if (existing) return { ok: true, message: "هذا المستخدم Admin بالفعل", userId: target.id };

  // Insert admin (server-only — service_role)
  const { error: insertError } = await privileged.from("site_admins").insert({
    user_id: target.id,
    role: "admin",
    added_at: new Date().toISOString(),
  });
  if (insertError) throw new Error("فشل إضافة Admin: " + insertError.message);
  return { ok: true, message: "تمت إضافة Admin", userId: target.id, email: target.email };
}

export async function removeAdminById(userId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("غير مصرح");

  const ownerEmail = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
  const { data: profileRes } = await supabase.from("profiles").select("email").eq("id", user.id).single().catch(() => ({ data: null }));
  const isOwner = (profileRes as any)?.email?.trim().toLowerCase() === ownerEmail;
  if (!isOwner) {
    const { data: entData } = await supabase.rpc("has_entitlement", { p_user_id: user.id, p_kind: "plan", p_value: "premium" }).catch(() => ({ data: false }));
    if (!entData) throw new Error("غير مصرح — فقط Owner");
  }

  if (!userId) throw new Error("معرّف مطلوب");
  if (userId === user.id) throw new Error("لا يمكن إزالة نفسك (Owner)");

  const privileged = createServiceClient();
  const { error } = await privileged.from("site_admins").delete().eq("user_id", userId);
  if (error) throw new Error("فشل إزالة Admin: " + error.message);
  return { ok: true, message: "تمت إزالة Admin", userId };
}


export async function addAdminByEmailFromForm(formData: FormData) {
  const email = formData.get("email") as string;
  await addAdminByEmail(email); // void for form action
}
