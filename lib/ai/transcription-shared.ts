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

/** أقصى حجم للملف المرفوع: 25 ميجا.
 *
 *  حد ElevenLabs نفسه 3GB، لكن طلب الراوت لازم يعدّي في الذاكرة (multipart)
 *  وVercel Functions بيقف عند ~4.5 ميجا للـ body. فـ 25 ميجا سقف برمجي
 *  يحمي من مدخلات مبالغ فيها، والسقف الحقيقي في الإنتاج هو حد المنصّة.
 *  لملفات أكبر، الحل الصح رفع مباشر للتخزين (presigned URL) مش من هنا. */
export const MAX_LECTURE_FILE_BYTES = 25 * 1024 * 1024;

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

/** حجم الملف بصيغة عربية مقروءة. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} كيلوبايت`;
  return `${(kb / 1024).toFixed(1)} ميجابايت`;
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
