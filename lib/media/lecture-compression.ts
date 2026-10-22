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

import { loadFfmpeg } from "./ffmpeg-engine";

/** هد الأمان: Supabase سابطاعًاًّضعًاًيًن 50 MB — محافظناً منهاً. */
export const MAX_UPLOAD_BYTES = 45 * 1024 * 1024;

/**
 * حدود حجم الملف حسب سعة ذاكرة الجهاز — لحماية من OOM في ffmpeg.wasm.
 *
 * deviceMemory متوفر في Chrome/Edge/Brave، مش متوفر في Safari.
 * fallback لـ user-agent للسفاري وأجهزة قديمة.
 *
 * الحدود:
 * - RAM ≤ 2GB  → 40MB  (أجهزة قديمة / موبايل'entrée级)
 * - RAM ≤ 4GB  → 60MB  (موبايل متوسط)
 * - RAM ≤ 8GB  → 100MB (كمبيوتر متوسط)
 * - RAM > 8GB  → 120MB (كمبيوتر قوي)
 *
 * fallback UA:
 * - iOS → 60MB
 * - Android → 80MB
 * - desktop → 120MB
 */
export function getDeviceLimit(): number {
  const ram = (navigator as any).deviceMemory;
  if (typeof ram === "number" && ram > 0) {
    if (ram <= 2) return 40 * 1024 * 1024;
    if (ram <= 4) return 60 * 1024 * 1024;
    if (ram <= 8) return 100 * 1024 * 1024;
    return 120 * 1024 * 1024;
  }
  // Fallback UA لـ Safari وأجهزة لا تدعم deviceMemory
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 60 * 1024 * 1024;
  if (/Android/i.test(ua)) return 80 * 1024 * 1024;
  return 120 * 1024 * 1024;
}

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

/** الملف كبير من الحد — مفيش مساس بالضغط مطلقًا. */
export function needsCompression(file: Pick<File, "size" | "type">): boolean {
  const LOSSY_TYPES = new Set([
    "audio/mpeg",
    "audio/mp3",
  ]);
  if (LOSSY_TYPES.has(file.type)) return false;

  const deviceLimit = getDeviceLimit();
  if (file.size > deviceLimit) return false;

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

/**
 * ⚠️ المحرّك نفسه جوّه `lib/media/ffmpeg-engine.ts` — **Singleton واحد**
 * للصفحة كلها، مش نسخة لكل مستورِد. استخدمنا الكود ده في تقسيم الملفات
 * كمان، ولو كل وحد حملّ الـ core (32 ميجا) لحمّلناه مرتين.
 */
export { disposeCompressionEngine, loadFfmpeg } from "./ffmpeg-engine";
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
  const FFMPEG_CDN = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
  try {
    await ffmpeg.load({
      coreURL: `${FFMPEG_CDN}/ffmpeg-core.js`,
      wasmURL: `${FFMPEG_CDN}/ffmpeg-core.wasm`,
    });
  } catch (cdnError) {
    console.warn("[ffmpeg] CDN load failed, falling back to local", cdnError);
    await ffmpeg.load({
      coreURL: "/ffmpeg/ffmpeg-core.js",
      wasmURL: "/ffmpeg/ffmpeg-core.wasm",
    });
  }

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

  const ffmpeg = await loadFfmpeg((ratio) => onProgress?.({ ratio, bitrateKbps: 0 }));
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
