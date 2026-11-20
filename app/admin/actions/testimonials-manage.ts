"use server";

import { revalidatePath } from "next/cache";
import { requireAdminActor, ActionAuthError } from "@/lib/admin/action-guard";
import { createServiceClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "@/lib/admin/audit-log-record";

const ACTION = "announcements.manage" as const;

type ActionResult = { ok: boolean; message: string };

export type AdminTestimonial = {
  id: string;
  display_name: string;
  rating: number;
  comment: string;
  is_published: boolean;
  created_at: string;
};

export async function listTestimonialsForAdmin(): Promise<AdminTestimonial[]> {
  await requireAdminActor(ACTION);
  const db = createServiceClient();
  const { data, error } = await db
    .from("testimonials")
    .select("id, display_name, rating, comment, is_published, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`تعذر تحميل التقييمات: ${error.message}`);
  return (data ?? []) as AdminTestimonial[];
}

export async function moderateTestimonial(id: string, publish: boolean): Promise<ActionResult> {
  let actor;
  try {
    ({ actor } = await requireAdminActor(ACTION));
  } catch (error) {
    if (error instanceof ActionAuthError) return { ok: false, message: "غير مصرح." };
    throw error;
  }

  const db = createServiceClient();
  const { data, error } = await db
    .from("testimonials")
    .update({
      is_published: publish,
      reviewed_at: new Date().toISOString(),
      reviewed_by: actor.userId,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !data) return { ok: false, message: "تعذر تحديث التقييم." };
  await recordAuditLog({
    actor: actor.userId,
    actor_email: actor.userEmail,
    action: ACTION,
    resource_type: "testimonial",
    resource_id: id,
    details: { op: publish ? "publish" : "unpublish" },
    result: "PASS",
  });
  revalidatePath("/");
  revalidatePath("/admin/testimonials");
  return { ok: true, message: publish ? "تم نشر التقييم." : "تم إخفاء التقييم." };
}

export async function deleteTestimonial(id: string): Promise<ActionResult> {
  let actor;
  try {
    ({ actor } = await requireAdminActor(ACTION));
  } catch (error) {
    if (error instanceof ActionAuthError) return { ok: false, message: "غير مصرح." };
    throw error;
  }

  const db = createServiceClient();
  const { error } = await db.from("testimonials").delete().eq("id", id);
  if (error) return { ok: false, message: "تعذر حذف التقييم." };
  await recordAuditLog({
    actor: actor.userId,
    actor_email: actor.userEmail,
    action: ACTION,
    resource_type: "testimonial",
    resource_id: id,
    details: { op: "delete" },
    result: "PASS",
  });
  revalidatePath("/");
  revalidatePath("/admin/testimonials");
  return { ok: true, message: "تم حذف التقييم." };
}
