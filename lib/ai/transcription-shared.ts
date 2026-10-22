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

/**
 * حجم الجزء (chunk) للتقسيم في المتصفح.
 * الملفات الأكبر من هذا تُقسم إلى أجزاء وتُرسل واحدًا تلو الآخر للـ API
 * لتجنب حد 4.5 ميجا في جسم طلب Vercel ولتجنب خطأ 422 من ElevenLabs على الملفات الكبيرة.
 */
export const CHUNK_SIZE_BYTES = 3 * 1024 * 1024;

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
  provider: "elevenlabs" | "groq";
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

/* ───────────────────────── عقد تقسيم الملفات ─────────────────────────
 *
 * لما الملف أكبر من CHUNK_SIZE_BYTES، المتصفح بيقسّمه بـ File.slice()
 * وبيبعِت كل جزء لوحده. الجزء ده **مش ملف محاضرة كامل** — هو شريحة
 * بايتات من ملف أكبر.
 *
 * ⚠️ فرق مهم عن assertLectureFile:
 *   - ما بنتحققش من الحجم الأقصى (MAX_LECTURE_FILE_BYTES) — الجزء صغير
 *     طالما هو جزء من ملف كبير.
 *   - بنتحقق من **امتداد الملف الأصلي** (fileName) مش من اسم الجزء.
 *     السبب: المتصفح بيسمّي الجزء `lecture.mp3.part1` — والامتداد الفعلي
 *     هو `part1` وده **مش** في قائمة ElevenLabs المدعومة. فلو تحقّقنا من
 *     اسم الجزء كان كل جزء هيرجع 415.
 */

/**
 * الصيغ اللي **كل إطار فيها مستقل** — يعني لو الملف اتقطع بـ `File.slice()`
 * بتبقى النتيجة **صالحة** للتفريغ.
 *
 * ⚠️ دي مش «كل صيغ الصوت» — دي صيغ الإطارات المستقلة بس (MP3/AAC).
 * فيه صيغ تانية (M4A / AAC-in-MP4 / Opus-in-Ogg / FLAC / WAV) فيها
 * **فهرس أو header** في أول الملف، فالقطعة المقطوعة مالها فهرس خالص
 * والمزوّد بيرفضها بـ 422.
 *
 * ⚠️ ليه دي في ملف **مشترك** بين السيرفر والكلاينت: الواجهة بتستخدمها
 * عشان تقرر تحوّل الملف لصوت MP3 قبل التقسيم، والسيرفر بيستخدمها
 * عشان يرفض أي جزء يجيله بصيغة حاوية.
 */
export const INDEPENDENT_FRAME_EXTENSIONS = ["mp3", "aac"] as const;

/**
 * الصيغ اللي **مش** بتتقسم بأمان — لو وصلنا part بصيغة كده معناها
 * إن الواجهة شغّلت المسار القديم (تقسيم بايتات) على ملف حاوية.
 */
export const CONTAINER_LECTURE_EXTENSIONS = [
  "webm", "mp4", "mkv", "mov", "avi", "wmv", "flv", "mpeg", "mpg", "3gp",
  "wav", "m4a", "flac", "ogg", "opus", "aiff",
] as const;

/**
 * اسم الجزء المُرفع للاوت.
 *
 * ⚠️ **الامتداد لازم يفضل في الآخر** — ElevenLabs بيتعرف على صيغة الملف
 * من الامتداد، فالاسم `lecture.mp3` صحيح والاسم `lecture.mp3.part1` خطأ
 * (امتداده `part1` — مش في القائمة المدعومة، وكل جزء هيرجع 415).
 *
 * فبنحطّ الرقم **قبل** الامتداد: `lecture.part1.mp3`.
 *
 * @param originalName اسم الملف الأصلي (زي `محاضرة.mp3`).
 * @param index        رقم الجزء (صفر-indexed).
 */
export function chunkFileName(originalName: string, index: number): string {
  const dot = originalName.lastIndexOf(".");
  // مفيش امتداد (أو نقطة في الأول زي `.gitignore`) → نضيف اللاحقة بس.
  if (dot <= 0) return `${originalName}.part${index + 1}`;
  const base = originalName.slice(0, dot);
  const ext = originalName.slice(dot + 1);
  return `${base}.part${index + 1}.${ext}`;
}

/**
 * يفحص جزء (chunk) من ملف محاضرة قبل تفريغه.
 *
 * @param chunk      الجزء المستلم في الطلب (الملف المرفوع).
 * @param originalName اسم الملف **الأصلي** (زي `lecture.mp3`) — مصدر truth
 *                    لامتداد الصيغة.
 * @param maxBytes   أقصى حجم مسموح للجزء الواحد.
 */
export function assertLectureChunk(
  chunk: File,
  originalName: string,
  maxBytes: number,
): void {
  if (chunk.size === 0) {
    throw new TranscriptionError(
      "EMPTY_FILE",
      "الجزء فاضي. اختر ملف محاضرة فيه تسجيل فعلي.",
      400,
    );
  }

  if (chunk.size > maxBytes) {
    throw new TranscriptionError(
      "FILE_TOO_LARGE",
      `حجم الجزء كبير أوي. أقصى حجم مسموح ${Math.round(
        maxBytes / (1024 * 1024),
      )} ميجابايت.`,
      413,
      `size=${chunk.size}`,
    );
  }

  // الامتداد من **الاسم الأصلي** — دي النتيجة الصح.
  const ext = lectureFileExtension(originalName);
  const extAllowed = (ALLOWED_LECTURE_EXTENSIONS as readonly string[]).includes(ext);

  if (!extAllowed) {
    throw new TranscriptionError(
      "UNSUPPORTED_TYPE",
      "نوع الملف مش مدعوم. استخدم تسجيل بصيغة MP3 أو WAV أو M4A أو MP4 أو AAC أو FLAC.",
      415,
      `ext=${ext} original=${originalName}`,
    );
  }

  /* ⚠️ **فحص صلاحية الجزء نفسه** — دي الطبقة اللي كانت ناقصة وسببت
   * خطأ 422 من المزوّد.
   *
   * لو الملف الأصلي كان حاوية (webm/mp4/m4a/wav/...) والواجهة بعتت
   * جزء مقطوع بـ `File.slice()` — الجزء ده **مش ملف صالح** (فهرس/header
   * ناقص)، والمزوّد هيرفضه بـ 422 برسالة غامضة.
   *
   * عشان كده الواجهة دلوقتي بتحوّل الملف لصوت MP3 الأول، والجزء
   * بيوصلنا بامتداد mp3/aac (إطارات مستقلة). فلو وصلنا جزء بصيغة
   * حاوية يبقى ده **خطأ في العميل** مش في الملف — ونرفضه برسالة
   * واضحة بدل ما نرمي فلوس على نداء هيفشل. */
  const chunkExt = lectureFileExtension(chunk.name);
  const chunkIsIndependent = (
    INDEPENDENT_FRAME_EXTENSIONS as readonly string[]
  ).includes(chunkExt);

  if (!chunkIsIndependent) {
    throw new TranscriptionError(
      "UNSUPPORTED_CHUNK_FORMAT",
      "صيغة الجزء غير صالحة للتفريغ. جرّب ترفع المحاضرة تاني.",
      415,
      `chunkExt=${chunkExt} original=${originalName}`,
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
