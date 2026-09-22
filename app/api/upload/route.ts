"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function uploadFile(formData: FormData) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (name: string) => cookieStore.get(name)?.value } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.is_anonymous) return { ok: false, message: "غير مسجل", error: "unauthenticated" };

    const privileged = createServiceClient();

    // 1) Quota check — lazy reset
    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
    const { data: quotaRow } = await privileged
      .from("subscription_quotas")
      .select("messages_24h, uploads_today, last_reset_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (quotaRow && quotaRow.last_reset_at) {
      const lastReset = new Date(quotaRow.last_reset_at);
      if (now.getTime() - lastReset.getTime() > 24 * 3600 * 1000) {
        await privileged.from("subscription_quotas").update({
          messages_24h: 0,
          uploads_today: 0,
          last_reset_at: now.toISOString(),
          updated_at: now.toISOString(),
        }).eq("user_id", user.id);
      }
    }

    // 2) Read profile plan (free/pro/ultra) from entitlements
    const { data: ent } = await privileged
      .from("entitlements")
      .select("value")
      .eq("user_id", user.id)
      .eq("kind", "plan")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const planKey = ent?.value || "free";

    // 3) Plan limits
    const limits: Record<string, { uploadDaily: number; fileSizeMB: number; allowed: string[] }> = {
      free: { uploadDaily: 5, fileSizeMB: 20, allowed: ["pdf", "text", "image"] },
      pro: { uploadDaily: 30, fileSizeMB: 150, allowed: ["pdf", "text", "image", "video", "audio"] },
      ultra: { uploadDaily: 60, fileSizeMB: 1024, allowed: ["pdf", "text", "image", "video", "audio"] },
    };
    const cfg = limits[planKey] || limits.free;

    // 4) File from form
    const file = formData.get("file") as File;
    if (!file) return { ok: false, message: "لا يوجد ملف", error: "missing_file" };

    const fileType = file.name.split(".").pop()?.toLowerCase() || "";
    const sizeMB = file.size / (1024 * 1024);

    if (!cfg.allowed.includes(fileType)) return { ok: false, message: "نوع الملف غير مسموح به لهذه الباقة", error: "invalid_file_type" };
    if (sizeMB > cfg.fileSizeMB) return { ok: false, message: `حجم الملف يتجاوز الحد (${cfg.fileSizeMB}MB)`, error: "file_too_large" };

    // 5) Quota enforcement
    const currentQuota = quotaRow || { uploads_today: 0, messages_24h: 0 };
    if (currentQuota.uploads_today >= cfg.uploadDaily) {
      return { ok: false, message: `تم تجاوز حد الرفع اليومي (${cfg.uploadDaily})`, error: "daily_upload_limit_reached" };
    }

    // 6) Insert file record (storage path placeholder — real Supabase Storage upload would live here)
    const { error: insertError } = await privileged.from("files").insert({
      profile_id: user.id,
      file_name: file.name,
      original_name: file.name,
      file_size: file.size,
      file_type: fileType,
      storage_path: `uploads/${user.id}/${file.name}`,
      classification: null,
      stage: null,
      grade: null,
      subject: null,
    });

    if (insertError) return { ok: false, message: "فشل تسجيل الملف: " + insertError.message, error: insertError.message };

    // 7) Update quota
    await privileged.from("subscription_quotas").upsert({
      user_id: user.id,
      plan_key: planKey,
      uploads_today: (currentQuota.uploads_today || 0) + 1,
      messages_24h: (currentQuota.messages_24h || 0),
      last_reset_at: now.toISOString(),
      updated_at: now.toISOString(),
    }, { onConflict: "user_id" });

    return { ok: true, message: "تم رفع الملف بنجاح" };
  } catch (e: any) {
    return { ok: false, message: "خطأ في رفع الملف: " + (e?.message || String(e)), error: String(e) };
  }
}
