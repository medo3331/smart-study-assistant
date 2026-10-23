/**
 * محرّك FFmpeg.wasm المشترك — نسخة واحدة للصفحة كلها
 * ============================================================================
 *
 * ⚠️ **ليه الملف ده منفصل:** الـ engine كان جوّه
 * `lecture-compression.ts`، بس دلوقتي عندنا **مستخدمين**:
 *   - `lecture-compression.ts` → ضغط المحاضرة قبل الرفع.
 *   - `lecture-chunking.ts`    → استخراج الصوت وتقسيمه لأجزاء.
 *
 * Singleton واحد لكل صفحة: تحميل الـ core (32 ميجا) مرّة واحدة، مش مرّة
 * لكل عملية. لو حملّناه مرتين هنخسر الذاكرة والوقت.
 *
 * ⚠️ **التأخير المحرك هنا.** الـ `import` داخلي في جواء الدالة —
 * مايتحمّلش على الصفحة أبداً. لمن يفترض بداية.
 *
 * ⚠️ **الـ core من نفس أصل الموقع** (public/ffmpeg) مش من CDN.
 * النسخة على unpkg حوالي 32 ميجا، والمستخدمين عندنا إنترنت بطيء —
 * فالتخزين محلي معناه طلب على نفس النطاق، بيستفيد من الكاش، والموقع
 * مايبقاش شارد على CDN تاني.
 *
 * ⚠️ ودي سبب كمان إزاي نقدر نستخدم نواة مفردة من غير COOP/COEP:
 *   التحميل من نفس الأصل مافيش cross-origin فيه خالص.
 */

/** واجهة مبسّطة لـ FFmpeg — عشان نقدر نحاكيها في الاختبارات. */
export type FfmpegEngine = {
  writeFile: (name: string, data: Uint8Array) => Promise<boolean>;
  exec: (args: string[]) => Promise<number>;
  ffprobe: (args: string[]) => Promise<number>;
  readFile: (name: string) => Promise<Uint8Array>;
  deleteFile: (name: string) => Promise<boolean>;
  listDir: (path: string) => Promise<Array<{ name: string }>>;
  terminate?: () => void;
};

/** نقاطة FFmpeg مشتردة، معاذ حتى تُستخدم مجدداً، وبيتثبان للكل استخدام. */
let ffmpegSingleton: FfmpegEngine | null = null;

/**
 * حمّل FFmpeg.wasm بطول ستر واحد.
 *
 * ⚠️ **single-thread core**: مايحتاجش هدرز COOP/COEP إصلاً.
 */
export async function loadFfmpeg(
  onProgress?: (ratio: number) => void,
): Promise<FfmpegEngine> {
  if (ffmpegSingleton) return ffmpegSingleton;

  onProgress?.(0.02);
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");

  const ffmpeg = new FFmpeg();
  ffmpeg.on("progress", ({ progress }) => {
    onProgress?.(Math.min(1, Math.max(0, progress)));
  });

  onProgress?.(0.05);
  await ffmpeg.load({
    coreURL: "/ffmpeg/ffmpeg-core.js",
    wasmURL: "/ffmpeg/ffmpeg-core.wasm",
  });

  ffmpegSingleton = ffmpeg as unknown as FfmpegEngine;
  return ffmpegSingleton;
}

/** تخلّص المثال من الذاكرة—تماماً للمرة الجاية القادمة. */
export async function disposeCompressionEngine(): Promise<void> {
  const engine = ffmpegSingleton;
  ffmpegSingleton = null;
  try {
    engine?.terminate?.();
  } catch {
    // إهداء التخلّص ماياهماش لنا يؤثّر على العرض.
  }
}
