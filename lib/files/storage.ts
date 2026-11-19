// lib/files/storage.ts
//
// 📁 ملفات الطالب — Supabase Storage (سيرفر فقط)
//
// كل دالة هنا بتلمس مفتاح الخدمة — ممنوع استيرادها من كومپوننت كلاينت.
//
// ═══ ليه رفع مباشر من المتصفح ═══
// Vercel Functions بيحدّ جسم الطلب بحوالي 4.5 ميجا، فأي ملف PDF محاضرة
// 20 ميجا كان هيقع عند باب الفانكشن. المسار زي ما المحاضرات بتشتغل:
// المتصفح يطلب **تذكرة رفع** (JSON صغير)، يتفتش عليه (نوع/حجم/كوتة)،
// وبعدين يرفع الملف **مباشرة** لـ Supabase Storage بـ presigned PUT.
// الملف عمره ما بيلمس الفانكشن.
//
// ═══ ليه bucket بيتعمل برمجياً ═══
// بدل ما نطلب من حد يشغّل SQL يدوي، أول تذكرة رفع بتتأكد إن الباكيت
// موجود وبتعمله لو مش موجود (idempotent). الباكيت **private** — القراءة
// والكتابة بس عبر روابط موقّعة قصيرة العمر من السيرفر.

import { randomUUID } from "node:crypto";
import { createServiceClient, isServiceKeyConfigured } from "@/lib/supabase/admin";

/** اسم الباكيت — بيئة قابلة للتبديل بين staging/production. */
export const FILE_BUCKET = process.env.STUDY_FILES_BUCKET?.trim() || "study-files";

/** عمر رابط الرفع الموقّع: ساعة كافية حتى على نت بطيء. */
export const UPLOAD_URL_TTL_SECONDS = 60 * 60;

/** عمر رابط القراءة/التحميل الموقّع: ساعة. */
export const READ_URL_TTL_SECONDS = 60 * 60;

/** فئات الملفات — مطابقة لقيد files.file_type في db/epic2. */
export type FileCategory = "pdf" | "word" | "text" | "image" | "video" | "audio";

/** أقصى حجم ملف لكل فئة (بايت) — محاضرات فيديو ممكن تكون كبيرة. */
export const MAX_FILE_BYTES: Record<FileCategory, number> = {
  pdf: 100 * 1024 * 1024,
  word: 50 * 1024 * 1024,
  text: 5 * 1024 * 1024,
  image: 25 * 1024 * 1024,
  video: 1024 * 1024 * 1024,
  audio: 300 * 1024 * 1024,
};

const EXTENSION_TO_CATEGORY: Record<string, FileCategory> = {
  pdf: "pdf",
  doc: "word",
  docx: "word",
  rtf: "word",
  txt: "text",
  md: "text",
  csv: "text",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  mp4: "video",
  mov: "video",
  webm: "video",
  mp3: "audio",
  m4a: "audio",
  wav: "audio",
  ogg: "audio",
};

/** فئة الملف من الامتداد — null يعني نوع مش مدعوم. */
export function fileCategory(filename: string): FileCategory | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TO_CATEGORY[ext] ?? null;
}

export class FileStorageError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

function storage() {
  if (!isServiceKeyConfigured()) {
    throw new FileStorageError(
      "STORAGE_NOT_CONFIGURED",
      "تخزين الملفات غير متاح حالياً (مفتاح الخدمة ناقص).",
      503,
    );
  }
  return createServiceClient().storage;
}

function storageFrom() {
  return storage().from(FILE_BUCKET);
}

let bucketReady: Promise<void> | null = null;

/** يتأكد إن الباكيت موجود — أول استدعاء بيعمله لو ناقص، وبعدين يكاش.
 *
 *  ⚠️ بعض مشاريع Supabase عليها حد global للحجم أقل من اللي بنطلب،
 *  فالإنشاء بحد 1GB ممكن يفشل برسالة غريبة ("exceeded the maximum allowed
 *  size") — بنكرر من غير حد، والـ global limit بيفرض نفسه وقت الرفع. */
export async function ensureFileBucket(): Promise<void> {
  bucketReady ??= (async () => {
    try {
      const withLimit = await storage().createBucket(FILE_BUCKET, {
        public: false,
        fileSizeLimit: 1024 * 1024 * 1024,
      });
      const fail1 = withLimit.error && !/exists/i.test(withLimit.error.message);
      if (fail1) {
        console.error(
          `files: إنشاء الباكيت بحد 1GB فشل — ${withLimit.error?.message} — بنكرر من غير حد`,
        );
        const withoutLimit = await storage().createBucket(FILE_BUCKET, {
          public: false,
        });
        if (withoutLimit.error && !/exists/i.test(withoutLimit.error.message)) {
          console.error(`files: فشل إنشاء الباكيت — ${withoutLimit.error.message}`);
        }
      }
    } catch (error) {
      console.error("files: فحص الباكيت فشل", error);
    }
  })();
  return bucketReady;
}

/** مسار الكائن: files/{userId}/yyyy/mm/dd/uuid.ext — مش قابل للتخمين. */
export function buildFilePath(userId: string, filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "bin";
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${userId}/${yyyy}/${mm}/${dd}/${randomUUID()}.${ext}`;
}

/** تذكرة رفع موقّعة على مسار واحد — بعد فحص النوع والحجم. */
export async function createFileUploadTicket(input: {
  userId: string;
  filename: string;
  size: number;
}): Promise<{ path: string; signedUrl: string; token: string }> {
  const category = fileCategory(input.filename);
  if (!category) {
    throw new FileStorageError(
      "INVALID_FILE_TYPE",
      "نوع الملف غير مدعوم. المسموح: PDF, Word, نص, صور, فيديو, صوت.",
      400,
    );
  }
  if (!Number.isFinite(input.size) || input.size <= 0) {
    throw new FileStorageError("EMPTY_FILE", "الملف فاضي.", 400);
  }
  if (input.size > MAX_FILE_BYTES[category]) {
    const mb = Math.round(MAX_FILE_BYTES[category] / (1024 * 1024));
    throw new FileStorageError(
      "FILE_TOO_LARGE",
      `حجم الملف كبير أوي. أقصى مسموح ${mb} ميجا للملفات دي.`,
      413,
    );
  }

  await ensureFileBucket();
  const path = buildFilePath(input.userId, input.filename);
  const { data, error } = await storageFrom().createSignedUploadUrl(path, { upsert: false });
  if (error || !data?.signedUrl || !data.token) {
    console.error(`files: فشل توليد رابط الرفع — ${error?.message}`);
    throw new FileStorageError(
      "UPLOAD_TICKET_FAILED",
      "مقدرناش نجهّز رفع الملف دلوقتي. حاول تاني.",
      502,
    );
  }
  return { path, signedUrl: data.signedUrl, token: data.token };
}

/** التحقق الحقيقي بعد الرفع: من Supabase نفسها، مش من كلام المتصفح. */
export async function verifyUploadedObject(
  path: string,
): Promise<{ exists: true; size: number } | { exists: false }> {
  const dir = path.split("/").slice(0, -1).join("/");
  const name = path.split("/").at(-1) ?? "";
  const { data, error } = await storageFrom().list(dir, {
    search: name,
    limit: 1,
  });
  if (error) {
    console.error(`files: فشل التحقق من الرفع — ${error.message}`);
    return { exists: false };
  }
  const object = data?.find((entry) => entry.name === name);
  if (!object) return { exists: false };
  return { exists: true, size: object.metadata?.size ?? 0 };
}

/** رابط قراءة/تحميل موقّع لملف واحد. */
export async function readFileUrl(path: string): Promise<string> {
  const { data, error } = await storageFrom()
    .createSignedUrl(path, READ_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    throw new FileStorageError(
      "READ_URL_FAILED",
      "مقدرناش نجهّز رابط فتح الملف. حاول تاني.",
      502,
    );
  }
  return data.signedUrl;
}

/** حذف كائن من التخزين (best-effort — الحذف هنا مش بيرمي). */
export async function deleteObject(path: string): Promise<void> {
  try {
    await storageFrom().remove([path]);
  } catch (error) {
    console.error(`files: فشل حذف الكائن ${path}`, error);
  }
}

/** رفع مباشر من السيرفر (يستخدمه الـ server action القديم). */
export async function uploadObject(path: string, body: ArrayBuffer | Blob): Promise<void> {
  const { error } = await storageFrom().upload(path, body, {
    upsert: false,
  });
  if (error) {
    throw new FileStorageError(
      "UPLOAD_FAILED",
      `فشل رفع الملف إلى التخزين: ${error.message}`,
      502,
    );
  }
}
