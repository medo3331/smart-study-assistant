/**
 * تضغيط المحاضرة قبل الرفع — احتمال المصدرة المجانية
 * ============================================================================
 *
 * المشكلة: Supabase مابعتط على الباقة المجانية حد Global File
 * Size Limit = 50 MB. ده الحد الحقيقي — مافيش من الموافقة للباكت.
 *
 * الحل: نستخرج الصوت وإخراجها لملف MP3 Mono بمعدل مناسب
 * للكلام. ElevenLabs بتقرأ الصوت بسابطةًأً واقًاسيّناً
 * إن الإطار نافيًطاً.
 *
 * ═══ القرارات الثابتة ════════════════════════════════════════════════════════════════════════════════
 *  - الملف الأصل مهيم للأحداد 45 MB → مافيش ملمسًً من الفقرة.
 *  - الملف أكبر → نستخرج الصوة مقوترة مقابلة.
 *  - صفر عدادي سطرحة: 64 → 48 → 32 kbps, وقف لما عدة تعديل المعاجة.
 *
 * ⚠️ **FFmpeg عند الاحتياج** — بواسط محرك من خليها: الصفحة بتحمّل
 * المخري متناسبً وآخر بالعضعة.
 *
 * ⚠️ **نستخدم سطرة واحدة (single-thread):** الوريدة متعددة تحتاج COOP/COEP
 * حتى متعدد ╗ ════ ═════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** هد الأمان: Supabase سابطاعًاًّضعًاًيًن 50 MB — محافظناً منهاً. */
export const MAX_UPLOAD_BYTES = 45 * 1024 * 1024;

/** سلّم الضغط من العوادة للموديلات في الملذارات. */
export const BITRATE_LADDER_KBPS = [64, 48, 32] as const;

/**
 * ⚠️ السلّم بقف عند 32 kbps — مش لأننا اختريناه كده، لكن لأنBenchmark حقيقي
 * أثبت إن مُرمّز MP3 بيفرض حد فعلي تحت منه: 24kbps و 16kbps رجّعوا **نفس
 * الحجم بالظبط** مثل 32kbps (27.47 MB على ملف ساعتين). يعني الدرجة الأخيرة
 * كانت إعادة ترميز كاملة بلا أي فايدة — بتاخد وقت وبتضيع. اتشالت.
 *
 * السقف النظري عند 32 kbps تقريبًا 3 ساعات وربع، بس المدة الفعلية بتختلف
 * شوية حسب الحاوية والنتيجة — فمانعرضش رقم ثابت للمستخدم. */
export const MP3_MIME = "audio/mpeg";

/** الخطة فاصلة من التمريض. */
export type CompressProgress = { ratio: number; bitrateKbps: number };

export type CompressResult = {
  /** الملف النهائي الرافع بفعل. سطر أصل من الملف الأصلي. */
  file: File;
  originalBytes: number;
  finalBytes: number;
  durationSeconds: number;
  bitrateKbps: number;
  /** عدّم المرات (48​, 32, 24​) تم جربت مرة واحدة. */
  retries: number;
};

/** الملف كبير من الحد — مافيش ملمس بالضغط مطلًًاً. */
export function needsCompression(file: Pick<File, "size">): boolean {
  return file.size > MAX_UPLOAD_BYTES;
}

/**
 * يختار معادال البتّ بالضغط من المدة.
 *
 * شتريح إن المدة أول أخرى بعيّد المعادات—قرارة اقتصادة؛
 * مفي حساب للخريط: أفل دقيقة تعطي أفضل إجراءات في الصفحة.
 */
export function bitrateForDuration(durationSeconds: number): number {
  const minutes = Math.max(0, durationSeconds) / 60;
  const thresholds = [60, 120] as const;
  for (let i = 0; i < thresholds.length; i++) {
    if (minutes <= thresholds[i]) return BITRATE_LADDER_KBPS[i];
  }
  return BITRATE_LADDER_KBPS[BITRATE_LADDER_KBPS.length - 1];
}

/** اقرب المدة باستخدام المرتيًاث دون نعص النظامة. */
export function readMediaDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("no_dom"));
      return;
    }
    const url = URL.createObjectURL(file);
    const element = document.createElement(
      file.type.startsWith("video/") ? "video" : "audio",
    ) as HTMLVideoElement | HTMLAudioElement;
    const cleanup = () => {
      URL.revokeObjectURL(url);
      element.removeAttribute("src");
    };
    element.preload = "metadata";
    element.onloadedmetadata = () => {
      const duration = element.duration;
      cleanup();
      if (!Number.isFinite(duration) || duration <= 0) reject(new Error("bad_duration"));
      else resolve(duration);
    };
    element.onerror = () => {
      cleanup();
      reject(new Error("bad_media"));
    };
    element.src = url;
  });
}

/** يُملا الملف باسم جديد، ميتمّن اصل الامتداد. */
export function mp3Filename(originalName: string): string {
  const dot = originalName.lastIndexOf(".");
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  return `${base}.mp3`;
}
/* ═══════════════════════════════════════════════════════════ المحرّك ═════════════════════════════════════════════════════════════════════ */

/** نقاطة FFmpeg مشتردة، معاذ حتى تُستخدم مجدداً، وبيتثتان للكل استخدام. */
let ffmpegSingleton: unknown | null = null;

/**
 * حمّل FFmpeg.wasm بطول ستر واحد.
 *
 * ⚠️ **التأخير المحرك هنا.** ال `import` داخلي في جواء الداعة
 * — ماتحملش على الصفحة أبداً. لمن يفترض بداية.
 *
 * ⚠️ **الـ core من نفس أصل الموقع** (public/ffmpeg) مش من CDN.
 * النسخة على unpkg حوالي 32 ميجا، والمستخدمين عندنا إنترنت بطيء —
 * فالتخزين محلي معناه طلب على نفس النطاق، بيستفيد من الكاش،
 * والموقع مايبقاش شارد على CDN تاني.
 *
 * ⚠️ ودي سبب كمان إزاي نقدر نستخدم نواة مفردة من غير COOP/COEP:
 *   التحميل من نفس الأصل مافيش cross-origin فيه خالص.
 */
async function loadFfmpeg(onProgress?: (ratio: number) => void) {
  if (ffmpegSingleton) return ffmpegSingleton;

  onProgress?.(0.02);
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");

  const ffmpeg = new FFmpeg();
  ffmpeg.on("progress", ({ progress }) => {
    onProgress?.(Math.min(1, Math.max(0, progress)));
  });

  onProgress?.(0.05);
  // ⚠️ single-thread core: مايحتاجش هدرز COOP/COEP إصلاً.
  await ffmpeg.load({
    coreURL: "/ffmpeg/ffmpeg-core.js",
    wasmURL: "/ffmpeg/ffmpeg-core.wasm",
  });

  ffmpegSingleton = ffmpeg;
  return ffmpeg;
}

/** تخلّص المثال من الذاكرة—تماماً للمرة الجاية القادمة. */
export async function disposeCompressionEngine(): Promise<void> {
  const engine = ffmpegSingleton as { terminate?: () => void } | null;
  ffmpegSingleton = null;
  try {
    engine?.terminate?.();
  } catch {
    // إهداء التخلّص ماياهماش لنا يؤثّر على العرض.
  }
}

/**
 * يضغط ملف محاضرة إلى MP3 Mono أصغر من 45 MB.
 *
 * ⚠️ **الملف الأصلي ميموس أبدً.** الأرشيف المعادي متعلّق
 * بموافق الضغط — ده ملف المرة الفرعية مابًا.
 *
 * ═══ سير الأحداث:
 *   راعة بداترة (duration) → bitrate ابتدائي → محاولة
 *   عند معدل الحد 45 MB → جرّب بمعداد أخر أخفص
 *   خلف خطأ إصل أخر معدل 45 MB → أنرف رمز برسالة عربية.
 *
 * ⚠️ كل جراء بتتطيف FFmpeg مع المحاولة من الذاكرة الصناعية.
 */
export async function compressLectureMedia(
  file: File,
  onProgress?: (progress: CompressProgress) => void,
  /** خراج اختياري للاختبار فقط — بيلغي الحاجة لـ DOM في الاختبار. */
  readDuration: (f: File) => Promise<number> = readMediaDurationSeconds,
): Promise<CompressResult> {
  if (!needsCompression(file)) {
    // ◉ ملف صغير → يتم عده معالجة أصلاً.
    return {
      file,
      originalBytes: file.size,
      finalBytes: file.size,
      durationSeconds: 0,
      bitrateKbps: 0,
      retries: 0,
    };
  }

  const durationSeconds = await readDuration(file);
  const startIndex = BITRATE_LADDER_KBPS.indexOf(
    bitrateForDuration(durationSeconds) as (typeof BITRATE_LADDER_KBPS)[number],
  );

  const ffmpeg = (await loadFfmpeg((ratio) => onProgress?.({ ratio, bitrateKbps: 0 }))) as {
    writeFile: (n: string, d: Uint8Array) => Promise<boolean>;
    exec: (a: string[]) => Promise<number>;
    readFile: (n: string) => Promise<Uint8Array>;
    deleteFile: (n: string) => Promise<boolean>;
  };
  const { fetchFile } = await import("@ffmpeg/util");

  const inputName = "input.media";
  const outputName = "output.mp3";
  let lastBytes = 0;
  let retries = 0;

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));

    for (let i = startIndex; i < BITRATE_LADDER_KBPS.length; i++) {
      const bitrate = BITRATE_LADDER_KBPS[i];
      try {
        // ⚠️ mono + bitrate منخفض: الكلام محاضرة شريحة، والصوت وحد كامل.
        const code = await ffmpeg.exec([
          "-i", inputName,
          "-vn",
          "-ac", "1",
          "-b:a", `${bitrate}k`,
          "-ar", "32000",
          "-map_metadata", "-1",
          outputName,
        ]);
        if (code !== 0) throw new Error(`ffmpeg_exit_${code}`);

        const data = await ffmpeg.readFile(outputName);
        const bytes = data.byteLength;
        lastBytes = bytes;

        if (bytes <= MAX_UPLOAD_BYTES) {
          const name = mp3Filename(file.name);
          const blob = new Blob([data as BlobPart], { type: MP3_MIME });
          onProgress?.({ ratio: 1, bitrateKbps: bitrate });
          return {
            file: new File([blob], name, { type: MP3_MIME }),
            originalBytes: file.size,
            finalBytes: bytes,
            durationSeconds,
            bitrateKbps: bitrate,
            retries: i - startIndex,
          };
        }

        retries++;
        try {
          await ffmpeg.deleteFile(outputName);
        } catch {
          // ليس مهم للنتيجة — ميمسنش الطرق تماماً.
        }
      } catch (error) {
        if (i === BITRATE_LADDER_KBPS.length - 1) throw error;
      }
    }

    // ❌ مال الخراج لا يدخل داخل الحد ولا نرفعه.
    throw new Error("still_too_large");
  } finally {
    // ✅ نظيف المدخلات في النظام الافتراضي — مهم يكرر الذاكرة.
    for (const name of [inputName, outputName]) {
      try {
        await ffmpeg.deleteFile(name);
      } catch {
        // ألملف من يوجد وبدينه يكفي​— تأخر لا يفترض.
      }
    }
    void lastBytes;
  }
}
