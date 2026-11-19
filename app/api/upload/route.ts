"use server";

// app/api/upload/route.ts — server action الرفع القديم (Epic 2)
//
// ⚠️ **المشكلة التاريخية**: النسخة القديمة كانت بتسجل صف في `files` بس —
//    الكومنت كان بيقول "storage path placeholder — real Supabase Storage
//    upload would live here" فمفيش ملف كان بيترفع فعلاً للتخزين، وكمان
//    الامتداد الخام كان بينزل في عمود `file_type` اللي عليه CHECK constraint
//    (pdf/word/text/image/video/audio) فـ docx و mp4 كانوا بيفشلوا في
//    الـ insert كمان. الاتنين اصلحوا هنا.
//
// الطريقة دلوقتي: الفاليدشن مشترك مع `/api/files/upload-ticket` عبر
// `lib/files/storage.ts`، والملف بيرفع للتخزين مباشرة من الـ action
// (الـ server action بيمرر الملف في جسم الطلب — مش محتاج تذكرة موقّعة).
// الميزة الأساسية للطلاب هي صفحة «ملفاتي» (/files) عبر الراوت الجديد.

import { createServiceClient } from "@/lib/supabase/admin";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { resolveActor } from "@/lib/policy";
import { checkSubscriptionQuota, refundSubscriptionQuota } from "@/lib/ai/quota-check";
import {
  buildFilePath,
  ensureFileBucket,
  fileCategory,
  uploadObject,
} from "@/lib/files/storage";

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

    const actor = await resolveActor(supabase, user.id, user.email ?? null);
    const quota = await checkSubscriptionQuota(user.id, "upload", actor.isOwner);
    if (!quota.allowed) {
      return { ok: false, message: quota.reasonAr ?? "تم تجاوز حد الخدمة", error: "QUOTA_EXCEEDED" };
    }

    // 1) File from form
    const file = formData.get("file") as File;
    if (!file) return { ok: false, message: "لا يوجد ملف", error: "missing_file" };

    const category = fileCategory(file.name);
    if (!category) {
      return { ok: false, message: "نوع الملف غير مدعوم", error: "invalid_file_type" };
    }

    // 2) Plan limits — نفس الأرقام القديمة بس الفئة من الـ mapping
    const privileged = createServiceClient();
    const { data: ent } = await privileged
      .from("entitlements")
      .select("value")
      .eq("user_id", user.id)
      .eq("kind", "plan")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const planKey = ent?.value || "free";

    const limits: Record<string, { fileSizeMB: number }> = {
      free: { fileSizeMB: 20 },
      pro: { fileSizeMB: 150 },
      ultra: { fileSizeMB: 1024 },
    };
    const cfg = limits[planKey] || limits.free;
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > cfg.fileSizeMB) {
      return { ok: false, message: `حجم الملف يتجاوز الحد (${cfg.fileSizeMB}MB)`, error: "file_too_large" };
    }

    // 3) الرفع الفعلي للتخزين — ده اللي كان ناقص
    await ensureFileBucket();
    const storagePath = buildFilePath(user.id, file.name);
    try {
      await uploadObject(storagePath, file);
    } catch (error) {
      const message = error instanceof Error ? error.message : "فشل رفع الملف للتخزين";
      return { ok: false, message, error: "storage_upload_failed" };
    }

    // 4) تسجيل الملف — file_type فئة صحيحة (مش امتداد خام) و stage='ready'
    const { error: insertError } = await privileged.from("files").insert({
      profile_id: user.id,
      file_name: file.name,
      original_name: file.name,
      file_size: file.size,
      file_type: category,
      storage_path: storagePath,
      stage: "ready",
    });

    if (insertError) {
      await refundSubscriptionQuota(user.id, "upload", quota.idempotencyKey);
      return { ok: false, message: "فشل تسجيل الملف: " + insertError.message, error: insertError.message };
    }

    return { ok: true, message: "تم رفع الملف بنجاح" };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, message: "خطأ في رفع الملف: " + message, error: message };
  }
}
