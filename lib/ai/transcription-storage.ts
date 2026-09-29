/* ==========================================================================
   🎙️ تخزين تسجيلات المحاضرات — Supabase Storage (المرحلة 2)
   ═══════════════════════════════════════════════════════════════════════

   **سيرفر بس.** كل دالة هنا بتمسك مفتاح الخدمة — ممنوع أي استيراد من
   كومبوننت كلاينت. اللي بيحتاجه الكلاينت (الأنواع والحدود) في
   `transcription-shared.ts`.

   ═══ ليه Supabase Storage ═══
   المشروع أصلاً Supabase (قاعدة + مصادقة + `SUPABASE_SERVICE_ROLE_KEY`)،
   وفيه جدول `public.files` بعمود `storage_path` مصمم للتخزين من الأصل
   بس مفيش بucket متعمل. فدهاش **أقل** بنية جديدة ممكنة: مفيش مورد
   تالت، مفيش مفتاح جديد غير مفتاح الباكيت، وRLS بيشتغل بنفس نظام
   المشروع. اختيار S3/R2 كان هيضيف مورد ومفاتيح وbucket lifecycle من الصفر.

   ═══ ليه الرفع المباشر ═══
   المسار القديم كان: المتصفح → `/api/lecture-transcription` (multipart في
   جسم الطلب) إلى ElevenLabs. المشكلة:
     - Vercel Functions بيحدّ جسم الطلب بحوالي 4.5 ميجا، فمحاضرة 30 دقيقة
       كانت هتفشل عند باب الراوت.
     - `request.formData()` بيحمّل الملف كله في ذاكرة الفانكشن.
   المسار الجديد: المتصفح إلى (presigned PUT) إلى Supabase Storage مباشرة،
   وElevenLabs بيقرأه بنفسه من `cloud_storage_url`. **الملف مش بيلمس
   الفانكشن في الاتجاهين** — ده سبب اختيار `cloud_storage_url` على
   إننا ننزّله في السيرفر ونرفعه لـ ElevenLabs.

   ═══ الأمان ═══
     - presigned URL بيتولّد بـ service role (سيرفر بس) وعمره قصير
       (ساعتين)، وبيكتب على **مسار واحد محدّد** مش على الباكيت كله.
     - الباكيت **private** (مش public) — الرفع بيحصل بالـ token بس.
     - المسار فيه `crypto.randomUUID()`، فمينفعش حد يخمّن مسار
       ملف تاني ويتعدّل عليه.
     - بنتحقق من الحجم **بعد** الرفع من بيانات Supabase نفسها
 *       (list)، مش من اللي المتصفح أعلنه.
   ═══════════════════════════════════════════════════════════════════════ */

import { randomUUID } from "node:crypto";

import { createServiceClient, isServiceKeyConfigured } from "@/lib/supabase/admin";
import {
  ALLOWED_LECTURE_EXTENSIONS,
  ALLOWED_LECTURE_MIME_TYPES,
  formatFileSize,
  lectureFileExtension,
  MAX_LECTURE_FILE_BYTES,
  TranscriptionError,
  type UploadTicket,
} from "./transcription-shared";

/** اسم الباكيت. متغيّر بيئة عشان يختلف بين staging/production من غير
 *  كود. الافتراضي `lecture-uploads` — شوف `db/13-lecture-uploads-bucket.sql`. */
const BUCKET = process.env.LECTURE_UPLOAD_BUCKET?.trim() || "lecture-uploads";

/** عمر presigned upload URL: ساعتين.
 *  محاضرة 3 ساعات على نت عربي: الرفع نفسه ممكن ياخد دقايق، والتذكرة
 *  لازم تبقى صالحة لحد ما المتصفح يخلص رفع. */
const UPLOAD_URL_TTL_SECONDS = 2 * 60 * 60;

/** عمر رابط القراءة اللي بياخده ElevenLabs: ساعة.
 *  ⚠️ ده رابط **موقّع** على كائن واحد بس، وبيستخدم مرة واحدة للتفريغ
 *  وبعدين بنحذف الملف. مش رابط عام. */
const READ_URL_TTL_SECONDS = 60 * 60;

/** هل التخزين مهيّأ؟ (URL + مفتاح سيرفر موجودين في البيئة)
 *  الواجهة بتستخدم ده عشان ترجع للمسار القديم بدل ما تفشل صامتة.
 *
 *  ⚠️ بننادي `isServiceKeyConfigured()` من `lib/supabase/admin.ts` بدل ما
 *  نقرا المتغيّرات بأنفسنا: كده مصدر الحقيقة للمفتاح **واحد** في
 *  المشروع كله: نفس قاعدته (الجديد الأول ثم القديم) ونفس الـ trim.
 *  لو فضلنا نقرا `SUPABASE_SERVICE_ROLE_KEY` هنا، كان الـ storage هيفتكر
 *  إن البيئة مهيّأة والعميل يفشل فعلاً بسبب مفتاح مختلف. */
export function isStorageConfigured(): boolean {
  return isServiceKeyConfigured();
}

function storage() {
  if (!isStorageConfigured()) {
    console.error(
      "lecture-transcription: Supabase Storage غير مهيّأ (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY مفقودين)",
    );
    throw new TranscriptionError(
      "STORAGE_NOT_CONFIGURED",
      "رفع المحاضرات الكبيرة غير متاح حالياً. جرّب ملف أصغر، أو حاول تاني لاحقاً.",
      503,
    );
  }
  return createServiceClient().storage.from(BUCKET);
}

/** يبني مسار كائن فريد.
 *
 *  ⚠️ الـ UUID في النص **مهم أمنياً**: المسار ده هو كل حاجة بتفصل
 *  بين ملف مستخدم وآخر. لو رجعنا لاسم الملف الأصلي بس، حد يقدر يخمّن
 *  مسار ملف حد تاني ويبعت عليه طلب تفريغ. الاسم الأصلي بيتخزّن
 *  **متسجّل** كـ metadata مش كجزء من المسار.
 *
 *  امتداد الملف جزء من المسار عشان ElevenLabs يميّز النوع من الرابط
 *  (هو بيستنتج النوع من المسار/الـ content-type). */
function buildObjectPath(originalName: string): string {
  const match = /\.([A-Za-z0-9]{1,5})$/.exec(originalName);
  const ext = (match?.[1] ?? "bin").toLowerCase();
  // yyyy/mm/dd بيسهّل تنظيف الملفات القديمة بـ lifecycle policy.
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}/${randomUUID()}.${ext}`;
}

/**
 * يجهّز تذكرة رفع: presigned URL يكتب على **مسار واحد محدّد** بس.
 *
 * ⚠️ بنتحقق من الاسم والحجم **قبل** ما نولّد التذكرة، لكن ده فحص مبكّر
 * مش نهائي: الفحص الحقيقي بيحصل في `verifyUploadedObject` بعد ما الملف
 * يوصل فعلاً (المتصفح يقدر يكذب في `size`).
 */
export async function createUploadTicket(input: {
  filename: string;
  contentType: string;
  size: number;
}): Promise<UploadTicket> {
  assertLectureUploadMeta(input.filename, input.size, input.contentType);

  const path = buildObjectPath(input.filename);
  const { data, error } = await storage().createSignedUploadUrl(path, { upsert: false });

  if (error || !data?.signedUrl || !data.token) {
    // ⚠️ بنطبع رسالة Supabase (مفيدة للتشخيص) — مفيهاش أسرار.
    console.error(`lecture-transcription: فشل توليد رابط الرفع — ${error?.message}`);
    throw new TranscriptionError(
      "UPLOAD_TICKET_FAILED",
      "مقدرناش نجهّز رفع المحاضرة دلوقتي. حاول تاني بعد شوية.",
      502,
    );
  }

  return {
    signedUrl: data.signedUrl,
    token: data.token,
    path,
    expiresIn: UPLOAD_URL_TTL_SECONDS,
  };
}

/** فحص سريع للبيانات اللي المتصفح بعتها (قبل توليد التذكرة). */
function assertLectureUploadMeta(filename: string, size: number, contentType: string): void {
  if (typeof filename !== "string" || filename.trim() === "") {
    throw new TranscriptionError(
      "NO_FILE",
      "مفيش ملف اتبعت. اختر تسجيل المحاضرة الأول.",
      400,
    );
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw new TranscriptionError(
      "EMPTY_FILE",
      "الملف فاضي. اختر ملف محاضرة فيه تسجيل فعلي.",
      400,
    );
  }
  if (size > MAX_LECTURE_FILE_BYTES) {
    throw new TranscriptionError(
      "FILE_TOO_LARGE",
      `حجم الملف كبير أوي. أقصى حجم مسموح ${formatFileSize(MAX_LECTURE_FILE_BYTES)}.`,
      413,
    );
  }
  // نفس فحص المرحلة 1 بالظبط: امتداد + MIME (المتصفح بيبعت نوع فاضي
  // لامتدادات نادرة زي mkv فبنسمح بيه).
  const ext = lectureFileExtension(filename);
  const extAllowed = (ALLOWED_LECTURE_EXTENSIONS as readonly string[]).includes(ext);
  const mimeAllowed = contentType === "" || ALLOWED_LECTURE_MIME_TYPES.has(contentType);
  if (!extAllowed || !mimeAllowed) {
    throw new TranscriptionError(
      "UNSUPPORTED_TYPE",
      "نوع الملف مش مدعوم. استخدم تسجيل بصيغة MP3 أو WAV أو M4A أو MP4 أو AAC أو FLAC.",
      415,
      `ext=${ext} mime=${contentType}`,
    );
  }
}

/**
 * يتأكد إن الملف **فعلاً** اترفع، وإن حجمه الحقيقي جوه الحد.
 *
 * ⚠️ دي النقطة الأهم أمنياً في المرحلة دي: `size` اللي المتصفح بيبعته
 * مش دليل. إحنا بنقرا الحجم من Supabase نفسه. كمان بنرفض أي مسار
 * بره الشكل المتوقع للمسار — حماية ضد path traversal.
 *
 * بيرجّع الحجم الحقيقي بالبايت.
 */
export async function verifyUploadedObject(
  path: string,
  declaredSize: number,
): Promise<number> {
  if (typeof path !== "string" || path.trim() === "" || path.includes("..")) {
    throw new TranscriptionError(
      "INVALID_PATH",
      "رفع المحاضرة مالوش صح. حاول ترفع الملف من جديد.",
      400,
    );
  }

  // بنسأل عن المجلد اللي فيه الملف ونفلتر بالاسم بالظبط:
  // نتيجة واحدة حتمياً بدل ما نعتمد على prefix matching.
  const slash = path.lastIndexOf("/");
  if (slash <= 0) {
    throw new TranscriptionError("INVALID_PATH", "رفع المحاضرة مالوش صح.", 400);
  }
  const folder = path.slice(0, slash);
  const name = path.slice(slash + 1);

  const { data, error } = await storage().list(folder, { search: name, limit: 10 });
  if (error) {
    console.error(`lecture-transcription: فشل قراءة بيانات الملف — ${error.message}`);
    throw new TranscriptionError(
      "UPLOAD_VERIFY_FAILED",
      "مقدرناش نتأكد إن الملف اترفع صح. حاول تاني.",
      502,
    );
  }

  const object = data?.find((entry) => entry.name === name);
  if (!object) {
    throw new TranscriptionError(
      "UPLOAD_NOT_FOUND",
      "مفيش ملف مرفوع. حاول ترفع المحاضرة من جديد.",
      404,
    );
  }

  /* ⚠️ الحجم الحقيقي من `metadata.size` — مش `size` على الكائن نفسه
     (دي موجودة في `FileObjectV2` المستعمل في `list({ forTraining })`،
     لكن `list()` العادي بيرجّع `FileObject` والحجم في metadata). بنقراها
     بحارس نوع واللي مش موجود بيبقى صفر → بيرمي EMPTY_FILE. أحسن من
     ما نمرّر رقم مش حقيقي لـ ElevenLabs. */
  const realSize =
    object.metadata && typeof object.metadata.size === "number" ? object.metadata.size : 0;

  if (realSize === 0) {
    throw new TranscriptionError(
      "EMPTY_FILE",
      "الملف اللي اترفع فاضي. جرّب تاني.",
      422,
    );
  }
  if (realSize > MAX_LECTURE_FILE_BYTES) {
    // الملف فعلاً أكبر من المسموح → نحذفه فوراً عشان مياكلش مساحة.
    await deleteObject(path);
    throw new TranscriptionError(
      "FILE_TOO_LARGE",
      `حجم الملف كبير أوي. أقصى حجم مسموح ${formatFileSize(MAX_LECTURE_FILE_BYTES)}.`,
      413,
      `realSize=${realSize}`,
    );
  }

  /* ⚠️ فحص على عدم تطابق الحجم: لو المتصفح قال 2 جيجا ورفع 3 كيلوبايت،
     ده غالباً رفع مقطوع (انقطاع نت). بنسمح بفارق معقول بس (1% أو
     5 ميجا، أيهما أكبر) عشان نتفادى رفض ملفات سليمة بسبب metadata. */
  const tolerance = Math.max(5 * 1024 * 1024, declaredSize * 0.01);
  if (Number.isFinite(declaredSize) && declaredSize > 0) {
    if (realSize < declaredSize - tolerance) {
      throw new TranscriptionError(
        "UPLOAD_INCOMPLETE",
        "الرفع ماخلصش. اتقطع — جرّب ترفع الملف تاني.",
        422,
        `declared=${declaredSize} real=${realSize}`,
      );
    }
  }

  return realSize;
}

/**
 * رابط قراءة **موقّع** للملف، لحد ما ElevenLabs يقرأه.
 *
 * ⚠️ ده اللي بيخلّي الملف مايعدّيش في الفانكشن أصلاً: بدل ما ننزّل 200
 * ميجا من Supabase ونرفعها لـ ElevenLabs، بندّيهم رابط موقّع واختيار
 * ElevenLabs هو اللي بيسحب الملف مباشرة من Supabase.
 *
 * الرابط مؤقت (ساعة) وعلى كائن واحد بس، ومش public. وبيعيش أقصر وقت
 * ممكن عشان لو وصل لـ حد (مش مستحيل) ميبقاش صالح طويل.
 */
export async function createSignedReadUrl(path: string): Promise<string> {
  const { data, error } = await storage().createSignedUrl(path, READ_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    console.error(`lecture-transcription: فشل توليد رابط القراءة — ${error?.message}`);
    throw new TranscriptionError(
      "SIGNED_URL_FAILED",
      "مقدرناش نقرأ الملف المرفوع. حاول تاني.",
      502,
    );
  }
  return data.signedUrl;
}

/**
 * حذف الملف الأصلي من التخزين.
 *
 * ⚠️ **بنحذف بعد النجاح بس**، مش قبله: لو ElevenLabs
 * وقع في النص، الملف بيفضل موجود والطالب يقدر يدوس «حاول تاني»
 * من غير ما يرفع 200 ميجا تاني — أهم فرق بين ده والمسار القديم.
 *
 * الفشل في الحذف مش خطأ فادح: الملف مش عام، والـ lifecycle
 * job بيحذفه لاحقاً (انظر `db/13-lecture-uploads-bucket.sql`).
 */
export async function deleteObject(path: string): Promise<void> {
  try {
    const { error } = await storage().remove([path]);
    if (error) {
      console.error(`lecture-transcription: فشل حذف الملف — ${error.message}`);
    }
  } catch (error) {
    console.error("lecture-transcription: استثناء أثناء حذف الملف", error);
  }
}
