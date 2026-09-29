/* ==========================================================================
   🎙️ عقد تفريغ المحاضرات — الأنواع والحدود (مشترك بين السيرفر والكلاينت)
   ═══════════════════════════════════════════════════════════════════════

   ⚠️ ليه الملف ده منفصل عن `lib/ai/transcription.ts`:
   الملف ده فيه **مفيش سطر واحد بيقرأ `process.env` ولا بيعمل fetch**.
   عشان كده تقدر تستورده من كومبوننت كلاينت والصفحة من غير ما Next
   يحاول تحطّ كود المزوّد في الـ client bundle. أي حاجة تتغيّر في طريقة
   النداء (المفتاح، الـ endpoint، التطبيع) تعيش في الملف التاني بس.

   القيم هنا **مصدر واحد للحقيقة**: الراوت بيفحص بيها، والواجهة بتعرض
   نفس الأرقام للطالب قبل ما يبعت حاجة. مفيش نسخة مكتوبة يدوي.
   ═══════════════════════════════════════════════════════════════════════ */

/** أقصى حجم للملف المرفوع: 1 جيجابايت.
 *
 *  ده **مش** حد Vercel — ده حد التطبيق. الملف في المرحلة دي بيعدّي من
 *  المتصفح إلى Supabase Storage مباشرة (presigned URL) ومش بيمسّ الفانكشن
 *  خالص، فسقف الـ 4.5 ميجا بتاع request body بقى مش مؤثر. الحد مبني
 *  على القيمتين الحقيقيتين:
 *
 *    - ElevenLabs STT: 3GB (الأسئلة الشائعة) و5GB (مرجع الـ API)،
 *      ومدة حتى 10 ساعات في الوضع القياسي.
 *    - محاضرة 3 ساعات بتسجيل تليفون ≈ 90 ميجا، وبميكروفون استوديو
 *      ≈ 200 ميجا. فـ 1 جيجا يغطي أكتر من 10 ساعات.
 *
 *  ⚠️ وSupabase Free بيدي 1 جيجا للحساب كله، فالحد ده أعلى من المتاح
 *  فعلياً على الباقة المجانية — وده سبب إضافي للحذف بعد التحويل
 *  (انظر lib/ai/transcription-storage.ts).
 *
 *  لملفات أكبر من ده: الحل الصح presigned multipart upload لـ S3/R2
 *  مباشرة، مش رفع حد الذاكرة. مش جزء من المرحلة دي. */
export const MAX_LECTURE_FILE_BYTES = 1024 * 1024 * 1024;

/**
 * أقصى حجم يمرّ في جسم طلب الفانكشن.
 *
 *  ⚠️ ده **حد المنصّة مش حد التطبيق**: Vercel Functions بيحدّ جسم الطلب
 *  بحوالي 4.5 ميجا (وبيقبل أقل من كده مع multipart). مستخدم كحد أعلى
 *  متحفّظ عشان multipart بيتحمّل في الذاكرة.
 *
 *  ليش مهم دلوقتي: المسار القديم (fallback) لو ملف أكبر من ده بيمرّ
 *  فيه **هيفشل عند المنصّة برسالة غامضة** (413/500). فالواجهة
 *  بترفضه قبل الإرسال برسالة عربية واضحة. المسار الجديد (الرفع
 *  المباشر) مش متأثر بالحد ده خالص.
 */
export const MAX_DIRECT_UPLOAD_BYTES = 4 * 1024 * 1024;

/** الامتدادات المدعومة — من قائمة ElevenLabs الرسمية (صوت + فيديو). */
export const ALLOWED_LECTURE_EXTENSIONS = [
  // صوت
  "mp3", "wav", "m4a", "aac", "flac", "ogg", "opus", "webm", "aiff",
  // فيديو
  "mp4", "mkv", "mov", "avi", "wmv", "flv", "mpeg", "mpg", "3gp",
] as const;

/** أنواع MIME المدعومة — نفس قائمة ElevenLabs.
 *  ملاحظة: المتصفح بيبعت نوع فاضي لبعض الامتدادات النادرة (خصوصاً mkv)،
 *  فالتحقق الأساسي على الامتداد والـ MIME طبقة إضافية مش بديل. */
export const ALLOWED_LECTURE_MIME_TYPES: ReadonlySet<string> = new Set([
  // صوت — القايمة نفس قوائم ElevenLabs، مع `audio/m4a` و`video/mpeg`
  // لأن المتصفحات بتبلّغ عن `.m4a` و`.mpg` بالشكل ده (مش بالاسم الرسمي).
  "audio/aac", "audio/x-aac", "audio/x-aiff", "audio/ogg", "audio/mpeg",
  "audio/mp3", "audio/mpeg3", "audio/x-mpeg-3", "audio/opus", "audio/wav",
  "audio/x-wav", "audio/webm", "audio/flac", "audio/x-flac", "audio/mp4",
  "audio/aiff", "audio/x-m4a", "audio/m4a",
  // فيديو
  "video/mp4", "video/x-msvideo", "video/x-matroska", "video/quicktime",
  "video/x-ms-wmv", "video/x-flv", "video/webm", "video/mpeg", "video/3gpp",
]);

/** الصيغ المقبولة في accept بتاعة input[type=file] — نفس القائمتين فوق. */
export const LECTURE_FILE_ACCEPT = [
  ...ALLOWED_LECTURE_EXTENSIONS.map((ext) => `.${ext}`),
  ...ALLOWED_LECTURE_MIME_TYPES,
].join(",");

/* ───────────────────────── الأنواع ───────────────────────── */

/** كلمة واحدة من النص بتوقيتاتها — كما يرجعها ElevenLabs. */
export type TranscriptWord = {
  text: string;
  start: number;
  end: number;
  speaker: string | null;
};

/** مقطع مجمّع (جملة/سطر) — ده اللي الواجهة بتعرضه واللي المساعد
 *  الذكي هيستهلكه لاحقاً. مبني من words لأن ElevenLabs بترجّع الكلمات
 *  بس من غير فواصل جُمل. */
export type TranscriptSegment = {
  text: string;
  start: number;
  end: number;
  speaker: string | null;
};

/** النتيجة المتطبّعة — العقد الوحيد اللي الواجهة وأي خدمة مستقبلية
 *  هتعتمد عليه. مستقل تماماً عن ترتيب حقول رد ElevenLabs. */
export type LectureTranscript = {
  /** النص كامل — النسخ والتحميل بياخدوا منه. */
  text: string;
  /** رمز اللغة المرصود (ISO-639-1/3) أو null. */
  language: string | null;
  /** ثقة الموديل في اللغة (0..1). */
  languageProbability: number | null;
  /** مدة الصوت بالثواني (مستنتجة من آخر توقيت كلمة). */
  duration: number | null;
  /** المقاطع — جاهزة للربط بالمساعد الذكي. */
  segments: TranscriptSegment[];
  /** الكلمات الخام بتوقيتاتها. */
  words: TranscriptWord[];
  /** الموديل اللي تولّد بيه النص — للتشخيص. */
  model: string;
  /** المزوّد — ثابت دلوقتي، بس بيوضّح العقد لو اتضاف مزوّد تاني. */
  provider: "elevenlabs";
};

/** خطأ مفهوم ومصنّف — الراوت بيترجمه لـ HTTP + رسالة عربية آمنة.
 *  `detail` بيفضل جوه السيرفر (لوجز بس) ومش بيطلع للمستخدم. */
export class TranscriptionError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string | undefined;

  constructor(code: string, message: string, status: number, detail?: string) {
    super(message);
    this.name = "TranscriptionError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

/* ───────────────────────── التحقق من الملف ───────────────────────── */

/** الامتداد من اسم الملف، صغير ومقطّع النقط. */
export function lectureFileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

/** حجم الملف بصيغة عربية مقروءة.
 *
 *  ⚠️ الخانة العشرية مهمة: تحت 10 ميجا بنسيبها (1.5 ميجا أوضح من
 *  «2 ميجا»)، وفوقها بنقرّب (450 ميجا أوضح من «450.0»). والجيجا قبل
 *  الميجا عشان الحد بقى 1 جيجا و«1024 ميجابايت» كانت لقطة سيئة. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} كيلوبايت`;

  const mb = kb / 1024;
  if (mb < 1000) return `${mb < 10 ? mb.toFixed(1) : mb.toFixed(0)} ميجابايت`;

  const gb = mb / 1024;
  return `${gb < 10 ? gb.toFixed(1) : gb.toFixed(0)} جيجابايت`;
}

/** يفحص الملف قبل ما نصرف فلوس على أي نداء خارجي.
 *  نفس الدالة بتتحقق في الواجهة (للرسالة الفورية) وفي الراوت (للتأمين). */
export function assertLectureFile(file: File): void {
  if (file.size === 0) {
    throw new TranscriptionError(
      "EMPTY_FILE",
      "الملف فاضي. اختر ملف محاضرة فيه تسجيل فعلي.",
      400,
    );
  }

  if (file.size > MAX_LECTURE_FILE_BYTES) {
    throw new TranscriptionError(
      "FILE_TOO_LARGE",
      `حجم الملف كبير أوي. أقصى حجم مسموح ${Math.round(
        MAX_LECTURE_FILE_BYTES / (1024 * 1024),
      )} ميجابايت.`,
      413,
      `size=${file.size}`,
    );
  }

  const ext = lectureFileExtension(file.name);
  const extAllowed = (ALLOWED_LECTURE_EXTENSIONS as readonly string[]).includes(ext);
  const mimeAllowed = file.type === "" || ALLOWED_LECTURE_MIME_TYPES.has(file.type);

  if (!extAllowed || !mimeAllowed) {
    throw new TranscriptionError(
      "UNSUPPORTED_TYPE",
      "نوع الملف مش مدعوم. استخدم تسجيل بصيغة MP3 أو WAV أو M4A أو MP4 أو AAC أو FLAC.",
      415,
      `ext=${ext} mime=${file.type}`,
    );
  }
}

/* ───────────────────────── عقد الرفع المباشر ─────────────────────────
 *
 *  المرحلة 2: بدل ما الملف يعدّي في جسم طلب الفانكشن، المتصفح
 *  بيرفعه **مباشرة** لـ Supabase Storage عبر presigned URL، وبعدين
 *  الخادم بيقول لـ ElevenLabs يقرأه من cloud_storage_url.
 *
 *  دي الأنواع **بس** — مفيش أي مفتاح ولا signed URL مولّدة هنا.
 *  التوقيع بيعمله lib/ai/transcription-storage.ts (سيرفر بس).
 */

/** تذكرة الرفع اللي الراوت بيرجّعها للمتصفح. */
export type UploadTicket = {
  /** Signed upload URL — بينتهي بسرعة، وبتسمح بالكتابة على مسار واحد بس. */
  signedUrl: string;
  /** التوكن اللي لازم يتساب مع الرفع (x-upsert-token header). */
  token: string;
  /** مسار الكائن جوه الباكيت — ده اللي المتصفح هيبعته تاني للراوت. */
  path: string;
  /** عمر الـ signed URL بالثواني — بيعرض للواجهة. */
  expiresIn: number;
};

/** طلب تذكرة الرفع — اللي المتصفح بيبعته. */
export type CreateUploadTicketRequest = {
  filename: string;
  contentType: string;
  /** الحجم المعلن بالبايت — بيتحقق منه تاني بعد الرفع (مش بنثق فيه). */
  size: number;
};

/** طلب بدء التحويل بعد ما الرفع خلص. */
export type StartTranscriptionRequest = {
  /** مسار الكائن اللي اترفع. */
  path: string;
  /** الاسم الأصلي — للعرض والتحميل. مش بنثق بيه في الفحص. */
  filename: string;
};

/** شكل خطأ الراوت الموحّد (نفس بتاعة المرحلة 1). */
export type ApiErrorBody = {
  error: { code: string; message: string };
};
