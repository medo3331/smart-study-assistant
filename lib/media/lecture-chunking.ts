/**
 * تقسيم المحاضرة إلى أجزاء **صالحة** للتفريغ
 * ============================================================================
 *
 * ⚠️ **المشكلة اللي بنحلّها (السبب الجذري لخطأ 422):**
 * التقسيم بـ `File.slice()` بيقطع الملف في **نص أي إطار**. ده تمام
 * للصيغ اللي إطاراتها مستقلة (MP3/AAC)، بس **كارثي** للصيغ اللي فيها
 * فهرس في أول الملف أو آخره:
 *
 *   - WebM / MP4 / MKV / MOV: الفهرس (Cues/Index) — الجزء المقطوع مالوش
 *     فهرس خالص، فالمزوّد بيقول «ملف تالف» (422).
 *   - WAV: الـ header فيه حجم الصوت الكلي — الجزء بيقول «صوت 4 دقايق»
 *     بس جواه 3 دقايق.
 *   - M4A / FLAC / OGG: نفس المشكلة — بيانات عامة في الأول.
 *
 * **الحل:** أي ملف مش MP3/AAC بيتحوّل **في المتصفح** لصوت MP3 بـ
 * FFmpeg.wasm، وبعدين الـ MP3 ده (إطاراته مستقلة) يتقسم بأمان.
 *
 * ═══ ليه MP3/AAC بالذات ═══
 * الـ MP3 سلسلة إطارات، كل إطار فيه رأسه (sync word) وحجمه ومدة
 * صوته. لو قطعت في حدّ إطار، الـ decoder بتخطّى الإطار الناقص
 * ويكمّل — فالنتيجة **صوت سليم** مش ملف مكسور. ده الفرق الجوهري
 * بين MP3 و WebM.
 *
 * ⚠️ **ليه العميل مش السيرفر:** التحويل بياخد وقت (ثواني لعشرات
 * الثواني) وبيحتاج FFmpeg.wasm (32 ميجا) — تحميلها في المتصفح مرة
 * واحدة وبتتفيد من الكاش.
 *
 * ⚠️ **ليه التقسيم بالوقت مش بالحجم:** التقسيم بالحجم (3 ميجا) بيخلّي
 * عدد الأجزاء غير متوقّع ومدة كل جزء مجهولة. التقسيم بالوقت (5 دقايق)
 * بيخلّي الأجزاء **مستقل تماماً** — أي جزء فاشل مش بيضيع المحاضرة
 * كلها.
 *
 * ═══ العقد ═══
 * كل جزء ناتج:
 *   - ملف MP3 **سليم** (مش شريحة بايتات).
 *   - اسمه `<base>.part<N>.mp3` — الامتداد في الآخر عشان المزوّد
 *     يتعرف على الصيغة.
 *   - حجمه ≤ `MAX_CHUNK_BYTES`.
 */

import { loadFfmpeg, type FfmpegEngine } from "./ffmpeg-engine";

/** أقصى حجم للجزء الواحد — تحت حد Vercel (4.5 ميجا) بهامش أمان. */
export const MAX_CHUNK_BYTES = 3 * 1024 * 1024;

/** مدة الجزء الواحد بالثواني (5 دقايق). */
export const CHUNK_SECONDS = 300;

/** معدل البتّ للصوت المستخرج — 64 kbps كافي للكلام، وبيخلّي
 *  5 دقايق ≈ 2.4 ميجا (تحت الحد). */
export const AUDIO_BITRATE_KBPS = 64;

/**
 * الصيغ اللي **بتتقسم بأمان** بـ `File.slice()`.
 *
 * ⚠️ دي قوائم **صريحة** مش «كل حاجة مش فيديو» — لأن فيه صيغ صوتية
 * كمان بتتكسر لما تتقطع (wav, m4a, flac, ogg, opus, aiff). بنستخدم
 * القائمة البيضاء دي عشان مافيش استثناء مخفي.
 */
export const SLICE_SAFE_EXTENSIONS = ["mp3", "aac"] as const;

/** الامتداد من اسم الملف، صغير ومقطّع النقط. */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

/** الملف ده بيتقسم بأمان بـ `File.slice()`؟ */
export function isSliceSafe(name: string): boolean {
  return (SLICE_SAFE_EXTENSIONS as readonly string[]).includes(fileExtension(name));
}

/**
 * الصيغ اللي **لازم** تتحوّل لصوت قبل أي تقسيم.
 *
 * ⚠️ القائمة دي شاملة عمداً: أي حاجة مش MP3/AAC بتاخد مسار FFmpeg.
 * الأفضل نتّسع في التحويل (ثواني) على ما نرفع ملف مكسور.
 */
export function needsAudioExtraction(name: string): boolean {
  return !isSliceSafe(name);
}

/** اسم الجزء: `<base>.part<N>.mp3` — الامتداد في الآخر. */
export function chunkPartName(baseName: string, index: number, ext = "mp3"): string {
  const dot = baseName.lastIndexOf(".");
  const base = dot > 0 ? baseName.slice(0, dot) : baseName;
  return `${base}.part${index + 1}.${ext}`;
}

/** اسم الملف بدون امتداده (لبناء أسماء الأجزاء). */
export function stripExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** جزء ناتج من التقسيم. */
export type LectureChunk = {
  /** رقم الجزء (صفر-indexed) — بيحفظ الترتيب. */
  index: number;
  /** الملف الصالح — دايماً MP3. */
  file: File;
  /** الاسم المُرفع — الامتداد في الآخر. */
  name: string;
};

/** تقدّم العملية. */
export type ChunkProgress = {
  /** 0..1 — نسبة تقدّم التحويل+التقسيم. */
  ratio: number;
  /** المرحلة الجارية — للرسالة في الواجهة. */
  stage: "extracting" | "splitting";
};
export const MP3_MIME = "audio/mpeg";

/** مدّة الملف بالثواني عبر ffprobe (أدق من الـ DOM، وبيشتغل للصيغ كلها). */
async function probeDuration(
  ffmpeg: FfmpegEngine,
  fileName: string,
): Promise<number | null> {
  try {
    const code = await ffmpeg.ffprobe([
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      fileName,
      "-o",
      "probe.txt",
    ]);
    if (code !== 0) return null;
    const raw = await ffmpeg.readFile("probe.txt");
    const text = new TextDecoder().decode(raw).trim();
    await ffmpeg.deleteFile("probe.txt").catch(() => false);
    const seconds = Number.parseFloat(text);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch {
    return null;
  }
}
/**
 * استخرج المسار الصوتي من الملف وحوّله لـ MP3.
 *
 * ⚠️ `-vn` بيشيل الفيديو، و`-ac 1` بيخلّي الصوت أحادي (الكلام
 * أحادي بطبيعته، فده بيوفّر نص الحجم)، و`-b:a 64k` بيخلي الحجم معقول.
 *
 * @returns اسم الملف الناتج داخل الـ FS الافتراضي (وعدد البايتات).
 */
async function extractToMp3(
  ffmpeg: FfmpegEngine,
  inputName: string,
): Promise<{ name: string; bytes: number }> {
  const outputName = "extracted.mp3";
  const code = await ffmpeg.exec([
    "-i",
    inputName,
    "-vn",
    "-ac",
    "1",
    "-b:a",
    `${AUDIO_BITRATE_KBPS}k`,
    "-map_metadata",
    "-1",
    outputName,
  ]);
  if (code !== 0) throw new Error(`ffmpeg_extract_exit_${code}`);
  const data = await ffmpeg.readFile(outputName);
  if (data.byteLength === 0) throw new Error("ffmpeg_extract_empty");
  return { name: outputName, bytes: data.byteLength };
}

/**
 * قسّم ملف MP3 صالح لأجزاء مدتها `CHUNK_SECONDS` بالثواني.
 *
 * ⚠️ **ليه `-ss` قبل `-i`:** ده بيخلي FFmpeg يقصّ بسرعة (بدون فك ترميز
 * كامل) — الفرق في السرعة كبير جداً على ملف ساعة. والمخرج من
 * `-c copy` بيطلع MP3 سليم لأن كل إطار مستقل.
 *
 * ⚠️ `-c copy` (نسخ من غير فك ترميز): الإطارات بتنسخ كما هي فمافيش
 * إعادة ترميز = مافيش فقد جودة + سريع. ونسخ الإطارات هو بالظبط اللي
 * بيضمن إن كل جزء **ملف MP3 مستقل وصالح**.
 *
 * ⚠️ **ضمان الحجم:** 64 kbps × 5 دقايق ≈ 2.4 ميجا — تحت السقف. بس
 * لو الملف الأصلي طلع أعلى من المتوقع (VBR غريب) بنقسم الجزء
 * الطويل لنصفين — عشان الحجم **مش** يقع في حد Vercel.
 */
async function splitMp3(
  ffmpeg: FfmpegEngine,
  mp3Name: string,
  durationSeconds: number,
  originalName: string,
  onProgress?: (progress: ChunkProgress) => void,
): Promise<LectureChunk[]> {
  const total = Math.max(1, Math.ceil(durationSeconds / CHUNK_SECONDS));
  const chunks: LectureChunk[] = [];

  /** قصّ جزء واحد بمدة محدّدة — بيرجّع البيانات (أو null لو فاضي). */
  async function cut(start: number, seconds: number): Promise<Uint8Array | null> {
    const partName = `part_${start}_${seconds}.mp3`;
    const code = await ffmpeg.exec([
      "-ss",
      String(start),
      "-i",
      mp3Name,
      "-t",
      String(seconds),
      "-c",
      "copy",
      partName,
    ]);
    if (code !== 0) throw new Error(`ffmpeg_split_exit_${code}`);
    const data = await ffmpeg.readFile(partName);
    await ffmpeg.deleteFile(partName).catch(() => false);
    if (data.byteLength === 0) return null;
    return data;
  }

  /** لو الجزء كبير أوي — نقسمه نصفين ونكرّر (حدود ضحلة). */
  async function cutRespectingLimit(
    start: number,
    seconds: number,
  ): Promise<Uint8Array[]> {
    const data = await cut(start, seconds);
    if (!data) return [];
    if (data.byteLength <= MAX_CHUNK_BYTES || seconds <= 5) return [data];
    const half = Math.max(1, Math.floor(seconds / 2));
    const first = await cutRespectingLimit(start, half);
    const second = await cutRespectingLimit(start + half, seconds - half);
    return [...first, ...second];
  }

  for (let i = 0; i < total; i++) {
    const start = i * CHUNK_SECONDS;
    const pieces = await cutRespectingLimit(start, CHUNK_SECONDS);

    for (const data of pieces) {
      const blob = new Blob([data as BlobPart], { type: MP3_MIME });
      const name = chunkPartName(originalName, chunks.length);
      chunks.push({
        index: chunks.length,
        file: new File([blob], name, { type: MP3_MIME }),
        name,
      });
    }

    onProgress?.({
      ratio: Math.min(1, (i + 1) / total),
      stage: "splitting",
    });
  }

  return chunks;
}
/**
 * ⭐ المدخل الرئيسي — حوّل الملف لأجزاء **صالحة** للتفريغ.
 *
 * ═══ السلوك حسب صيغة الملف ═══
 *   - MP3 / AAC  → تقسيم مباشر بـ `File.slice()` (آمن — الإطارات
 *                   مستقلة). **بدون** تحميل FFmpeg (سرعة).
 *   - أي صيغة أخرى (webm/mp4/m4a/wav/...) → استخراج الصوت بـ
 *                   FFmpeg.wasm ثم تقسيم الصوت.
 *
 * ⚠️ **ليه مش بنقسّم WebM/MP4 بـ `File.slice()` أبداً:** الفهرس
 * (Cues/Index) في الملف الأصلي، والجزء المقطوع مالوش فهرس — فالمزوّد
 * بيرفضه بـ 422. ده بالظبط الخطأ اللي شفناه.
 *
 * @param file         الملف الأصلي.
 * @param onProgress   تقدّم العملية (للواجهة).
 * @param forceFfmpeg  تجبيل مسار FFmpeg حتى لو الصيغة آمنة (للاختبار).
 */
export async function chunkLectureFile(
  file: File,
  onProgress?: (progress: ChunkProgress) => void,
  forceFfmpeg = false,
): Promise<LectureChunk[]> {
  const useFfmpeg = forceFfmpeg || needsAudioExtraction(file.name);

  /* ── المسار السريع: تقسيم آمن بدون FFmpeg ── */
  if (!useFfmpeg) {
    const ext = fileExtension(file.name);
    const total = Math.max(1, Math.ceil(file.size / MAX_CHUNK_BYTES));
    const chunks: LectureChunk[] = [];
    for (let i = 0; i < total; i++) {
      const start = i * MAX_CHUNK_BYTES;
      const end = Math.min(start + MAX_CHUNK_BYTES, file.size);
      const blob = await file.slice(start, end).arrayBuffer();
      const name = chunkPartName(file.name, i, ext);
      chunks.push({
        index: i,
        file: new File([blob], name, { type: file.type }),
        name,
      });
      onProgress?.({ ratio: (i + 1) / total, stage: "splitting" });
    }
    return chunks;
  }

  /* ── المسار الآمن: استخراج الصوت ثم تقسيمه ── */
  const ffmpeg = await loadFfmpeg((ratio) =>
    onProgress?.({ ratio: ratio * 0.3, stage: "extracting" }),
  );
  const { fetchFile } = await import("@ffmpeg/util");

  const inputName = "input.media";
  let extractedName: string | null = null;

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));

    /* ١) استخراج الصوت. */
    onProgress?.({ ratio: 0.1, stage: "extracting" });
    const extracted = await extractToMp3(ffmpeg, inputName);
    extractedName = extracted.name;

    /* ٢) مدّة الصوت — بالمحاولة الأولى (ffprobe) وبالملف الأصلي كخطة ب. */
    let duration = await probeDuration(ffmpeg, extracted.name);
    if (duration === null) {
      duration = await probeDuration(ffmpeg, inputName);
    }
    if (duration === null) {
      throw new Error("ffmpeg_unknown_duration");
    }

    /* ٣) التقسيم. */
    onProgress?.({ ratio: 0.35, stage: "splitting" });
    const chunks = await splitMp3(
      ffmpeg,
      extracted.name,
      duration,
      file.name,
      onProgress,
    );

    if (chunks.length === 0) throw new Error("ffmpeg_no_chunks");
    onProgress?.({ ratio: 1, stage: "splitting" });
    return chunks;
  } finally {
    /* ✅ تنظيف الـ FS الافتراضي — مهم مع الملفات الكبيرة. */
    for (const name of [inputName, extractedName, "probe.txt"]) {
      if (!name) continue;
      try {
        await ffmpeg.deleteFile(name);
      } catch {
        // الملف ممكن يكون مش موجود — وده كويس.
      }
    }
  }
}
